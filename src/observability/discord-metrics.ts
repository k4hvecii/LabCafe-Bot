/** Bounded, process-local aggregates: never retain request URLs, headers or bodies. */
export const REST_CATEGORIES = ['guild_read','channel_read','command_sync','interaction_response','identity_read','oauth_user','oauth_token','other'] as const;
export type RestCategory = typeof REST_CATEGORIES[number];
export type RestWindow = '15m' | '1h' | '24h' | '7d' | '30d';
export type NetworkFailure = 'timeout' | 'aborted' | 'network';
export const LATENCY_BUCKETS_MS = [5,10,25,50,100,250,500,1_000,2_500,5_000,10_000,15_000,30_000,60_000] as const;
const WINDOWS: Record<RestWindow, {resolutionMs:number;slots:number}> = {
  '15m':{resolutionMs:60_000,slots:15},'1h':{resolutionMs:60_000,slots:60},
  '24h':{resolutionMs:3_600_000,slots:24},'7d':{resolutionMs:3_600_000,slots:168},'30d':{resolutionMs:3_600_000,slots:720}
};
interface Aggregate {
  attempts:number;responses:number;successful:number;httpErrors:number;networkErrors:number;timeouts:number;aborted:number;
  durationSumMs:number;histogram:number[];statuses:Record<string,number>;categories:Record<string,number>;
  rateLimitEvents:number;globalRateLimitEvents:number;retryAfterSumMs:number;
}
const empty = ():Aggregate => ({attempts:0,responses:0,successful:0,httpErrors:0,networkErrors:0,timeouts:0,aborted:0,
  durationSumMs:0,histogram:Array.from({length:LATENCY_BUCKETS_MS.length+1},()=>0),statuses:{},categories:{},
  rateLimitEvents:0,globalRateLimitEvents:0,retryAfterSumMs:0});
function merge(target:Aggregate, source:Aggregate) {
  for(const key of ['attempts','responses','successful','httpErrors','networkErrors','timeouts','aborted','durationSumMs','rateLimitEvents','globalRateLimitEvents','retryAfterSumMs'] as const) target[key]+=source[key];
  source.histogram.forEach((count,index)=>{target.histogram[index]=(target.histogram[index]??0)+count;});
  for(const [key,value] of Object.entries(source.statuses))target.statuses[key]=(target.statuses[key]??0)+value;
  for(const [key,value] of Object.entries(source.categories))target.categories[key]=(target.categories[key]??0)+value;
}
function quantileUpperBound(histogram:readonly number[], q:number):number|null {
  const count=histogram.reduce((sum,n)=>sum+n,0);if(!count)return null;
  let cumulative=0;
  for(let i=0;i<histogram.length;i++){cumulative+=histogram[i]??0;if(cumulative>=Math.ceil(count*q))return LATENCY_BUCKETS_MS[i]??null;}
  return null;
}
export function isRestWindow(value:string):value is RestWindow {return Object.hasOwn(WINDOWS,value);}
export class DiscordRestMetrics {
  private readonly minutes=new Map<number,Aggregate>();
  private readonly hours=new Map<number,Aggregate>();
  private startedAt:number;
  private persistent=false;
  private gaps:[number,number][]=[];
  private latestObservationAt:number|null=null;
  constructor(readonly service:'bot'|'dashboard',private readonly clock:()=>number=Date.now,private readonly notify?:(code:string)=>void){this.startedAt=clock();}
  private buckets():Aggregate[] {
    const now=this.clock();this.latestObservationAt=now;
    const result:Aggregate[]=[];
    for(const [map,resolution,slots] of [[this.minutes,60_000,60],[this.hours,3_600_000,720]] as const){
      const key=Math.floor(now/resolution)*resolution;
      let bucket=map.get(key);
      if(!bucket){
        // Sweep only when entering a new time bucket, not on every API response.
        for(const timestamp of map.keys())if(timestamp<key-(slots-1)*resolution||timestamp>key)map.delete(timestamp);
        bucket=empty();map.set(key,bucket);
      }
      result.push(bucket);
    }
    return result;
  }
  attempt(category:RestCategory,durationMs:number,status:number|null,failure?:NetworkFailure):void {
    // Runtime validation keeps category cardinality finite even for JS callers.
    const safeCategory=REST_CATEGORIES.includes(category)?category:'other';
    const duration=Number.isFinite(durationMs)?Math.max(0,Math.min(durationMs,3_600_000)):0;
    const safeStatus=status!==null&&Number.isInteger(status)&&status>=100&&status<=599?status:null;
    for(const bucket of this.buckets()){
      bucket.attempts++;bucket.durationSumMs+=duration;
      const index=LATENCY_BUCKETS_MS.findIndex(limit=>duration<=limit);
      const slot=index<0?LATENCY_BUCKETS_MS.length:index;bucket.histogram[slot]=(bucket.histogram[slot]??0)+1;
      bucket.categories[safeCategory]=(bucket.categories[safeCategory]??0)+1;
      if(safeStatus!==null){bucket.responses++;bucket.statuses[String(safeStatus)]=(bucket.statuses[String(safeStatus)]??0)+1;
        if(safeStatus>=200&&safeStatus<400)bucket.successful++;if(safeStatus>=400)bucket.httpErrors++;
      }else{bucket.networkErrors++;if(failure==='timeout')bucket.timeouts++;if(failure==='aborted')bucket.aborted++;}
    }
    if(safeStatus===null||safeStatus>=400)try{this.notify?.(safeStatus===null?'discord_network_error':`discord_http_${safeStatus}`);}catch{}
  }
  rateLimited(global:boolean,retryAfterMs:number):void {
    const wait=Number.isFinite(retryAfterMs)?Math.max(0,Math.min(retryAfterMs,86_400_000)):0;
    for(const bucket of this.buckets()){bucket.rateLimitEvents++;if(global)bucket.globalRateLimitEvents++;bucket.retryAfterSumMs+=wait;}
    try{this.notify?.(global?'discord_global_rate_limit':'discord_route_rate_limit');}catch{}
  }
  exportState(){return {schemaVersion:1,service:this.service,startedAt:this.startedAt,savedAt:this.clock(),lastObservationAt:this.latestObservationAt,minutes:[...this.minutes],hours:[...this.hours],gaps:this.gaps};}
  markPersisted(){this.persistent=true;}
  restoreState(value:unknown):boolean {
    if(!value||typeof value!=='object')return false;
    const state=value as Record<string,unknown>;const now=this.clock();
    if(state.schemaVersion!==1||state.service!==this.service||typeof state.startedAt!=='number'||typeof state.savedAt!=='number'||state.startedAt>now||state.savedAt>now||!Array.isArray(state.minutes)||!Array.isArray(state.hours))return false;
    const decode=(rows:unknown[],resolution:number,slots:number)=>{
      const map=new Map<number,Aggregate>();if(rows.length>slots)throw new Error('Invalid metric state');
      for(const entry of rows){if(!Array.isArray(entry)||entry.length!==2||typeof entry[0]!=='number'||entry[0]%resolution!==0||entry[0]>now||entry[0]<now-slots*resolution)continue;
        if(!entry[1]||typeof entry[1]!=='object')throw new Error('Invalid metric state');
        const raw=entry[1] as Record<string,unknown>;const aggregate=empty();
        for(const key of ['attempts','responses','successful','httpErrors','networkErrors','timeouts','aborted','durationSumMs','rateLimitEvents','globalRateLimitEvents','retryAfterSumMs'] as const){const count=raw[key];if(typeof count!=='number'||!Number.isFinite(count)||count<0)throw new Error('Invalid metric state');aggregate[key]=count;}
        if(!Array.isArray(raw.histogram)||raw.histogram.length!==aggregate.histogram.length||!raw.histogram.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0))throw new Error('Invalid histogram');aggregate.histogram=[...raw.histogram] as number[];
        for(const key of ['statuses','categories'] as const){const entries=raw[key];if(!entries||typeof entries!=='object')throw new Error('Invalid metric state');for(const [label,count] of Object.entries(entries)){if((key==='statuses'?/^[1-5]\d\d$/.test(label):(REST_CATEGORIES as readonly string[]).includes(label))&&typeof count==='number'&&Number.isFinite(count)&&count>=0)aggregate[key][label]=count;}}
        map.set(entry[0],aggregate);
      }return map;
    };
    try{
      const minutes=decode(state.minutes,60000,60);const hours=decode(state.hours,3600000,720);
      this.minutes.clear();this.hours.clear();for(const [at,item] of minutes)this.minutes.set(at,item);for(const [at,item] of hours)this.hours.set(at,item);
      this.startedAt=state.startedAt;this.latestObservationAt=typeof state.lastObservationAt==='number'?state.lastObservationAt:null;
      this.gaps=Array.isArray(state.gaps)?state.gaps.filter((gap):gap is [number,number]=>Array.isArray(gap)&&gap.length===2&&gap.every(n=>typeof n==='number'&&Number.isFinite(n))&&gap[0]<=gap[1]&&gap[1]>now-30*86400000).slice(-63):[];
      if(now-state.savedAt>60000)this.gaps.push([state.savedAt,now]);this.persistent=true;return true;
    }catch{return false;}
  }
  snapshot(range:RestWindow='1h'){
    const now=this.clock();const {resolutionMs,slots}=WINDOWS[range];
    // Aligned buckets include the current partial interval. Bounds are explicit, not exact rolling timestamps.
    const start=Math.floor(now/resolutionMs)*resolutionMs-(slots-1)*resolutionMs;
    const map=resolutionMs===60_000?this.minutes:this.hours;const aggregate=empty();
    const series=[];
    for(let time=start;time<=now;time+=resolutionMs){
      const bucket=map.get(time);if(bucket)merge(aggregate,bucket);
      const unobserved=time+resolutionMs<=this.startedAt||this.gaps.some(([from,to])=>time>=from&&time+resolutionMs<=to);
      series.push({start:time,attempts:unobserved?null:bucket?.attempts??0,
        httpErrors:unobserved?null:bucket?.httpErrors??0,rateLimitEvents:unobserved?null:bucket?.rateLimitEvents??0,
        p50:unobserved?null:quantileUpperBound(bucket?.histogram??[],.5),p90:unobserved?null:quantileUpperBound(bucket?.histogram??[],.9),
        p95:unobserved?null:quantileUpperBound(bucket?.histogram??[],.95),p99:unobserved?null:quantileUpperBound(bucket?.histogram??[],.99)});
    }
    return {schemaVersion:1,service:this.service,generatedAt:now,startedAt:this.startedAt,lastObservationAt:this.latestObservationAt,
      range,windowStart:start,windowEnd:now,resolutionMs,storage:this.persistent?'persistent-backed-memory':'process-memory',historyResetsOnRestart:!this.persistent,
      coverageStart:Math.max(start,this.startedAt),...aggregate,
      countMeaning:'completed-http-attempts' as const,durationScope:'transport-to-response-headers' as const,
      rateLimitWaitMeaning:'announced-not-observed' as const,
      averageDurationMs:aggregate.attempts?aggregate.durationSumMs/aggregate.attempts:null,
      latency:{method:'histogram-upper-bound' as const,boundsMs:[...LATENCY_BUCKETS_MS,null],
        p50:quantileUpperBound(aggregate.histogram,.5),p90:quantileUpperBound(aggregate.histogram,.9),
        p95:quantileUpperBound(aggregate.histogram,.95),p99:quantileUpperBound(aggregate.histogram,.99),
        overflowCount:aggregate.histogram.at(-1)??0},
      queueSize:null,queueWaitMs:null,retryAttempts:null,series};
  }
}
