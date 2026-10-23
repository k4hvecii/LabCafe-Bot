import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {HostMetrics} from './host.js';
import {createHealthServer} from '../core/health.js';
const run=promisify(execFile);
const UNITS=['labcafe-bot.service','labcafe-dashboard.service','nginx.service','mongod.service'] as const;
export async function serviceSnapshot(){return Promise.all(UNITS.map(async unit=>{
 try{const {stdout}=await run('/usr/bin/systemctl',['show',unit,'--property=ActiveState,SubState,NRestarts,MemoryCurrent,ExecMainStartTimestamp,MainPID'],{timeout:2000,maxBuffer:8192,windowsHide:true});
  const fields=Object.fromEntries(stdout.split('\n').map(line=>{const index=line.indexOf('=');return [line.slice(0,index),line.slice(index+1)];}));
  return {unit,active:fields.ActiveState??'unknown',subState:fields.SubState??'unknown',restartCount:Number(fields.NRestarts)||0,memoryBytes:Number(fields.MemoryCurrent)||null,workerCount:Number(fields.MainPID)>0?1:0,lastStartedAt:fields.ExecMainStartTimestamp?Date.parse(fields.ExecMainStartTimestamp)||null:null};
 }catch{return {unit,active:'unavailable',subState:'unknown',restartCount:null,memoryBytes:null,workerCount:null,lastStartedAt:null};}
}));}
export async function startObserver(env:NodeJS.ProcessEnv=process.env){
 const token=env.LABCAFE_OBSERVABILITY_TOKEN??'';const port=Number(env.LABCAFE_OBSERVER_PORT??3002);
 if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid observer port');
 const host=new HostMetrics();let current:unknown=null;let at=0;
 const sample=async()=>{const [machine,services]=await Promise.all([host.snapshot(),serviceSnapshot()]);at=Date.now();current={schemaVersion:1,service:'observer',sampledAt:at,host:machine,services};};
 await sample();const timer=setInterval(()=>{void sample().catch(()=>{});},15000);timer.unref();
 const server=createHealthServer(()=>Date.now()-at<45000,{token,snapshot:()=>current});
 server.listen(port,'127.0.0.1');server.once('close',()=>clearInterval(timer));return server;
}
