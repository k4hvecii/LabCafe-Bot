import {HostMetrics} from './host.js';
import {ControlStore} from './store.js';
import {LocalObservationClient} from './local-client.js';
import {AlertEngine,DEFAULT_ALERTS} from './alerts.js';
import type {DiscordRestMetrics,RestWindow} from './discord-metrics.js';
import type {StartupTracker} from './startup.js';
export const asRecord=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
export class ControlCenter {
 readonly alarms:AlertEngine;private readonly host=new HostMetrics();private timer:ReturnType<typeof setInterval>|undefined;
 private hostSample:{at:number;value:Awaited<ReturnType<HostMetrics['snapshot']>>}|undefined;private hostPending:ReturnType<HostMetrics['snapshot']>|undefined;
 private async machine(){if(this.hostSample&&Date.now()-this.hostSample.at<15000)return this.hostSample.value;this.hostPending??=this.host.snapshot().then(value=>{this.hostSample={at:Date.now(),value};return value;}).finally(()=>{this.hostPending=undefined;});return this.hostPending;}
 private readonly pending=new Map<string,Promise<unknown>>();private readonly cached=new Map<string,{until:number;value:unknown}>();
 constructor(readonly store:ControlStore,readonly rest:DiscordRestMetrics,readonly startup:StartupTracker,private readonly bot?:LocalObservationClient,private readonly observer?:LocalObservationClient,readonly http?:DiscordRestMetrics,private readonly dependencies?:()=>{settingsReady:boolean}){this.alarms=new AlertEngine(store);try{rest.restoreState(store.loadMetrics('dashboard','discord_rest'));http?.restoreState(store.loadMetrics('dashboard','http'));}catch{}}
 start(){this.store.start();this.timer=setInterval(()=>{void this.snapshot().catch(()=>{});},15000);this.timer.unref();}
 async snapshot(range:RestWindow='1h'):Promise<unknown>{
  const cached=this.cached.get(range);if(cached&&cached.until>Date.now())return cached.value;
  const current=this.pending.get(range);if(current)return current;
  const task=(async()=>{
   const [bot,observer,machine]=await Promise.all([this.bot?.read(range)??{available:false,reason:'not-configured'},this.observer?.read(range)??{available:false,reason:'not-configured'},this.machine()]);
   const botRoot=asRecord(bot);const botData=asRecord(botRoot.data);const observerRoot=asRecord(observer);const observerData=asRecord(observerRoot.data);
   const runtime=asRecord(botData.runtime);
   if(botRoot.available===true&&botData.ready===true&&Array.isArray(runtime.memberships))try{this.store.confirmInstalls(new Set(runtime.memberships.filter((id):id is string=>typeof id==='string'&&/^\d{17,20}$/.test(id))));}catch{}
   if(Array.isArray(botData.events)&&typeof runtime.bootId==='string')for(const item of botData.events){const event=asRecord(item);
    if(typeof event.id==='number'&&typeof event.at==='number'&&typeof event.code==='string'&&typeof event.level==='string'&&['info','warning','error','critical'].includes(event.level))
     this.store.record({at:event.at,service:'bot',level:event.level as 'info'|'warning'|'error'|'critical',code:event.code,source:typeof event.eventKey==='string'?event.eventKey:runtime.bootId+':'+event.id,...(typeof event.traceId==='string'?{traceId:event.traceId}:{}),...(typeof event.command==='string'?{command:event.command}:{}),...(typeof event.durationMs==='number'?{durationMs:event.durationMs}:{})});
   }
   const host=observerRoot.available?asRecord(observerData.host):machine;const memory=asRecord(host.memory);const disk=asRecord(host.disk);
   const api=this.rest.snapshot(range);const settings=this.store.getConfig('alerts',DEFAULT_ALERTS);
   const http=this.http?.snapshot(range);const failures=http?Object.entries(http.statuses).reduce((sum,[status,count])=>sum+(Number(status)>=500?count:0),0):null;
   const conditions={bot_unreachable:this.bot?botRoot.available!==true:null,
    gateway_disconnected:botRoot.available===true?botData.gatewayConnected!==true:null,
    cpu_high:typeof host.cpuPercent==='number'?host.cpuPercent>settings.cpuPercent:null,
    memory_high:typeof memory.usedPercent==='number'?memory.usedPercent>settings.memoryPercent:null,
    disk_high:typeof disk.usedPercent==='number'?disk.usedPercent>settings.diskPercent:null,
    discord_api_errors:api.attempts>=20?(api.httpErrors+api.networkErrors)/api.attempts>.05:null,
    http_server_errors:http&&failures!==null&&http.attempts>=20?failures/http.attempts>.05:null};
   const alerts=this.alarms.evaluate(conditions);
   const sampledAt=Date.now();
   let dependencies:{settingsReady:boolean}|null=null;try{dependencies=this.dependencies?.()??null;}catch{dependencies={settingsReady:false};}
   try{this.store.snapshot('dashboard','rest',api);this.store.snapshot('dashboard','host',host);this.store.saveMetrics('dashboard','discord_rest',this.rest.exportState());this.rest.markPersisted();if(http){this.store.snapshot('dashboard','api',http);this.store.saveMetrics('dashboard','http',this.http!.exportState());this.http!.markPersisted();}if(botRoot.available)this.store.snapshot('bot','runtime',botData.runtime);}catch{}
   const value={schemaVersion:1,sampledAt,range,web:{discordRest:api,apiHealth:http?{...http,durationScope:'http-request-to-response-finish'}:null,startup:this.startup.snapshot()},bot,observer,
    host,hostSource:observerRoot.available?'observer':'dashboard-host',services:observerData.services??null,alerts,thresholds:settings,dependencies,
    events:this.store.events(),errors:this.store.groups(),audit:this.store.audits(),installations:this.store.installReport(),storage:{startedAt:this.store.startedAt,droppedEvents:this.store.dropped,detailDays:30,errorDays:30,auditDays:90,aggregateDays:366},
    capabilities:{readOnlyOperations:true,shell:false,mongodbUsed:false,queueDepth:false,retryCount:false,sessionReplay:false,heatmaps:false,externalUptime:false}};
   this.cached.set(range,{until:sampledAt+5000,value});return value;
  })().finally(()=>this.pending.delete(range));this.pending.set(range,task);return task;
 }
 invalidate(){this.cached.clear();}
 close(){if(this.timer)clearInterval(this.timer);try{this.store.saveMetrics('dashboard','discord_rest',this.rest.exportState());if(this.http)this.store.saveMetrics('dashboard','http',this.http.exportState());}catch{}this.store.close();}
}
