import {observeLogs} from '../core/logger.js';
import type {ControlStore,Service} from './store.js';
import {currentTraceId} from './tracing.js';
/** Store only known event codes, not arbitrary application messages or context blobs. */
export function connectLogEvents(service:Service,store:ControlStore){
 return observeLogs(record=>{
  if(!['warn','error','fatal','success'].includes(record.level))return;
  const module=String(record.module??'app').toLowerCase().replace(/[^a-z]/g,'').slice(0,20)||'app';
  const phase=record.context?.phase;
  const phaseAllowed=typeof phase==='string'&&['configuration','commands','database','health','gateway','command_sync','ready','stopping','stopped'].includes(phase);
  const code=record.level==='success'&&phaseAllowed?'startup_'+phase:'log_'+module+'_'+record.level;
  const trace=currentTraceId();
  store.record({at:Date.parse(record.time),service,level:record.level==='fatal'?'critical':record.level==='error'?'error':record.level==='warn'?'warning':'info',code,...(trace?{traceId:trace}:{})});
 });
}
