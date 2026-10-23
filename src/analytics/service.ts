import type { IncomingMessage } from 'node:http';
import { isIP } from 'node:net';

export interface AnalyticsConfig { url:string; websiteId:string; username:string; password:string; startedAt:string }
export function readAnalyticsConfig(env:NodeJS.ProcessEnv):AnalyticsConfig|undefined {
 if(!env.ANALYTICS_URL)return undefined;
 const url=new URL(env.ANALYTICS_URL);
 if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Analitik adresi yerel HTTP olmalı.');
 const websiteId=env.ANALYTICS_WEBSITE_ID??'';
 if(!/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(websiteId)||!env.ANALYTICS_USERNAME||!env.ANALYTICS_PASSWORD)throw new Error('Analitik yapılandırması eksik.');
 const startedAt=env.ANALYTICS_STARTED_AT??new Date().toISOString();
 if(!Number.isFinite(Date.parse(startedAt)))throw new Error('Analitik başlangıç tarihi geçersiz.');
 return {url:url.origin,websiteId,username:env.ANALYTICS_USERNAME,password:env.ANALYTICS_PASSWORD,startedAt};
}
export const trackedPaths=new Set(['/','/dashboard','/features/dashboard','/features/server-checks','/features/commands','/terms-of-service','/privacy-policy','/data-deletion']);
export const trackedEvents=new Set(['bot_add_click','dashboard_open','page_view','invite_click','installation_verified','dashboard_opened','server_selected','analysis_started','analysis_completed','setting_change_started','setting_change_confirmed','setting_change_succeeded','setting_change_failed','docs_click','feature_view','web_vitals']);
export interface TrafficEvent { path:string; event?:string; referrer:string; language:string; screen:string;utm?:Record<string,string>;performance?:Record<string,number> }
export function parseTrafficEvent(value:unknown,origin:string):TrafficEvent {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Geçersiz ölçüm.');
 const v=value as Record<string,unknown>;
 if(Object.keys(v).some(key=>!['path','event','referrer','language','screen','utm','performance'].includes(key))||typeof v.path!=='string'||!trackedPaths.has(v.path))throw new Error('Geçersiz ölçüm.');
 if(v.event!==undefined&&(typeof v.event!=='string'||!trackedEvents.has(v.event)))throw new Error('Geçersiz ölçüm.');
 let referrer='';
 if(typeof v.referrer==='string'&&v.referrer.length<=2048){try{const ref=new URL(v.referrer);if(['https:','http:'].includes(ref.protocol)&&ref.origin!==origin)referrer=ref.origin;}catch{/* No valid source. */}}
 let utm:Record<string,string>|undefined;let performance:Record<string,number>|undefined;
 if(v.utm!==undefined){if(!v.utm||typeof v.utm!=='object'||Array.isArray(v.utm))throw new Error('Geçersiz kampanya.');utm={};for(const [key,value] of Object.entries(v.utm)){if(!['source','medium','campaign'].includes(key)||typeof value!=='string'||!/^[a-z][a-z0-9_-]{0,63}$/i.test(value)||/\d{8,}/.test(value))throw new Error('Geçersiz kampanya.');utm[key]=value;}}
 if(v.performance!==undefined){if(v.event!=='web_vitals'||!v.performance||typeof v.performance!=='object'||Array.isArray(v.performance))throw new Error('Geçersiz performans.');performance={};for(const [key,value] of Object.entries(v.performance)){if(!['lcp','inp','cls','fcp','ttfb'].includes(key)||typeof value!=='number'||!Number.isFinite(value)||value<0||value>(key==='cls'?100:60000))throw new Error('Geçersiz performans.');performance[key]=value;}}
 return {path:v.path,...(typeof v.event==='string'?{event:v.event}:{}),...(utm?{utm}:{}),...(performance?{performance}:{}),referrer,
 language:typeof v.language==='string'&&/^[a-z]{2}(-[a-zA-Z]{2})?$/.test(v.language)?v.language:'',
 screen:typeof v.screen==='string'&&/^\d{1,5}x\d{1,5}$/.test(v.screen)?v.screen:''};
}
export function ignoreTraffic(req:IncomingMessage):boolean {
 return req.headers.dnt==='1'||req.headers['sec-gpc']==='1'||!req.headers['user-agent']||/bot|crawler|spider|headless|lighthouse|curl|wget|preview|facebookexternalhit/i.test(req.headers['user-agent']);
}
export interface DateRange { start:number; end:number; unit:'minute'|'hour'|'day'; startDate:string; endDate:string }
export function analyticsRange(params:URLSearchParams,now=Date.now()):DateRange {
 const today=new Date(now+3*3600_000).toISOString().slice(0,10);
 const period=params.get('period')??'7';
 if(['15m','1h','24h'].includes(period)){const duration=period==='15m'?900000:period==='1h'?3600000:86400000;const start=now-duration;return {start,end:now,unit:period==='24h'?'hour':'minute',startDate:new Date(start+10800000).toISOString().slice(0,10),endDate:today};}
 const endDate=period==='custom'?params.get('end')??'':today;
 const days=Number(period);const startDate=period==='custom'?params.get('start')??'':new Date(Date.parse(today+'T00:00:00+03:00')-(days-1)*86400_000+3*3600_000).toISOString().slice(0,10);
 const date=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
 if((period!=='custom'&&![1,7,30,90].includes(days))||!date(startDate)||!date(endDate)||endDate>today||startDate>endDate)throw new Error('Geçersiz tarih aralığı.');
 const start=Date.parse(startDate+'T00:00:00+03:00');const end=Math.min(now,Date.parse(endDate+'T23:59:59.999+03:00'));
 if(end-start>366*86400_000||end<start)throw new Error('Tarih aralığı en fazla 366 gün olabilir.');
 return {start,end,unit:startDate===endDate?'hour':'day',startDate,endDate};
}
export interface Summary { pageviews:number|null; visitors:number|null; visits:number|null; bounces:number|null; totaltime:number|null }
export interface Metric { label:string; count:number|null }
export interface Point { date:string; count:number|null }
export interface TrafficReport { configured:boolean; available:boolean; startedAt?:string; fetchedAt?:string; range?:DateRange; summary?:Summary; previous?:Summary; previousPageviews?:Point[]; comparison?:{start:number;end:number}; sessions?:Point[]; active?:number|null; pageviews?:Point[]; visitors?:Point[]; pages?:Metric[]; referrers?:Metric[]; devices?:Metric[]; browsers?:Metric[]; countries?:Metric[]; events?:Metric[] }
const record=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const count=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
const summary=(value:unknown):Summary=>{const v=record(value);return {pageviews:count(v.pageviews),visitors:count(v.visitors),visits:count(v.visits),bounces:count(v.bounces),totaltime:count(v.totaltime)};};
const metrics=(v:unknown):Metric[]=>Array.isArray(v)?v.slice(0,12).map(row=>{const item=record(row);return {label:typeof item.x==='string'?item.x.slice(0,200):'',count:count(item.y)};}):[];
const points=(v:unknown):Point[]=>Array.isArray(v)?v.slice(0,9000).map(row=>{const item=record(row);return {date:typeof item.x==='string'?item.x.slice(0,40):'',count:count(item.y)};}):[];
export class AnalyticsService {
 private token='';private tokenUntil=0;private loginRequest:Promise<void>|undefined;
 private cache=new Map<string,{until:number;value:TrafficReport}>();
 private pending=new Map<string,Promise<TrafficReport>>();
 private collecting=0;private circuitUntil=0;
 constructor(readonly config:AnalyticsConfig|undefined,private readonly request:typeof fetch=fetch){}
 private async login():Promise<void>{
  if(Date.now()<this.tokenUntil)return;
  this.loginRequest??=(async()=>{const response=await this.request(this.config!.url+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:this.config!.username,password:this.config!.password}),signal:AbortSignal.timeout(4000)});
   if(!response.ok)throw new Error('Analytics unavailable');const data=record(await response.json());if(typeof data.token!=='string')throw new Error('Analytics unavailable');this.token=data.token;this.tokenUntil=Date.now()+15*60_000;
  })();try{await this.loginRequest;}finally{this.loginRequest=undefined;}
 }
 private async get(path:string,retry=true):Promise<unknown>{
  await this.login();const res=await this.request(this.config!.url+path,{headers:{Authorization:'Bearer '+this.token},signal:AbortSignal.timeout(5000)});
  if(res.status===401&&retry){this.tokenUntil=0;return this.get(path,false);}if(!res.ok)throw new Error('Analytics unavailable');return res.json();
 }
 async report(range:DateRange):Promise<TrafficReport>{
  if(!this.config)return {configured:false,available:false};
  const key=JSON.stringify([Math.floor(range.start/30000),Math.floor(range.end/30000),range.unit]);const now=Date.now();const cached=this.cache.get(key);if(cached&&now<cached.until)return cached.value;
  const pending=this.pending.get(key);if(pending)return pending;
  if(this.pending.size>=3)return {configured:true,available:false};
  const task=(async()=>{try{
   const query=new URLSearchParams({startAt:String(range.start),endAt:String(range.end),unit:range.unit,timezone:'Europe/Istanbul',hostname:'eq.labcafe.xyz'});
   const base='/api/websites/'+this.config!.websiteId;
   const duration=range.end-range.start;const previousQuery=new URLSearchParams(query);previousQuery.set('startAt',String(Math.max(0,range.start-duration-1)));previousQuery.set('endAt',String(range.start-1));
   const result=await Promise.all([this.get(base+'/stats?'+query),this.get(base+'/pageviews?'+query),this.get(base+'/active'),...['path','referrer','device','browser','country','event'].map(type=>this.get(base+'/metrics?'+query+'&type='+type+'&limit=10')),this.get(base+'/stats?'+previousQuery).catch(()=>undefined),this.get(base+'/pageviews?'+previousQuery).catch(()=>undefined)]);
   const stats=record(result[0]);const series=record(result[1]);const current=summary(stats);
   if(typeof stats.pageviews!=='number'||typeof stats.visitors!=='number')throw new Error('Analytics response mismatch');
   const prior=record(result[9]);
   const report:TrafficReport={configured:true,available:true,startedAt:this.config!.startedAt,fetchedAt:new Date().toISOString(),range,summary:current,...(typeof prior.pageviews==='number'&&typeof prior.visitors==='number'?{previous:summary(prior)}:{}),previousPageviews:points(record(result[10]).pageviews),comparison:{start:Math.max(0,range.start-duration-1),end:range.start-1},sessions:points(series.sessions),active:count(typeof result[2]==='number'?result[2]:Array.isArray(result[2])?record(result[2][0]).x:record(result[2]).visitors),pageviews:points(series.pageviews),visitors:points(series.sessions),pages:metrics(result[3]),referrers:metrics(result[4]),devices:metrics(result[5]),browsers:metrics(result[6]),countries:metrics(result[7]),events:metrics(result[8])};
   this.cache.set(key,{until:Date.now()+30_000,value:report});if(this.cache.size>20)this.cache.delete(this.cache.keys().next().value!);return report;
  }catch{return {configured:true,available:false};}finally{this.pending.delete(key);}})();this.pending.set(key,task);return task;
 }
 async collect(event:TrafficEvent,ip:string,userAgent:string,origin:string):Promise<void>{
  if(!this.config||!isIP(ip)||this.collecting>=12||Date.now()<this.circuitUntil)return;
  this.collecting++;
  const campaign=new URLSearchParams(Object.entries(event.utm??{}).map(([key,value]):[string,string]=>['utm_'+key,value])).toString();
  try{const res=await this.request(this.config.url+'/api/send',{method:'POST',headers:{'Content-Type':'application/json','User-Agent':userAgent.slice(0,512)},body:JSON.stringify({type:event.performance?'performance':'event',payload:{website:this.config.websiteId,hostname:new URL(origin).hostname,url:event.path+(campaign?'?'+campaign:''),referrer:event.referrer,language:event.language,screen:event.screen,ip,...(event.performance?event.performance:event.event?{name:event.event}:{})}}),signal:AbortSignal.timeout(2000)});if(!res.ok)this.circuitUntil=Date.now()+15_000;
  }catch{this.circuitUntil=Date.now()+15_000;}finally{this.collecting--;}
 }
}
