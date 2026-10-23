import { performance } from 'node:perf_hooks';
import { createLogger, safeErrorName } from '../core/logger.js';
export type StartupPhase='configuration'|'commands'|'database'|'health'|'gateway'|'command_sync'|'ready'|'stopping'|'stopped';
type PhaseRecord={phase:StartupPhase;status:'running'|'succeeded'|'failed';durationMs:number|null;count?:number;error?:string};
const SAFE_ERRORS=new Set(['Error','TypeError','RangeError','SyntaxError','ConfigurationError','DiscordAPIError','HTTPError','AbortError','TimeoutError']);
export class StartupTracker {
  private readonly phases=new Map<StartupPhase,PhaseRecord>();
  private readonly starts=new Map<StartupPhase,number>();
  constructor(private readonly logger:ReturnType<typeof createLogger>,private readonly clock:()=>number=()=>performance.now()){}
  start(phase:StartupPhase,startedAt=this.clock()):void {
    this.starts.set(phase,startedAt);this.phases.set(phase,{phase,status:'running',durationMs:null});
    this.logger.debug('Başlangıç aşaması',{phase,status:'running'});
  }
  complete(phase:StartupPhase,count?:number):void {
    const started=this.starts.get(phase);if(started===undefined)return;
    const durationMs=Math.round(Math.max(0,this.clock()-started)*100)/100;
    const record:PhaseRecord={phase,status:'succeeded',durationMs,...(count!==undefined?{count}: {})};
    this.phases.set(phase,record);this.starts.delete(phase);
    this.logger.success('Aşama tamamlandı',{phase,durationMs,...(count!==undefined?{count}: {})});
  }
  fail(phase:StartupPhase,error:unknown):void {
    const started=this.starts.get(phase);if(started===undefined)return;
    const durationMs=Math.round(Math.max(0,this.clock()-started)*100)/100;
    const name=safeErrorName(error);const safeName=SAFE_ERRORS.has(name)?name:'Error';
    this.phases.set(phase,{phase,status:'failed',durationMs,error:safeName});this.starts.delete(phase);
    this.logger.error('Aşama başarısız',{phase,durationMs,error:safeName});
  }
  snapshot():PhaseRecord[]{return [...this.phases.values()].map(record=>({...record}));}
}
