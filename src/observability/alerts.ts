import type {ControlStore} from './store.js';
export interface AlertSettings {cpuPercent:number;memoryPercent:number;diskPercent:number;holdSeconds:number;cooldownSeconds:number;}
export const DEFAULT_ALERTS:AlertSettings={cpuPercent:85,memoryPercent:90,diskPercent:85,holdSeconds:120,cooldownSeconds:900};
export function parseAlertSettings(value:unknown):AlertSettings {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid thresholds');
 const v=value as Record<string,unknown>;if(Object.keys(v).sort().join(',')!==Object.keys(DEFAULT_ALERTS).sort().join(','))throw new Error('Invalid thresholds');
 for(const key of ['cpuPercent','memoryPercent','diskPercent'] as const)if(typeof v[key]!=='number'||!Number.isFinite(v[key])||v[key]<50||v[key]>99)throw new Error('Invalid threshold');
 for(const key of ['holdSeconds','cooldownSeconds'] as const)if(typeof v[key]!=='number'||!Number.isInteger(v[key])||v[key]<30||v[key]>86400)throw new Error('Invalid interval');
 return v as unknown as AlertSettings;
}
interface Alarm {code:string;since:number;active:boolean;lastNotified:number;mutedUntil:number;resolvedAt:number|null;}
export class AlertEngine {
 private readonly alarms=new Map<string,Alarm>();
 constructor(private readonly store:ControlStore){}
 evaluate(conditions:Record<string,boolean|null>,now=Date.now()){
  const config=this.store.getConfig('alerts',DEFAULT_ALERTS);
  for(const [code,condition] of Object.entries(conditions)){
   if(condition===null)continue;let alarm=this.alarms.get(code);
   if(condition){if(!alarm){alarm={code,since:now,active:false,lastNotified:0,mutedUntil:0,resolvedAt:null};this.alarms.set(code,alarm);}else if(alarm.since===0)alarm.since=now;
    if(!alarm.active&&now-alarm.since>=config.holdSeconds*1000){alarm.active=true;alarm.resolvedAt=null;}
    const muted=this.store.getConfig<Record<string,number>>('alert_mutes',{})[code]??0;alarm.mutedUntil=muted;
    if(alarm.active&&now>=muted&&(!alarm.lastNotified||now-alarm.lastNotified>=config.cooldownSeconds*1000)){
     this.store.record({at:now,service:'dashboard',level:'critical',code});alarm.lastNotified=now;
    }
   }else if(alarm){if(alarm.active){this.store.record({at:now,service:'dashboard',level:'info',code:code+'_resolved'});alarm.resolvedAt=now;}alarm.active=false;alarm.since=0;alarm.lastNotified=0;}
  }
  return this.snapshot();
 }
 snapshot(){return [...this.alarms.values()].map(alarm=>({...alarm}));}
 mute(code:string,until:number,actor:string){if(!this.alarms.has(code)||!/^[a-z_]{1,40}$/.test(code)||!Number.isFinite(until)||until<Date.now()||until>Date.now()+86400000)throw new Error('Invalid mute');const mutes=this.store.getConfig<Record<string,number>>('alert_mutes',{});this.store.setConfig('alert_mutes',{...mutes,[code]:until},actor);}
}
