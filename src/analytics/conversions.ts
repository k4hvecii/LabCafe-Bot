import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
export type ConversionName='login_success'|'bot_joined';
export class ConversionStore {
 private db:DatabaseSync;
 constructor(path:string){if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});this.db=new DatabaseSync(path);this.db.exec(`PRAGMA busy_timeout=1500;CREATE TABLE IF NOT EXISTS metric_counts(day TEXT NOT NULL,name TEXT NOT NULL,n INTEGER NOT NULL,PRIMARY KEY(day,name));CREATE TABLE IF NOT EXISTS metric_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);this.db.prepare('INSERT OR IGNORE INTO metric_meta VALUES(?,?)').run('started_at',new Date().toISOString());}
 record(name:ConversionName,now=Date.now()):void {
  if(!['login_success','bot_joined'].includes(name))throw new Error('Unknown metric');
  const day=new Date(now+3*3600_000).toISOString().slice(0,10);
  this.db.prepare('INSERT INTO metric_counts(day,name,n) VALUES(?,?,1) ON CONFLICT(day,name) DO UPDATE SET n=n+1').run(day,name);
  const cutoff=new Date(now-90*86400_000+3*3600_000).toISOString().slice(0,10);this.db.prepare('DELETE FROM metric_counts WHERE day<?').run(cutoff);
 }
 stats(start:string,end:string){const rows=this.db.prepare('SELECT name,SUM(n) AS total FROM metric_counts WHERE day>=? AND day<=? GROUP BY name').all(start,end);const get=(name:string)=>Number(rows.find(row=>row.name===name)?.total??0);return {loginSuccess:get('login_success'),botJoined:get('bot_joined'),startedAt:String(this.db.prepare('SELECT value FROM metric_meta WHERE key=?').get('started_at')?.value??'')};}
 close(){this.db.close();}
}
