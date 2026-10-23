import {readFile,writeFile,mkdir,appendFile,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {githubClient,planNotification,commitDiff,compareDiff,ref} from './github.mjs';
import {notification,REPOSITORY,sendWebhook,webhookURL,validatePayload} from './discord.mjs';

export function validatePlan(plan){
 if(!plan||!/^((development-[a-f0-9]{40})|(release-[1-9]\d{0,15})|(ci-failure-[1-9]\d{0,15}))$/.test(plan.key)||!['dev','release'].includes(plan.channel))throw new Error('invalid_plan');
 if((plan.channel==='release')!==plan.key.startsWith('release-'))throw new Error('invalid_plan_channel');
 validatePayload(plan.payload);return plan;
}
export function example(kind){
 if(!['beta','stable','rc','failure'].includes(kind))throw new Error('invalid_example');
 return notification({kind,version:kind==='beta'?'v0.1.0-beta.1':kind==='rc'?'v0.1.0-rc.1':kind==='stable'?'v0.1.0':undefined,published:true,example:true,ci:kind==='failure'?'failure':'success',url:`https://github.com/${REPOSITORY}/releases`,branch:'main',notes:'## Yeni özellikler\n- Örnek: ayar paneli.\n## Bilinen sorunlar\n- Örnek: canlı Discord kabul testi bekliyor.'});
}
const webhook=(env,channel)=>env[channel==='release'?'DISCORD_RELEASE_WEBHOOK_URL':'DISCORD_DEV_WEBHOOK_URL'];
async function output(env,key,value){if(env.GITHUB_OUTPUT)await appendFile(env.GITHUB_OUTPUT,key+'='+String(value)+'\n');}
export async function claim(plan,directory='.notification-state',owner='local'){
 validatePlan(plan);await mkdir(directory,{recursive:true});
 const file=resolve(directory,plan.key+'.json');
 try{await writeFile(file,JSON.stringify({key:plan.key,owner,reservedAt:new Date().toISOString()}),{flag:'wx'});return true;}
 catch(error){if(error.code==='EEXIST')return false;throw new Error('reservation_failed');}
}
export async function deliverClaimed(plan,env,{directory='.notification-state',fetchFn=fetch,sleep}={}){
 validatePlan(plan);
 const reservation=JSON.parse(await readFile(resolve(directory,plan.key+'.json'),'utf8'));
 if(reservation.key!==plan.key||reservation.finished||(env.GITHUB_ACTIONS==='true'&&reservation.owner!==env.GITHUB_RUN_ID+':'+env.GITHUB_RUN_ATTEMPT))throw new Error('invalid_reservation');
 // Atomic local attempt guard also rejects simultaneous calls within one runner.
 try{await writeFile(resolve(directory,plan.key+'.attempt'),'',{flag:'wx'});}catch{throw new Error('delivery_already_attempted');}
 // Mark attempted before POST. Do not retry uncertain delivery with the same local reservation.
 reservation.finished=true;await writeFile(resolve(directory,plan.key+'.json'),JSON.stringify(reservation));
 return sendWebhook(webhook(env,plan.channel),plan.payload,{fetchFn,...(sleep?{sleep}:{})});
}
export async function main(args=process.argv.slice(2),env=process.env){
 const [mode,...rest]=args;
 if(mode==='preview'){
  let payload;
  if(rest[0]==='--example'){
   payload=example(rest[1]);
   if(rest[2]==='--commit'){ref(rest[3]);const diff=await commitDiff(githubClient(env.GITHUB_TOKEN),rest[3]);const original=payload.embeds[0];const supplement=notification({kind:'preview',url:`https://github.com/${REPOSITORY}/commit/${rest[3]}`,diff});original.fields.push(...supplement.embeds[0].fields,{name:'Gerçek diff kaynağı',value:`https://github.com/${REPOSITORY}/commit/${rest[3]}`,inline:false});validatePayload(payload);}
  }
  else{
   const api=githubClient(env.GITHUB_TOKEN);
   let diff,url;
   if(rest[0]==='--commit'){ref(rest[1]);diff=await commitDiff(api,rest[1]);url=`https://github.com/${REPOSITORY}/commit/${rest[1]}`;}
   else if(rest[0]==='--compare'){
    const [base,head,...extra]=String(rest[1]??'').split('...');if(extra.length||!base||!head)throw new Error('invalid_comparison');
    diff=await compareDiff(api,base,head);url=`https://github.com/${REPOSITORY}/compare/${base}...${head}`;
   }else throw new Error('preview_requires_example_commit_or_compare');
   payload=notification({kind:'preview',url,diff,summary:'Önizleme · Discord’a gönderilmedi'});
  }
  console.log(JSON.stringify(payload,null,2));return;
 }
 if(mode==='plan'){
  if(env.GITHUB_REPOSITORY!==REPOSITORY)throw new Error('unexpected_repository');
  const event=JSON.parse(await readFile(env.GITHUB_EVENT_PATH,'utf8'));
  if(env.GITHUB_EVENT_NAME==='workflow_dispatch'&&env.GITHUB_REF!=='refs/heads/'+event.repository.default_branch)throw new Error('manual_notification_requires_default_branch');
  const plan=await planNotification(env.GITHUB_EVENT_NAME,event,githubClient(env.GITHUB_TOKEN));
  await output(env,'notify',!!plan);
  if(plan){validatePlan(plan);await output(env,'key',plan.key);await output(env,'plan',JSON.stringify(plan));}
  console.log(plan?'notification_planned':'event_filtered');return;
 }
 const plan=validatePlan(JSON.parse(env.PLAN_JSON??'null'));
 if(mode==='configured'){
  const value=webhook(env,plan.channel);if(value)webhookURL(value);
  await output(env,'configured',!!value);console.log(value?'webhook_configured':'webhook_not_configured_skipped');return;
 }
 if(mode==='clear-local'){await unlink(resolve('.notification-state',plan.key+'.json'));return;}
 if(mode==='claim'){if(!await claim(plan,'.notification-state',(env.GITHUB_RUN_ID??'local')+':'+(env.GITHUB_RUN_ATTEMPT??'1')))throw new Error('reservation_already_exists');console.log('notification_reserved');return;}
 if(mode==='send'){
  const result=await deliverClaimed(plan,env);console.log(JSON.stringify(result));
  if(!['sent','skipped'].includes(result.status))process.exitCode=1;return;
 }
 throw new Error('invalid_notification_mode');
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 main().catch(()=>{console.error('notification_operation_failed');process.exitCode=1;});
}
