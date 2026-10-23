import {REPOSITORY,diffSummary,notification,validatePayload} from './discord.mjs';
import {checkMetadata,parseTag,ciState,verifiedJobs,releaseStage} from './version.mjs';
const SHA=/^[a-f0-9]{40}$/;
export function ref(value){if(SHA.test(value))return value;parseTag(value);return value;}
export function githubClient(token,{fetchFn=fetch}={}){
 return {async get(path){
  if(!path.startsWith('/repos/'+REPOSITORY+'/')||/\/\.\.(?:\/|$)/.test(path))throw new Error('invalid_github_request');
  let response;
  try{response=await fetchFn('https://api.github.com'+path,{headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'LabCafe-notifications',...(token?{Authorization:'Bearer '+token}:{})},redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw new Error('github_request_failed');}
  if(!response.ok)throw new Error('github_http_'+response.status);
  try{return await response.json();}catch{throw new Error('github_invalid_response');}
 }};
}
const path='/repos/'+REPOSITORY+'/';
export async function commitDiff(api,head){
 ref(head);let files=[];let partial=false;
 for(let page=1;page<=3;page++){
  const result=await api.get(path+'commits/'+encodeURIComponent(head)+`?per_page=100&page=${page}`);
  files.push(...(result.files??[]));
  if((result.files??[]).length<100)break;
  if(page===3)partial=true;
 }
 return {...diffSummary(files,{partial}),scope:'commit'};
}
export async function compareDiff(api,base,head){
 ref(base);ref(head);
 const data=await api.get(path+'compare/'+encodeURIComponent(base)+'...'+encodeURIComponent(head));
 if(!['ahead','identical'].includes(data.status))throw new Error('comparison_not_ancestral');
 return {...diffSummary(data.files??[],{partial:(data.files??[]).length>=300}),scope:'compare'};
}
export async function verifiedCI(api,sha){
 if(!SHA.test(sha))throw new Error('invalid_commit');
 const workflow=await api.get(path+'actions/workflows/ci.yml');
 const response=await api.get(path+'actions/runs?head_sha='+sha+'&event=push&per_page=100');
 const runs=response.workflow_runs.filter(r=>r.workflow_id===workflow.id&&r.head_repository?.full_name===REPOSITORY);
 const state=ciState(runs,sha);if(state!=='success')return state;
 const run=[...runs].sort((a,b)=>b.id-a.id)[0];
 const jobs=await api.get(path+'actions/runs/'+run.id+'/jobs?per_page=100');
 return verifiedJobs(jobs.jobs)?'success':'failure';
}
async function metadataAt(api,sha){
 const [pkg,lock]=await Promise.all(['package.json','package-lock.json'].map(async name=>{
  const file=await api.get(path+'contents/'+name+'?ref='+sha);
  if(file.encoding!=='base64'||file.size>5000000)throw new Error('invalid_release_metadata');
  return JSON.parse(Buffer.from(file.content,'base64').toString('utf8'));
 }));return checkMetadata(pkg,lock);
}
function result(key,channel,input){return {key,channel,payload:notification(input)};}
export async function planNotification(eventName,event,api){
 if(event.repository?.full_name!==REPOSITORY)return null;
 const main=event.repository.default_branch;
 if(!/^[A-Za-z0-9_/-]{1,100}$/.test(main??''))throw new Error('invalid_default_branch');
 if(eventName==='workflow_run'){
  const incoming=event.workflow_run;
  if(!Number.isSafeInteger(incoming?.id))return null;
  const [run,workflow]=await Promise.all([api.get(path+'actions/runs/'+incoming.id),api.get(path+'actions/workflows/ci.yml')]);
  if(run.head_repository?.full_name!==REPOSITORY||run.workflow_id!==workflow.id||run.event!=='push'||run.status!=='completed'||!SHA.test(run.head_sha))return null;
  if(['failure','timed_out'].includes(run.conclusion))return result('ci-failure-'+run.id,'dev',{kind:'failure',branch:run.head_branch,url:`https://github.com/${REPOSITORY}/actions/runs/${run.id}`});
  if(run.conclusion!=='success'||run.head_branch!==main)return null;
  if(await verifiedCI(api,run.head_sha)!=='success')return null;
  const prs=await api.get(path+'commits/'+run.head_sha+'/pulls?per_page=100');
  const pr=prs.find(p=>p.merged_at&&p.base?.ref===main&&p.base?.repo?.full_name===REPOSITORY&&p.merge_commit_sha===run.head_sha);
  if(!pr)return null;// No announcement for each ordinary commit.
  return result('development-'+run.head_sha,'dev',{kind:'development',summary:pr.title,diffURL:`https://github.com/${REPOSITORY}/commit/${run.head_sha}`,branch:main,ci:'success',url:`https://github.com/${REPOSITORY}/pull/${Number(pr.number)}`,diff:await commitDiff(api,run.head_sha)});
 }
 if(eventName==='workflow_dispatch'){
  if(event.inputs?.confirmed!=='true'||!SHA.test(event.inputs?.sha??''))return null;
  const sha=event.inputs.sha;
  const comparison=await api.get(path+'compare/'+sha+'...'+encodeURIComponent(main));
  if(!['ahead','identical'].includes(comparison.status))throw new Error('commit_not_on_default_branch');
  if(await verifiedCI(api,sha)!=='success')return null;
  return result('development-'+sha,'dev',{kind:'development',summary:event.inputs.summary,branch:main,ci:'success',url:`https://github.com/${REPOSITORY}/commit/${sha}`,diff:await commitDiff(api,sha)});
 }
 if(eventName==='release'){
  if(event.action!=='published'||!Number.isSafeInteger(event.release?.id))return null;
  const release=await api.get(path+'releases/'+event.release.id);
  const tag=parseTag(release.tag_name);
  const commit=await api.get(path+'commits/'+encodeURIComponent(tag.tag));
  if(!SHA.test(commit.sha))throw new Error('invalid_release_commit');
  const metadata=await metadataAt(api,commit.sha);const stage=releaseStage(metadata.version,release);
  if(await verifiedCI(api,commit.sha)!=='success')throw new Error('release_ci_not_verified');
  let diff=await commitDiff(api,commit.sha);let url=`https://github.com/${REPOSITORY}/commit/${commit.sha}`;
  const previous=(await api.get(path+'releases?per_page=100')).filter(r=>r.id!==release.id&&!r.draft&&r.published_at&&r.published_at<release.published_at).sort((a,b)=>b.published_at.localeCompare(a.published_at));
  for(const old of previous){
   try{parseTag(old.tag_name);}catch{continue;}
   // Use only an ancestral release; different release branches cannot manufacture a comparison.
   const comparison=await api.get(path+'compare/'+encodeURIComponent(old.tag_name)+'...'+encodeURIComponent(tag.tag));
   if(['ahead','identical'].includes(comparison.status)){
    diff={...diffSummary(comparison.files??[],{partial:(comparison.files??[]).length>=300}),scope:'compare'};
    url=`https://github.com/${REPOSITORY}/compare/${encodeURIComponent(old.tag_name)}...${encodeURIComponent(tag.tag)}`;break;
   }
  }
  const plan=result('release-'+release.id,'release',{kind:stage,version:tag.tag,notes:release.body,published:true,ci:'success',url:`https://github.com/${REPOSITORY}/releases/tag/${encodeURIComponent(tag.tag)}`,diff});
  plan.payload.embeds[0].fields.push({name:'Ayrıntılı değişiklikler',value:url,inline:false});validatePayload(plan.payload);return plan;
 }
 return null;
}
