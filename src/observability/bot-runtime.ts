import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {currentTraceId} from './tracing.js';
import type {ControlStore} from './store.js';
const bounds=[5,10,25,50,100,250,500,1000,2500,5000,10000,30000,60000];
type Counter={attempted:number;succeeded:number;failed:number;rejected:number;durationSumMs:number;histogram:number[];lastAt:number|null};
const counter=():Counter=>({attempted:0,succeeded:0,failed:0,rejected:0,durationSumMs:0,histogram:Array.from({length:bounds.length+1},()=>0),lastAt:null});
export class BotRuntime {
 readonly bootId=randomUUID();readonly startedAt=Date.now();
 private reconnects=0;private lastDisconnectedAt:number|null=null;private lastHeartbeatAt:number|null=null;
 private lastSuccessAt:number|null=null;private joins=0;private leaves=0;private connected=false;private known=new Set<string>();private initialized=false;
 private readonly commands=new Map<string,Counter>();private readonly guilds=new Map<string,{commands:number;lastAt:number}>();
 constructor(private readonly commandNames:readonly string[],private readonly store?:ControlStore){}
 event(code:string,level:'info'|'warning'|'error'|'critical'='info',command?:string,durationMs?:number,traceId=currentTraceId()){
  this.store?.record({at:Date.now(),service:'bot',level,code,...(traceId?{traceId}:{}),...(command?{command}:{}),...(durationMs!==undefined?{durationMs}:{})});
 }
 initializeGuilds(ids:Iterable<string>){this.known=new Set(ids);this.initialized=true;}
 guildJoined(id:string){if(!this.initialized||this.known.has(id))return false;this.known.add(id);this.joins++;this.event('guild_joined');return true;}
 guildLeft(id:string,unavailable=false){if(unavailable||!this.initialized||!this.known.delete(id))return false;this.leaves++;this.event('guild_left');return true;}
 gateway(status:'connected'|'disconnected'|'reconnecting'){
  this.connected=status==='connected';if(status==='disconnected')this.lastDisconnectedAt=Date.now();if(status==='reconnecting')this.reconnects++;
  this.event('gateway_'+status,status==='connected'?'info':'warning');
 }
 heartbeat(){this.lastHeartbeatAt=Date.now();}
 commandStart(name:string,guildId:string|null,traceId?:string): (outcome:'succeeded'|'failed'|'rejected')=>void {
  if(!this.commandNames.includes(name))return ()=>{};
  let metric=this.commands.get(name);if(!metric){metric=counter();this.commands.set(name,metric);}metric.attempted++;
  const started=performance.now();let finished=false;
  return outcome=>{
   if(finished)return;finished=true;const duration=Math.max(0,performance.now()-started);const now=Date.now();
   metric[outcome]++;metric.lastAt=now;
   if(outcome!=='rejected'){metric.durationSumMs+=duration;const index=bounds.findIndex(bound=>duration<=bound);const slot=index<0?bounds.length:index;metric.histogram[slot]=(metric.histogram[slot]??0)+1;}
   if(outcome==='succeeded')this.lastSuccessAt=now;
   if(guildId&&/^\d{17,20}$/.test(guildId)&&(this.guilds.has(guildId)||this.guilds.size<1000)){
    const item=this.guilds.get(guildId)??{commands:0,lastAt:now};item.commands++;item.lastAt=now;this.guilds.set(guildId,item);
   }
   this.event('command_'+outcome,outcome==='failed'?'error':'info',name,Math.round(duration),traceId);
  };
 }
 snapshot(){return {schemaVersion:1,bootId:this.bootId,startedAt:this.startedAt,uptimeSeconds:process.uptime(),
  lastHeartbeatAt:this.lastHeartbeatAt,lastDisconnectedAt:this.lastDisconnectedAt,reconnects:this.reconnects,gatewayConnected:this.connected,
  lastSuccessAt:this.lastSuccessAt,guildCount:this.known.size,joinsSinceStart:this.joins,leavesSinceStart:this.leaves,
  memberships:[...this.known].slice(0,1000),membershipListComplete:this.known.size<=1000,
  commandScope:'since-process-start',histogramBoundsMs:bounds,commands:[...this.commands].map(([name,value])=>{
   const count=value.succeeded+value.failed;let seen=0;let p95:number|null=null;
   for(let i=0;i<value.histogram.length;i++){seen+=value.histogram[i]??0;if(count&&seen>=Math.ceil(count*.95)){p95=bounds[i]??null;break;}}
   const quantile=(q:number)=>{let cumulative=0;for(let i=0;i<value.histogram.length;i++){cumulative+=value.histogram[i]??0;if(count&&cumulative>=Math.ceil(count*q))return bounds[i]??null;}return null;};
   return {name,...value,histogram:[...value.histogram],averageMs:count?value.durationSumMs/count:null,p50UpperBoundMs:quantile(.5),p90UpperBoundMs:quantile(.9),p95UpperBoundMs:p95,p99UpperBoundMs:quantile(.99)};
  }),guilds:[...this.guilds].map(([id,value])=>({id,...value})),guildActivityLimit:1000,
  process:{rssBytes:process.memoryUsage().rss,heapUsedBytes:process.memoryUsage().heapUsed},
  version:process.env.LABCAFE_RELEASE_ID&&/^[\w.-]{1,80}$/.test(process.env.LABCAFE_RELEASE_ID)?process.env.LABCAFE_RELEASE_ID:null};}
}
