// Explicit synthetic local benchmark; no network or production database.
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {execFileSync} from 'node:child_process';
import {ControlStore} from '../../src/observability/store.ts';
if(!process.argv.includes('--benchmark'))throw new Error('Requires --benchmark');
const directory=await mkdtemp(join(tmpdir(),'labcafe-load-'));const path=join(directory,'operations.sqlite');const store=new ControlStore(path);
try{global.gc?.();const rss=process.memoryUsage().rss;const cpu=process.cpuUsage();let start=performance.now();const now=Date.now();
 for(let i=0;i<10000;i++){store.record({at:now,service:'bot',level:i%50?'info':'error',code:i%50?'command_succeeded':'command_failed',command:'ping',durationMs:10+i%100,source:'load:'+i});if(i%500===499)store.flush();}
 const ingestMs=performance.now()-start;start=performance.now();for(let i=0;i<1000;i++)store.snapshot('dashboard','host',{cpuPercent:i%100,memory:{usedPercent:40}},now-i*60000);const snapshotMs=performance.now()-start;
 const queries=[];for(let i=0;i<30;i++){start=performance.now();store.history('dashboard','host',now-30*86400000,now);store.events({level:'error'});store.groups();queries.push(performance.now()-start);}
 start=performance.now();const backup=join(directory,'backup.sqlite');store.backup(backup);const backupMs=performance.now()-start;
 const restore=join(directory,'restored.sqlite');execFileSync(process.execPath,['scripts/control-store.mjs','restore',backup,restore],{stdio:'pipe',windowsHide:true});const restored=new ControlStore(restore);let restoredCount;try{restoredCount=restored.counts('2020-01-01','2035-01-01').reduce((sum,x)=>sum+Number(x.n),0);}finally{restored.close();}
 const usage=process.cpuUsage(cpu);queries.sort((a,b)=>a-b);console.log(JSON.stringify({environment:{node:process.version,platform:process.platform},synthetic:true,events:10000,dropped:store.dropped,ingestMs,snapshot1000Ms:snapshotMs,queryMedianMs:queries[14],queryP95Ms:queries[28],backupMs,restoredCount,processCpuMs:(usage.user+usage.system)/1000,rssDeltaBytes:process.memoryUsage().rss-rss,limits:'Local run; RSS includes SQLite caches; no production throughput or long-duration leak guarantee.'},null,2));
}finally{store.close();await rm(directory,{recursive:true,force:true});}
