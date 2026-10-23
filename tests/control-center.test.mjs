import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ControlStore} from '../src/observability/store.ts';
import {BotRuntime} from '../src/observability/bot-runtime.ts';
import {LocalObservationClient} from '../src/observability/local-client.ts';
import {AlertEngine,parseAlertSettings,DEFAULT_ALERTS} from '../src/observability/alerts.ts';
import {setupPrototype,analysisPrototype,publicComponentPreview} from '../src/ui/cards.ts';
import {execFileSync} from 'node:child_process';

test('offline restore tool preserves committed WAL records and refuses an existing target',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'labcafe-wal-'));const source=join(directory,'live.sqlite');const target=join(directory,'restore.sqlite');const store=new ControlStore(source);
 try{store.record({at:Date.now(),service:'bot',level:'info',code:'wal_committed'});store.flush();execFileSync(process.execPath,['scripts/control-store.mjs','restore',source,target],{stdio:'pipe',windowsHide:true});const copy=new ControlStore(target);try{assert.equal(copy.events()[0].code,'wal_committed');}finally{copy.close();}assert.throws(()=>execFileSync(process.execPath,['scripts/control-store.mjs','restore',source,target],{stdio:'pipe',windowsHide:true}));}
 finally{store.close();await rm(directory,{recursive:true,force:true});}
});

test('host history spans the full selected interval and preserves sampled CPU peaks',()=>{
 const store=new ControlStore(':memory:');try{const start=Math.floor(Date.now()/60000)*60000-1000*60000;
  for(let i=0;i<1000;i++)store.snapshot('dashboard','host',{cpuPercent:i===12?99:20,memory:{usedPercent:40},network:{rxBytesPerSecond:i}},start+i*60000);
  store.snapshot('dashboard','host',{cpuPercent:10,memory:{usedPercent:30}},start+12*60000+15000);
  const result=store.history('dashboard','host',start,start+1000*60000,100);assert.ok(result.length<=100);assert.ok(result[0].at<start+20*60000);assert.ok(result.at(-1).at>start+980*60000);assert.equal(Math.max(...result.map(x=>x.data.cpuPeakPercent)),99);
 }finally{store.close();}
});

test('install verification requires fresh confirmed membership and deduplicates across requests',()=>{
 const store=new ControlStore(':memory:');try{const guild='123456789012345678';store.queueInstall(guild,{source:'community'});assert.equal(store.confirmInstalls(new Set()).length,0);assert.equal(store.confirmInstalls(new Set([guild])).length,1);store.queueInstall(guild);assert.equal(store.confirmInstalls(new Set([guild])).length,0);store.flush();assert.equal(store.events({code:'installation_verified'}).length,1);assert.ok(store.installReport().definition.includes('366-day'));
  store.queueInstall('223456789012345678');assert.equal(store.confirmInstalls(new Set(['223456789012345678']),Date.now()+301000).length,0);assert.throws(()=>store.queueInstall(guild,{source:'person123456789'}));
 }finally{store.close();}
});

test('graceful close drains both halves of the bounded event queue',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'labcafe-drain-'));try{const path=join(directory,'ops.sqlite');const store=new ControlStore(path);const at=Date.now();for(let i=0;i<900;i++)store.record({at,service:'bot',level:'info',code:'command_succeeded',source:'drain:'+i});store.close();const restored=new ControlStore(path);try{assert.equal(restored.counts('2020-01-01','2035-01-01')[0].n,900);}finally{restored.close();}}finally{await rm(directory,{recursive:true,force:true});}
});

test('operations events persist, deduplicate remote records and restore from a consistent backup',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'labcafe-control-'));let store;
 try{const path=join(directory,'control.sqlite');store=new ControlStore(path);
 const event={at:Date.now(),service:'bot',level:'error',code:'command_failed',traceId:'trace-1',command:'ping',source:'boot-1:1'};
 store.record(event);store.record(event);store.flush();assert.equal(store.events().length,1);assert.equal(store.groups()[0].count,1);
 store.review(1,'100000000000000001');assert.equal(store.events()[0].reviewed,1);assert.equal(store.audits().length,1);
 const backup=join(directory,'backup.sqlite');store.backup(backup);store.close();store=undefined;
 const restored=new ControlStore(backup);try{assert.equal(restored.events().length,1);restored.record(event);restored.flush();assert.equal(restored.events().length,1);}finally{restored.close();}
 }finally{store?.close();await rm(directory,{recursive:true,force:true});}
});

test('review only audits a real state transition and rejects invalid callers',()=>{
 const store=new ControlStore(':memory:');try{
  assert.equal(store.review(999,'100000000000000001'),false);assert.equal(store.audits().length,0);
  store.record({at:Date.now(),service:'bot',level:'error',code:'command_failed'});store.flush();const id=Number(store.events()[0].id);
  assert.throws(()=>store.review(id,'invalid'));assert.equal(store.events()[0].reviewed,0);
  assert.equal(store.review(id,'100000000000000001'),true);assert.equal(store.events()[0].reviewed,1);assert.equal(store.audits().length,1);
  assert.equal(store.review(id,'100000000000000001'),true);assert.equal(store.audits().length,1);
 }finally{store.close();}
});

test('retention keeps daily rollups while expiring details, and bounded queues drop excess events',()=>{
 const store=new ControlStore(':memory:');try{
 const old=Date.now()-40*86400000;store.record({at:old,service:'dashboard',level:'info',code:'oauth_started'});store.flush();store.retention();assert.equal(store.events({start:0}).length,0);assert.equal(store.counts('2020-01-01','2030-01-01').length,1);
 for(let i=0;i<1100;i++)store.record({at:Date.now(),service:'bot',level:'info',code:'command_succeeded'});assert.equal(store.dropped,100);
 store.flush();store.flush();assert.equal(store.counts('2020-01-01','2030-01-01').find(x=>x.code==='command_succeeded').n,1000);
 store.snapshot('bot','runtime',{token:'private-token',headers:{Authorization:'secret'},commands:[{name:'ping',attempted:3}],unsupported:'Bearer private-secret'});
 const history=store.history('bot','runtime',0,Date.now());const raw=JSON.stringify(history);assert.ok(!raw.includes('private'));assert.ok(!raw.includes('Authorization'));
 }finally{store.close();}
});

test('runtime excludes initial sync and unavailable guilds, and counts command outcomes once',()=>{
 const store=new ControlStore(':memory:');try{
 const runtime=new BotRuntime(['ping'],store);assert.equal(runtime.guildJoined('123456789012345678'),false);
 runtime.initializeGuilds(['123456789012345678']);assert.equal(runtime.guildJoined('123456789012345678'),false);
 assert.equal(runtime.guildLeft('123456789012345678',true),false);assert.equal(runtime.guildLeft('123456789012345678'),true);assert.equal(runtime.guildLeft('123456789012345678'),false);
 assert.equal(runtime.guildJoined('123456789012345678'),true);
 const end=runtime.commandStart('ping','123456789012345678','test-trace');end('succeeded');end('failed');runtime.commandStart('ping',null)('rejected');
 const snapshot=runtime.snapshot();assert.equal(snapshot.joinsSinceStart,1);assert.equal(snapshot.leavesSinceStart,1);assert.equal(snapshot.commands[0].attempted,2);assert.equal(snapshot.commands[0].failed,0);assert.equal(snapshot.commands[0].succeeded,1);assert.equal(snapshot.commands[0].rejected,1);
 store.flush();assert.ok(store.events().some(x=>x.traceId==='test-trace'));
 }finally{store.close();}
});

test('local observation client confines requests to loopback and rejects stale, oversized or secret payloads',async()=>{
 const token='test-observer-key-'.repeat(3);let calls=0;
 const client=new LocalObservationClient(3001,token,'bot',async(url,options)=>{calls++;assert.match(url,/^http:\/\/127\.0\.0\.1:3001\/metrics/);assert.equal(options.headers.Authorization,'Bearer '+token);return Response.json({service:'bot',sampledAt:Date.now(),ready:true,token:'private-token',runtime:{bootId:'boot-1',lastHeartbeatAt:Date.now(),commands:[]},extra:{secret:'private'}});});
 const [a,b]=await Promise.all([client.read(),client.read()]);assert.equal(calls,1);assert.equal(a,b);assert.equal(a.available,true);assert.ok(!JSON.stringify(a).includes('private'));
 assert.throws(()=>new LocalObservationClient(0,token,'bot'));
 for(const payload of [{service:'bot',sampledAt:Date.now()-60000},{service:'observer',sampledAt:Date.now()}]){
 const failed=await new LocalObservationClient(3001,token,'bot',async()=>Response.json(payload)).read();assert.equal(failed.available,false);}
 const tooLarge=await new LocalObservationClient(3001,token,'bot',async()=>new Response('x'.repeat(260000),{headers:{'Content-Type':'application/json'}})).read();assert.equal(tooLarge.available,false);
});

test('alarms apply hold, cooldown, mute, resolution and configuration validation',()=>{
 const store=new ControlStore(':memory:');try{
 const alarms=new AlertEngine(store);const now=Date.now();alarms.evaluate({cpu_high:true},now);assert.equal(alarms.snapshot()[0].active,false);
 alarms.evaluate({cpu_high:true},now+121000);assert.equal(alarms.snapshot()[0].active,true);store.flush();assert.equal(store.events({end:now+500000}).length,1);
 alarms.evaluate({cpu_high:true},now+122000);store.flush();assert.equal(store.events({end:now+500000}).length,1);
 alarms.evaluate({cpu_high:false},now+123000);assert.equal(alarms.snapshot()[0].active,false);assert.ok(alarms.snapshot()[0].resolvedAt);
 assert.throws(()=>parseAlertSettings({...DEFAULT_ALERTS,cpuPercent:0}));assert.throws(()=>parseAlertSettings({...DEFAULT_ALERTS,extra:1}));
 alarms.mute('cpu_high',Date.now()+3600000,'100000000000000001');assert.equal(store.audits().length,1);
 }finally{store.close();}
});

test('Components V2 prototypes validate without replacing live commands, with a small public preview',()=>{
 const setup=setupPrototype({guildId:'123456789012345678',missingPermissions:null,locale:'en'});const json=setup.components[0].toJSON();assert.equal(json.type,17);assert.ok(!('embeds'in setup));assert.deepEqual(setup.allowedMentions.parse,[]);
 const analysis=analysisPrototype({guildId:'123456789012345678',guildName:'Test @everyone',checks:null});assert.match(JSON.stringify(analysis.components[0].toJSON()),/Henüz kontrol/);
 assert.throws(()=>setupPrototype({guildId:'../unsafe',missingPermissions:[]}));
 const preview=publicComponentPreview('https://labcafe.xyz','123456789012345678');assert.ok(Buffer.byteLength(JSON.stringify(preview))<3000);assert.equal(preview.component.type,17);assert.ok(!JSON.stringify(preview).includes('token'));
});


test('saved REST state survives restart with honest downtime gaps and rejects corrupt snapshots',async()=>{
 const {DiscordRestMetrics}=await import('../src/observability/discord-metrics.ts');let now=Date.UTC(2026,9,22,10,0);
 const store=new ControlStore(':memory:');try{
 const first=new DiscordRestMetrics('bot',()=>now);first.attempt('guild_read',25,200);store.saveMetrics('bot','discord_rest',first.exportState());
 now+=5*60000;const restarted=new DiscordRestMetrics('bot',()=>now);assert.equal(restarted.restoreState(store.loadMetrics('bot','discord_rest')),true);
 restarted.attempt('guild_read',50,500);const report=restarted.snapshot('15m');assert.equal(report.attempts,2);assert.equal(report.historyResetsOnRestart,false);assert.ok(report.series.some(point=>point.start>now-5*60000&&point.start<now&&point.attempts===null));
 assert.equal(restarted.restoreState({schemaVersion:1,service:'bot',minutes:[[now,{token:'private'}]],hours:[],startedAt:now,savedAt:now}),false);assert.equal(restarted.snapshot('15m').attempts,2);
 }finally{store.close();}
});
