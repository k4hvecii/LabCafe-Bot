import {cpus,freemem,totalmem,loadavg,uptime,platform} from 'node:os';
import {statfs,readFile} from 'node:fs/promises';
export class HostMetrics {
 private previousCpu:{idle:number;total:number}|undefined;
 private previousNetwork:{at:number;rx:number;tx:number;errors:number}|undefined;
 private previousDisk:{at:number;read:number;write:number}|undefined;
 async snapshot(){
  const sampledAt=Date.now();let idle=0;let total=0;for(const cpu of cpus()){idle+=cpu.times.idle;total+=Object.values(cpu.times).reduce((a,b)=>a+b,0);}
  const previous=this.previousCpu;this.previousCpu={idle,total};const elapsed=previous?total-previous.total:0;
  const cpuPercent=previous&&elapsed>0?Math.max(0,Math.min(100,100*(1-(idle-previous.idle)/elapsed))):null;
  let disk:{totalBytes:number;availableBytes:number;usedPercent:number}|null=null;
  try{const data=await statfs(platform()==='win32'?(process.env.SystemDrive??'C:')+'/':'/');const bytes=data.blocks*data.bsize;const available=data.bavail*data.bsize;disk={totalBytes:bytes,availableBytes:available,usedPercent:bytes?100*(bytes-available)/bytes:0};}catch{}
  let network:{rxBytesPerSecond:number;txBytesPerSecond:number;errorsPerSecond:number}|null=null;
  let diskIO:{readBytesPerSecond:number;writeBytesPerSecond:number}|null=null;
  if(platform()==='linux')try{const text=await readFile('/proc/net/dev','utf8');let rx=0,tx=0,errors=0;
   for(const line of text.split('\n').slice(2)){const [name,values]=line.split(':');if(!name||!values||/^(lo|veth|docker|br-)/.test(name.trim()))continue;const fields=values.trim().split(/\s+/).map(Number);rx+=fields[0]??0;tx+=fields[8]??0;errors+=(fields[2]??0)+(fields[10]??0);}
   const prev=this.previousNetwork;if(prev&&sampledAt>prev.at){const seconds=(sampledAt-prev.at)/1000;network={rxBytesPerSecond:Math.max(0,rx-prev.rx)/seconds,txBytesPerSecond:Math.max(0,tx-prev.tx)/seconds,errorsPerSecond:Math.max(0,errors-prev.errors)/seconds};}this.previousNetwork={at:sampledAt,rx,tx,errors};
  }catch{}
  if(platform()==='linux')try{const text=await readFile('/proc/diskstats','utf8');let read=0,write=0;let found=false;
   for(const line of text.trim().split('\n')){const fields=line.trim().split(/\s+/);if(!/^(?:sd[a-z]+|vd[a-z]+|xvd[a-z]+|nvme\d+n\d+)$/.test(fields[2]??''))continue;found=true;read+=Number(fields[5]??0)*512;write+=Number(fields[9]??0)*512;}
   const previous=this.previousDisk;if(found&&previous&&sampledAt>previous.at){const seconds=(sampledAt-previous.at)/1000;diskIO={readBytesPerSecond:Math.max(0,read-previous.read)/seconds,writeBytesPerSecond:Math.max(0,write-previous.write)/seconds};}if(found)this.previousDisk={at:sampledAt,read,write};
  }catch{}
  return {sampledAt,scope:'host',platform:platform(),cpuCount:cpus().length,cpuPercent,memory:{totalBytes:totalmem(),availableBytes:freemem(),usedPercent:100*(totalmem()-freemem())/totalmem()},disk,network,diskIO,load:loadavg(),uptimeSeconds:uptime(),process:{rssBytes:process.memoryUsage().rss,heapUsedBytes:process.memoryUsage().heapUsed}};
 }
}
