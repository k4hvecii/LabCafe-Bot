import type {RestWindow} from './discord-metrics.js';
const EVENT_KEYS=new Set(['events','level','code','traceId','at','reviewed','durationMs','command','eventKey','memberships','membershipListComplete']);
const ALLOWED=new Set(['schemaVersion','service','sampledAt','ready','gatewayConnected','guildCount','startup','phase','status','durationMs','count','error','discordRest','generatedAt','startedAt','lastObservationAt','range','windowStart','windowEnd','resolutionMs','storage','historyResetsOnRestart','coverageStart','attempts','responses','successful','httpErrors','networkErrors','timeouts','aborted','durationSumMs','histogram','statuses','categories','rateLimitEvents','globalRateLimitEvents','retryAfterSumMs','countMeaning','durationScope','rateLimitWaitMeaning','averageDurationMs','latency','method','boundsMs','p50','p90','p95','p99','overflowCount','queueSize','queueWaitMs','retryAttempts','series','start','runtime','bootId','uptimeSeconds','lastHeartbeatAt','lastDisconnectedAt','reconnects','lastSuccessAt','joinsSinceStart','leavesSinceStart','commandScope','histogramBoundsMs','commands','name','attempted','succeeded','failed','rejected','lastAt','averageMs','p50UpperBoundMs','p90UpperBoundMs','p95UpperBoundMs','p99UpperBoundMs','guilds','id','guildActivityLimit','process','rssBytes','heapUsedBytes','version','gatewayPingMs','shards','state','pingMs','host','scope','platform','cpuCount','cpuPercent','memory','totalBytes','availableBytes','usedPercent','disk','network','rxBytesPerSecond','txBytesPerSecond','errorsPerSecond','diskIO','readBytesPerSecond','writeBytesPerSecond','load','services','unit','active','subState','restartCount','lastStartedAt','memoryBytes','workerCount','guild_read','channel_read','command_sync','interaction_response','identity_read','oauth_user','oauth_token','other']);
function safe(value:unknown,depth=0):unknown {
 if(depth>12)throw new Error('Invalid observation');
 if(value===null||typeof value==='boolean')return value;
 if(typeof value==='number')return Number.isFinite(value)?value:null;
 if(typeof value==='string')return /^[\p{L}\p{N}_ .:/-]{0,120}$/u.test(value)&&!/(Bearer|password|secret|token)/i.test(value)?value:null;
 if(Array.isArray(value))return value.slice(0,1000).map(item=>safe(item,depth+1));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).slice(0,300).filter(([key])=>ALLOWED.has(key)||EVENT_KEYS.has(key)||/^\d{3}$/.test(key)).map(([key,item])=>[key,safe(item,depth+1)]));
 return null;
}
export class LocalObservationClient {
 private readonly cache=new Map<string,{until:number;data:unknown}>();private readonly pending=new Map<string,Promise<unknown>>();
 constructor(private readonly port:number,private readonly token:string,private readonly service:'bot'|'observer',private readonly transport:typeof fetch=fetch){
  if(!Number.isInteger(port)||port<1||port>65535||!/^[\w-]{32,128}$/.test(token))throw new Error('Invalid observation configuration');
 }
 async read(range:RestWindow='1h'):Promise<unknown>{
  const cached=this.cache.get(range);if(cached&&cached.until>Date.now())return cached.data;
  const pending=this.pending.get(range);if(pending)return pending;
  const task=(async()=>{try{
   const response=await this.transport(`http://127.0.0.1:${this.port}/metrics?range=${range}`,{headers:{Authorization:'Bearer '+this.token},redirect:'error',signal:AbortSignal.timeout(2000)});
   if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw new Error('Unavailable');
   const reader=response.body?.getReader();if(!reader)throw new Error('Unavailable');const chunks:Uint8Array[]=[];let size=0;
   try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>256000)throw new Error('Too large');chunks.push(chunk.value);}}finally{await reader.cancel().catch(()=>{});}
   const raw:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(!raw||typeof raw!=='object'||!('service'in raw)||raw.service!==this.service||!('sampledAt'in raw)||typeof raw.sampledAt!=='number'||Math.abs(Date.now()-raw.sampledAt)>45000)throw new Error('Stale observation');
   if(this.service==='bot'&&'ready'in raw&&raw.ready===true){const runtime='runtime'in raw&&raw.runtime&&typeof raw.runtime==='object'?raw.runtime:null;const heartbeat=runtime&&'lastHeartbeatAt'in runtime?runtime.lastHeartbeatAt:null;if(typeof heartbeat!=='number'||Math.abs(Date.now()-heartbeat)>45000)throw new Error('Stale heartbeat');}
   const data={available:true,receivedAt:Date.now(),data:safe(raw)};this.cache.set(range,{until:Date.now()+5000,data});return data;
  }catch{const data={available:false,reason:'unavailable-or-stale',receivedAt:Date.now()};this.cache.set(range,{until:Date.now()+5000,data});return data;}
  finally{this.pending.delete(range);}})();this.pending.set(range,task);return task;
 }
}
