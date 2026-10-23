import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';
const context=new AsyncLocalStorage<string>();
export const currentTraceId=()=>context.getStore();
export const withTrace=<T>(action:()=>T,id=randomUUID()):T=>context.run(id,action);
