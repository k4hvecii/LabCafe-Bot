import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {deflateSync,inflateSync} from 'node:zlib';
export type Service='bot'|'dashboard'|'observer';
export type EventLevel='info'|'warning'|'error'|'critical';
export interface ControlEvent {id?:number;at:number;service:Service;level:EventLevel;code:string;traceId?:string;command?:string;durationMs?:number;source?:string;}
const SERVICES=new Set(['bot','dashboard','observer']);const LEVELS=new Set(['info','warning','error','critical']);
const clean=(v:unknown,depth=0):unknown=>{
 if(depth>10)return null;
 if(typeof v==='number')return Number.isFinite(v)?v:null;
 if(typeof v==='boolean'||v===null)return v;
 if(typeof v==='string')return /^[\p{L}\p{N}_ .:/+-]{0,120}$/u.test(v)&&!/(?:Bearer|Bot)\s/i.test(v)?v:null;
 if(Array.isArray(v))return v.slice(0,1000).map(x=>clean(x,depth+1));
 if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).slice(0,200).filter(([k])=>!/(token|authorization|cookie|password|secret|header|body|url|path|message)/i.test(k)&&/^[\w-]{1,80}$/.test(k)).map(([k,value])=>[k,clean(value,depth+1)]));
 return null;
};
/** A local, bounded operations store, separate from settings and Umami. */
export class ControlStore {
 private readonly db:DatabaseSync;private queue:ControlEvent[]=[];private timer:ReturnType<typeof setInterval>|undefined;
 readonly startedAt:number;dropped=0;
 private readonly remoteSources=new Set<string>();
 constructor(path:string){
  if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});
  this.db=new DatabaseSync(path);if(path!==':memory:')chmodSync(path,0o600);
  this.db.exec('PRAGMA cache_size=-2048;PRAGMA max_page_count=65536;PRAGMA journal_size_limit=4194304;PRAGMA wal_autocheckpoint=256;');
  this.db.exec(`PRAGMA journal_mode=WAL;PRAGMA busy_timeout=250;CREATE TABLE IF NOT EXISTS cc_events(id INTEGER PRIMARY KEY AUTOINCREMENT,at INTEGER,service TEXT,level TEXT,code TEXT,trace_id TEXT,command TEXT,duration REAL,reviewed INTEGER DEFAULT 0,source TEXT);CREATE INDEX IF NOT EXISTS cc_events_at ON cc_events(at);CREATE INDEX IF NOT EXISTS cc_events_filter ON cc_events(service,level,at);CREATE TABLE IF NOT EXISTS cc_snapshots(service TEXT,kind TEXT,at INTEGER,payload TEXT,PRIMARY KEY(service,kind,at));CREATE INDEX IF NOT EXISTS cc_snapshot_at ON cc_snapshots(at);CREATE TABLE IF NOT EXISTS cc_audit(id TEXT PRIMARY KEY,at INTEGER,actor TEXT,action TEXT,outcome TEXT);CREATE TABLE IF NOT EXISTS cc_config(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE IF NOT EXISTS cc_daily(day TEXT,service TEXT,code TEXT,n INTEGER,PRIMARY KEY(day,service,code));`);
  if(!this.db.prepare('PRAGMA table_info(cc_events)').all().some(row=>row.name==='source'))this.db.exec('ALTER TABLE cc_events ADD COLUMN source TEXT');
  this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS cc_event_source ON cc_events(source);CREATE TABLE IF NOT EXISTS cc_metric_state(service TEXT,kind TEXT,at INTEGER,payload BLOB,PRIMARY KEY(service,kind));');
  this.db.prepare('INSERT OR IGNORE INTO cc_config VALUES(?,?)').run('started_at',String(Date.now()));
  this.startedAt=Number(this.db.prepare('SELECT value FROM cc_config WHERE key=?').get('started_at')?.value)||Date.now();
  this.db.exec('CREATE TABLE IF NOT EXISTS cc_install_requests(id TEXT PRIMARY KEY,guild_id TEXT,at INTEGER,expires INTEGER,status TEXT,campaign TEXT);CREATE TABLE IF NOT EXISTS cc_verified_installs(guild_id TEXT PRIMARY KEY,at INTEGER,campaign TEXT);');
 }
 saveMetrics(service:Service,kind:'discord_rest'|'http',state:unknown){const text=JSON.stringify(state);if(text.length>4_000_000)throw new Error('Metric state too large');const payload=deflateSync(text,{level:1});this.db.prepare('INSERT OR REPLACE INTO cc_metric_state VALUES(?,?,?,?)').run(service,kind,Date.now(),payload);}
 loadMetrics(service:Service,kind:'discord_rest'|'http'):unknown{const row=this.db.prepare('SELECT payload FROM cc_metric_state WHERE service=? AND kind=?').get(service,kind);return row?.payload instanceof Uint8Array?JSON.parse(inflateSync(row.payload,{maxOutputLength:4_000_000}).toString('utf8')) as unknown:undefined;}
 queueInstall(guildId:string,campaign:Record<string,string>={}){
  if(!/^\d{17,20}$/.test(guildId)||Object.entries(campaign).some(([key,value])=>!['source','medium','campaign'].includes(key)||!/^[a-z][a-z0-9_-]{0,63}$/i.test(value)||/\d{8,}/.test(value)))throw new Error('Invalid installation');
  const pending=Number(this.db.prepare("SELECT COUNT(*) AS n FROM cc_install_requests WHERE status='pending' AND expires>?").get(Date.now())?.n??0);if(pending>=100)throw new Error('Installation verifier busy');
  const id=randomUUID();this.db.prepare('INSERT INTO cc_install_requests VALUES(?,?,?,?,?,?)').run(id,guildId,Date.now(),Date.now()+300000,'pending',JSON.stringify(campaign));return id;
 }
 confirmInstalls(present:ReadonlySet<string>,now=Date.now()){
  const confirmed:{id:string;guildId:string;campaign:Record<string,string>}[]=[];
  this.db.prepare("UPDATE cc_install_requests SET status='expired' WHERE status='pending' AND expires<?").run(now);
  const rows=this.db.prepare("SELECT * FROM cc_install_requests WHERE status='pending' AND expires>=? LIMIT 100").all(now);
  this.db.exec('BEGIN IMMEDIATE');
  try{for(const row of rows){const guildId=String(row.guild_id);if(!present.has(guildId))continue;
    const added=this.db.prepare('INSERT OR IGNORE INTO cc_verified_installs VALUES(?,?,?)').run(guildId,now,String(row.campaign));
    this.db.prepare('UPDATE cc_install_requests SET status=? WHERE id=?').run(added.changes?'confirmed':'duplicate',String(row.id));
    if(added.changes)confirmed.push({id:String(row.id),guildId,campaign:JSON.parse(String(row.campaign)) as Record<string,string>});
   }this.db.exec('COMMIT');
  }catch(error){this.db.exec('ROLLBACK');throw error;}
  for(const item of confirmed)this.record({at:now,service:'dashboard',level:'info',code:'installation_verified',source:'install:'+item.id});return confirmed;
 }
 installReport(){return {definition:'first-verified-installation-per-guild-within-366-day-retention',states:this.db.prepare('SELECT status,COUNT(*) AS count FROM cc_install_requests GROUP BY status').all(),campaigns:this.db.prepare('SELECT campaign,COUNT(*) AS count FROM cc_verified_installs GROUP BY campaign ORDER BY count DESC LIMIT 20').all()};}
 record(event:ControlEvent):void {
  if(!SERVICES.has(event.service)||!LEVELS.has(event.level)||!Number.isFinite(event.at)||!/^\w{1,64}$/.test(event.code))return;
  if(this.queue.length>=1000){this.dropped++;return;}
  const source=event.source??randomUUID();
  if(!/^[\w:-]{1,100}$/.test(source)||this.remoteSources.has(source))return;this.remoteSources.add(source);if(this.remoteSources.size>5000)this.remoteSources.delete(this.remoteSources.values().next().value!);
  this.queue.push({at:event.at,service:event.service,level:event.level,code:event.code,source,
   ...(event.traceId&&/^[\w-]{1,64}$/.test(event.traceId)?{traceId:event.traceId}:{}),
   ...(event.command&&/^[\p{L}\p{N}_-]{1,32}$/u.test(event.command)?{command:event.command}:{}),
   ...(typeof event.durationMs==='number'&&Number.isFinite(event.durationMs)?{durationMs:Math.max(0,event.durationMs)}:{})});
 }
 start():void{if(this.timer)return;this.timer=setInterval(()=>{try{this.flush();}catch{this.dropped+=this.queue.length;this.queue=[];}},5000);this.timer.unref();}
 flush():void {
  const batch=this.queue.splice(0,500);if(!batch.length)return;
  this.db.exec('BEGIN IMMEDIATE');
  try{const insert=this.db.prepare('INSERT OR IGNORE INTO cc_events(at,service,level,code,trace_id,command,duration,source) VALUES(?,?,?,?,?,?,?,?)');const count=this.db.prepare('INSERT INTO cc_daily VALUES(?,?,?,1) ON CONFLICT(day,service,code) DO UPDATE SET n=n+1');
   for(const event of batch){const result=insert.run(event.at,event.service,event.level,event.code,event.traceId??null,event.command??null,event.durationMs??null,event.source??null);if(result.changes)count.run(new Date(event.at).toISOString().slice(0,10),event.service,event.code);}
   this.db.exec('COMMIT');
  }catch(error){this.db.exec('ROLLBACK');for(const event of batch)if(event.source)this.remoteSources.delete(event.source);this.dropped+=batch.length;throw error;}
 }
 snapshot(service:Service,kind:'runtime'|'rest'|'host'|'api',payload:unknown,at=Date.now()):void {
  let value=clean(payload);
  if(kind==='host'&&value&&typeof value==='object'){
   const old=this.db.prepare('SELECT payload FROM cc_snapshots WHERE service=? AND kind=? AND at=?').get(service,kind,Math.floor(at/60000)*60000);
   const previous=old?JSON.parse(String(old.payload)) as Record<string,unknown>:{};const current=value as Record<string,unknown>;
   const peak=(a:unknown,b:unknown)=>typeof a==='number'&&typeof b==='number'?Math.max(a,b):typeof a==='number'?a:typeof b==='number'?b:null;
   current.cpuPeakPercent=peak(previous.cpuPeakPercent,current.cpuPercent);
   const memory=current.memory&&typeof current.memory==='object'?current.memory as Record<string,unknown>:{};
   current.memoryPeakPercent=peak(previous.memoryPeakPercent,memory.usedPercent);
  }
  const text=JSON.stringify(value);if(text.length>256_000)return;
  this.db.prepare('INSERT OR REPLACE INTO cc_snapshots VALUES(?,?,?,?)').run(service,kind,Math.floor(at/60_000)*60_000,text);
 }
 history(service:Service,kind:string,start:number,end:number,limit=720){
  const slots=Math.min(720,Math.max(1,limit));const width=Math.max(60000,Math.ceil((end-start)/slots));
  return this.db.prepare("WITH ranked AS (SELECT at,payload,ROW_NUMBER() OVER(PARTITION BY CAST((at-?)/? AS INTEGER) ORDER BY at DESC) AS position,MAX(json_extract(payload,'$.cpuPeakPercent')) OVER(PARTITION BY CAST((at-?)/? AS INTEGER)) AS cpuPeak,MAX(json_extract(payload,'$.memoryPeakPercent')) OVER(PARTITION BY CAST((at-?)/? AS INTEGER)) AS memoryPeak FROM cc_snapshots WHERE service=? AND kind=? AND at>=? AND at<=?) SELECT at,payload,cpuPeak,memoryPeak FROM ranked WHERE position=1 ORDER BY at LIMIT ?").all(start,width,start,width,start,width,service,kind,start,end,slots).map(row=>{
   const data=JSON.parse(String(row.payload)) as Record<string,unknown>;if(kind==='host'){data.cpuPeakPercent=row.cpuPeak;data.memoryPeakPercent=row.memoryPeak;}
   return {at:Number(row.at),data};
  });
 }
 events(filter:{service?:string;level?:string;code?:string;traceId?:string;after?:number;before?:number;limit?:number;start?:number;end?:number}={}){
  const conditions=['id>?','id<?','at>=?','at<=?'];const values:(string|number)[]=[filter.after??0,filter.before??Number.MAX_SAFE_INTEGER,filter.start??0,filter.end??Date.now()];
  for(const [key,column] of [['service','service'],['level','level'],['code','code'],['traceId','trace_id']] as const){if(filter[key]){conditions.push(column+'=?');values.push(filter[key]!);}}
  return this.db.prepare(`SELECT id,at,service,level,code,trace_id AS traceId,command,duration AS durationMs,reviewed,source AS eventKey FROM cc_events WHERE ${conditions.join(' AND ')} ORDER BY id DESC LIMIT ?`).all(...values,Math.min(100,Math.max(1,filter.limit??50)));
 }
 groups(start=Date.now()-86400000){return this.db.prepare("SELECT service,code,level,COUNT(*) AS count,MAX(at) AS lastAt FROM cc_events WHERE at>=? AND level IN ('error','critical','warning') GROUP BY service,code,level ORDER BY count DESC LIMIT 50").all(start);}
 counts(start:string,end:string){return this.db.prepare('SELECT day,service,code,n FROM cc_daily WHERE day>=? AND day<=? ORDER BY day LIMIT 5000').all(start,end);}
 audit(actor:string,action:string,outcome='succeeded',id=randomUUID()){
  if(!/^\d{17,20}$/.test(actor)||!/^\w{1,64}$/.test(action)||!['succeeded','failed','denied'].includes(outcome))throw new Error('Invalid audit');
  this.db.prepare('INSERT INTO cc_audit VALUES(?,?,?,?,?)').run(id,Date.now(),actor,action,outcome);return id;
 }
 audits(){return this.db.prepare('SELECT * FROM cc_audit ORDER BY at DESC LIMIT 100').all();}
 review(id:number,actor:string):boolean{
  if(!Number.isSafeInteger(id)||id<1||!/^\d{17,20}$/.test(actor))throw new Error('Invalid review');
  this.db.exec('BEGIN IMMEDIATE');try{
   const event=this.db.prepare('SELECT reviewed FROM cc_events WHERE id=?').get(id);
   if(!event){this.db.exec('COMMIT');return false;}
   if(!event.reviewed){this.db.prepare('UPDATE cc_events SET reviewed=1 WHERE id=?').run(id);this.audit(actor,'event_reviewed');}
   this.db.exec('COMMIT');return true;
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 getConfig<T>(key:string,fallback:T):T{const row=this.db.prepare('SELECT value FROM cc_config WHERE key=?').get(key);return row?JSON.parse(String(row.value)) as T:fallback;}
 setConfig(key:string,value:unknown,actor:string){this.db.exec('BEGIN IMMEDIATE');try{this.audit(actor,'config_updated');this.db.prepare('INSERT OR REPLACE INTO cc_config VALUES(?,?)').run(key,JSON.stringify(value));this.db.exec('COMMIT');}catch(error){this.db.exec('ROLLBACK');throw error;}}
 retention(now=Date.now()){
  this.flush();this.db.prepare("DELETE FROM cc_events WHERE at<? OR (level IN ('error','critical') AND at<?)").run(now-30*86400000,now-30*86400000);
  this.db.prepare('DELETE FROM cc_events WHERE id NOT IN (SELECT id FROM cc_events ORDER BY id DESC LIMIT 50000)').run();
  this.db.prepare('DELETE FROM cc_snapshots WHERE at<?').run(now-30*86400000);
  this.db.prepare('DELETE FROM cc_snapshots WHERE rowid NOT IN (SELECT rowid FROM cc_snapshots ORDER BY at DESC LIMIT 50000)').run();
  this.db.prepare('DELETE FROM cc_audit WHERE at<?').run(now-90*86400000);this.db.prepare('DELETE FROM cc_daily WHERE day<?').run(new Date(now-366*86400000).toISOString().slice(0,10));
  this.db.prepare('DELETE FROM cc_install_requests WHERE at<?').run(now-30*86400000);this.db.prepare('DELETE FROM cc_verified_installs WHERE at<?').run(now-366*86400000);
 }
 backup(path:string){while(this.queue.length)this.flush();this.db.prepare('VACUUM INTO ?').run(path);}
 close(){if(this.timer)clearInterval(this.timer);try{while(this.queue.length)this.flush();}finally{this.db.close();}}
}



