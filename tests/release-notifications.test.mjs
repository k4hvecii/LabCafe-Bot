import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {parseVersion,parseTag,releaseStage,checkMetadata,ciState,verifiedJobs,REQUIRED_JOBS,readMetadata} from '../scripts/release/version.mjs';
import {safeText,diffSummary,notification,releaseNotes,sendWebhook,webhookURL,validatePayload,REPOSITORY} from '../scripts/release/discord.mjs';
import {githubClient,planNotification,commitDiff,compareDiff,verifiedCI} from '../scripts/release/github.mjs';
import {claim,deliverClaimed,validatePlan,example,main} from '../scripts/release/notify.mjs';
import {prepareVersion,notesFromSubjects} from '../scripts/release/manage.mjs';

const sha='a'.repeat(40),oldSHA='b'.repeat(40),base='/repos/'+REPOSITORY+'/';
const version='0.1.0-beta.1';
const published=(v=version)=>({id:10,tag_name:'v'+v,draft:false,prerelease:v.includes('-'),published_at:'2026-10-23T10:00:00Z',body:'## Yeni özellikler\n- Ayar yönetimi.\n## Bilinen sorunlar\n- Canlı testler bekliyor.'});
const files=[{filename:'src/commands/settings.ts',additions:12,deletions:4,patch:'MUST_NOT_APPEAR'},{filename:'tests/settings.test.mjs',additions:5,deletions:1},{filename:'.env',additions:1,deletions:0,patch:'PRIVATE_DATA'}];
const url='https://github.com/'+REPOSITORY+'/commit/'+sha;
const webhook='https://discord.com/api/webhooks/'+'1'.repeat(18)+'/'+'x'.repeat(60);
const event={repository:{full_name:REPOSITORY,default_branch:'main'},workflow_run:{id:20}};
function fixture(overrides={}){
 const state={run:{id:20,run_attempt:1,head_sha:sha,event:'push',status:'completed',conclusion:'success',head_branch:'main',workflow_id:7,head_repository:{full_name:REPOSITORY}},jobs:REQUIRED_JOBS.map(name=>({name,status:'completed',conclusion:'success'})),release:published(),pkgVersion:version,lockVersion:version,prs:[{number:2,title:'feat: Ayar yönetimi',merged_at:'2026-10-23T09:00:00Z',merge_commit_sha:sha,base:{ref:'main',repo:{full_name:REPOSITORY}}}],previous:[],comparison:{status:'ahead',files},...overrides};const calls=[];
 const api={async get(path){calls.push(path);if(!path.startsWith(base))throw new Error('unexpected_path');const p=path.slice(base.length);
  if(p==='actions/workflows/ci.yml')return {id:7};
  if(p.startsWith('actions/runs?'))return {workflow_runs:state.runs??[state.run]};
  if(p==='actions/runs/20')return state.run;
  if(p.startsWith('actions/runs/20/jobs'))return {jobs:state.jobs};
  if(p.startsWith('commits/'+sha+'/pulls'))return state.prs;
  if(p.startsWith('commits/'))return {sha,files};
  if(p==='releases/10')return state.release;
  if(p.startsWith('releases?'))return state.previous;
  if(p.startsWith('compare/'))return state.comparison;
  if(p.startsWith('contents/')){const lock=p.includes('package-lock');const v=lock?state.lockVersion:state.pkgVersion;return {encoding:'base64',size:100,content:Buffer.from(JSON.stringify(lock?{version:v,packages:{'':{version:v}}}:{version:v})).toString('base64')};}
  throw new Error('unexpected_fixture_path');
 }};return {state,api,calls};
}
const plan=()=>({key:'development-'+sha,channel:'dev',payload:notification({kind:'development',url,ci:'success',diff:diffSummary(files)})});

test('SemVer channels classify only with genuine publication evidence',()=>{
 for(const [v,stage] of [['0.1.0-beta.1','beta'],['0.1.0-rc.1','rc'],['0.1.0','stable'],['0.1.1','stable']]){assert.equal(releaseStage(v), 'development');assert.equal(releaseStage(v,published(v)),stage);assert.equal(parseTag('v'+v).version,v);}
 assert.equal(releaseStage('0.1.0-dev.0'),'development');assert.equal(releaseStage('1.0.0'),'development');assert.throws(()=>releaseStage('0.1.0-dev.0',published('0.1.0-dev.0')));
 for(const v of ['v0.1.0','01.1.0','0.1','0.1.0-alpha.1','0.1.0-beta.01','0.1.0-rc','0.1.0+unsafe','1.0.0\n'])assert.throws(()=>parseVersion(v));
 for(const tag of ['0.1.0','v0.1','v0.1.0-beta.01','../../main'])assert.throws(()=>parseTag(tag));
});
test('drafts, inconsistent tags and wrong prerelease flags never become stable',()=>{
 for(const bad of [{draft:true},{published_at:null},{id:0},{tag_name:'v0.2.0'},{prerelease:false}])assert.throws(()=>releaseStage(version,{...published(),...bad}));
 assert.throws(()=>releaseStage('0.1.0',{...published('0.1.0'),prerelease:true}));
});
test('package and lockfile remain one consistent version source; preparation has no git side effects',async()=>{
 assert.equal((await readMetadata()).version,JSON.parse(await readFile('package.json','utf8')).version);assert.equal((await readMetadata()).stage,'development');
 assert.throws(()=>checkMetadata({version:'1.0.0'},{version:'1.0.0',packages:{'':{version:'0.1.0'}}}));
 const dir=await mkdtemp(join(tmpdir(),'labcafe-version-'));try{const root=pathToFileURL(dir+'/');await writeFile(new URL('package.json',root),JSON.stringify({version:'1.0.0',private:true}));await writeFile(new URL('package-lock.json',root),JSON.stringify({version:'1.0.0',packages:{'':{version:'1.0.0'}}}));const status=await prepareVersion(version,root);assert.equal(status.version,version);assert.equal(status.stage,'development');assert.equal(JSON.parse(await readFile(new URL('package.json',root),'utf8')).private,true);await assert.rejects(readFile(join(dir,'.git')));}finally{await rm(dir,{recursive:true,force:true});}
});
test('pending or failing newest CI cannot be hidden by older successful runs',()=>{
 const run={id:1,head_sha:sha,event:'push',status:'completed',conclusion:'success'};
 assert.equal(ciState([],sha),'missing');assert.equal(ciState([run],sha),'success');assert.equal(ciState([run,{...run,id:2,status:'queued',conclusion:null}],sha),'pending');assert.equal(ciState([run,{...run,id:2,conclusion:'failure'}],sha),'failure');assert.equal(ciState([{...run,event:'pull_request'}],sha),'missing');assert.equal(verifiedJobs([{name:REQUIRED_JOBS[0],status:'completed',conclusion:'success'}]),false);
});
test('CI validation requires the real CI workflow, exact SHA, own repository and both OS jobs',async()=>{
 for(const mutate of [s=>s.jobs.pop(),s=>s.run.status='in_progress',s=>s.run.conclusion='failure',s=>s.run.workflow_id=99,s=>s.run.head_repository={full_name:'outsider/repo'}]){const f=fixture();mutate(f.state);assert.notEqual(await verifiedCI(f.api,sha),'success');}
 const f=fixture();assert.equal(await verifiedCI(f.api,sha),'success');
});
test('only completed failures produce a failure notification, with no success claim',async()=>{
 const f=fixture();f.state.run.conclusion='failure';const p=await planNotification('workflow_run',event,f.api);assert.equal(p.key,'ci-failure-20');assert.equal(p.payload.embeds[0].title,'Test başarısız');assert.doesNotMatch(JSON.stringify(p),/CI başarılı/);f.state.run.status='in_progress';assert.equal(await planNotification('workflow_run',event,f.api),null);f.state.run.status='completed';f.state.run.conclusion='cancelled';assert.equal(await planNotification('workflow_run',event,f.api),null);
});
test('ordinary commits, fork PR runs and development branches are filtered without secret access',async()=>{
 for(const mutate of [s=>s.prs=[],s=>s.run.head_repository={full_name:'outsider/repo'},s=>s.run.event='pull_request',s=>s.run.head_branch='feature/test']){const f=fixture();mutate(f.state);assert.equal(await planNotification('workflow_run',event,f.api),null);}
 const f=fixture();assert.equal(await planNotification('pull_request_target',event,f.api),null);assert.equal(await planNotification('workflow_run',{...event,repository:{full_name:'elsewhere/repo'}},f.api),null);
});
test('verified merged PR and approved manual development share a canonical deduplication key',async()=>{
 const f=fixture();const a=await planNotification('workflow_run',event,f.api);const b=await planNotification('workflow_dispatch',{repository:event.repository,inputs:{sha,confirmed:'true',summary:'Önemli iyileştirme'}},f.api);assert.equal(a.key,b.key);assert.equal(a.channel,'dev');assert.ok(a.payload.embeds[0].fields.some(f=>f.value.includes('/commit/'+sha)));assert.match(JSON.stringify(a),/18/);assert.doesNotMatch(JSON.stringify(a),/MUST_NOT_APPEAR|PRIVATE_DATA|\.env/);
 assert.equal(await planNotification('workflow_dispatch',{repository:event.repository,inputs:{sha,confirmed:'false'}},f.api),null);
 f.state.run.status='queued';assert.equal(await planNotification('workflow_dispatch',{repository:event.repository,inputs:{sha,confirmed:'true'}},f.api),null);
});
test('published Beta, RC and Stable validate metadata and CI at the resolved tag commit',async()=>{
 for(const [v,kind] of [[version,'Beta yayımlandı'],['0.1.0-rc.1','Sürüm adayı yayımlandı'],['0.1.0','Stable yayımlandı']]){
  const f=fixture({release:published(v),pkgVersion:v,lockVersion:v});const p=await planNotification('release',{repository:event.repository,action:'published',release:{id:10}},f.api);assert.equal(p.key,'release-10');assert.equal(p.channel,'release');assert.equal(p.payload.embeds[0].title,kind);assert.match(JSON.stringify(p),/Bilinen sorunlar/);assert.ok(f.calls.some(p=>p.includes('contents/package.json?ref='+sha)));assert.match(JSON.stringify(p),/Commit değişiklikleri/);
 }
});
test('no Release event, a draft, a mismatched package or incomplete CI cannot manufacture a release',async()=>{
 assert.throws(()=>notification({kind:'stable',url}),/evidence/);
 const f=fixture();assert.equal(await planNotification('release',{repository:event.repository,action:'created',release:{id:10}},f.api),null);
 for(const change of [s=>s.release.draft=true,s=>s.lockVersion='0.2.0',s=>s.run.status='queued',s=>s.release.prerelease=false]){const x=fixture();change(x.state);await assert.rejects(planNotification('release',{repository:event.repository,action:'published',release:{id:10}},x.api));}
});
test('release comparisons use a real previous ancestral release and expose a GitHub compare link',async()=>{
 const f=fixture({previous:[{id:9,tag_name:'v0.1.0-beta.0',draft:false,published_at:'2026-10-22T10:00:00Z'}]});const p=await planNotification('release',{repository:event.repository,action:'published',release:{id:10}},f.api);assert.match(JSON.stringify(p),/compare\/v0.1.0-beta.0\.\.\.v0.1.0-beta.1/);assert.match(JSON.stringify(p),/Karşılaştırma/);
});
test('Git Diff counts are real metadata; private paths, author identities and raw patches are absent',()=>{
 const diff=diffSummary([...files,{filename:'data/users.json',additions:1,deletions:0},{filename:'src/private/credentials.ts',additions:2,deletions:0},{filename:'src/name@example.com.ts',additions:0,deletions:0},{filename:'src/ok.ts',additions:2,deletions:0,author:'PERSON'}]);assert.equal(diff.additions,23);assert.equal(diff.deletions,5);assert.deepEqual(diff.names,['src/commands/settings.ts','tests/settings.test.mjs','src/ok.ts']);assert.doesNotMatch(JSON.stringify(diff),/patch|PRIVATE_DATA|PERSON|example.com|credentials|users.json/);assert.throws(()=>diffSummary([{filename:'src/a.ts',additions:-1,deletions:0}]));
});
test('commit pagination and compare limits are explicit, not silently complete',async()=>{
 const paged=await commitDiff({get:async()=>({files:Array.from({length:100},(_,i)=>({filename:'src/file'+i+'.ts',additions:1,deletions:0}))})},sha);assert.equal(paged.fileCount,300);assert.equal(paged.partial,true);const f=fixture();assert.equal((await compareDiff(f.api,oldSHA,sha)).additions,18);f.state.comparison.status='diverged';await assert.rejects(compareDiff(f.api,oldSHA,sha));await assert.rejects(commitDiff(f.api,'HEAD;echo unsafe'));
});
test('user text cannot create mentions, markdown blocks, credential URLs or email disclosures',()=>{
 const token='ghp_'+'z'.repeat(45);const text=safeText('@everyone **hello** ```diff\n+ 1\n``` user@example.com '+token+' secret=do-not-copy https://discord.com/api/webhooks/private');assert.ok(!text.includes('@everyone'));assert.ok(!text.includes('```'));assert.ok(!text.includes('user@example.com'));assert.ok(!text.includes(token));assert.ok(!text.includes('do-not-copy'));assert.ok(!text.includes('https://discord.com'));
 const p=notification({kind:'development',url,summary:text,branch:'@here',diff:diffSummary(files)});assert.deepEqual(p.allowed_mentions.parse,[]);assert.ok(p.embeds[0].fields.find(f=>f.value.includes('```diff')).value.includes('```diff\n+ 18 satır\n- 5 satır\n```'));
});
test('grouped release notes are bounded and never include arbitrary code blocks or unknown headings',()=>{
 const notes='## Yeni özellikler\n- '+('*'.repeat(2000))+'\n- next\n- hidden\n```js\n- SECRET_CODE\n```\n## Bilinmeyen\n- IGNORE\n## Güvenlik\n- İzin kontrolü.';
 const fields=releaseNotes(notes);assert.equal(fields.length,2);assert.doesNotMatch(JSON.stringify(fields),/SECRET_CODE|IGNORE|hidden/);const p=notification({kind:'beta',version:'v'+version,published:true,url,notes:notes.repeat(10),diff:diffSummary(files)});assert.equal(validatePayload(p),true);assert.ok(JSON.stringify(p).length<15000);
});
test('missing webhook is a safe no-op and invalid webhook addresses cannot exfiltrate payloads',async()=>{
 let sent=0;assert.equal((await sendWebhook('',plan().payload,{fetchFn:async()=>{sent++;}})).status,'skipped');assert.equal(sent,0);
 for(const value of ['https://example.com/api/webhooks/123/secret',webhook+'/github',webhook+'?url=secret',webhook.replace('https:','http:'),webhook.replace('discord.com','discord.com.evil.invalid')])assert.throws(()=>webhookURL(value),e=>e.message==='invalid_webhook_configuration');
});
test('Discord success uses wait=true, no redirects, allowed_mentions and no secret-bearing output',async()=>{
 let seen;const result=await sendWebhook(webhook,plan().payload,{fetchFn:async(u,options)=>{seen={u,options};return {status:200};}});assert.equal(result.status,'sent');assert.ok(seen.u.endsWith('?wait=true'));assert.equal(seen.options.redirect,'error');assert.deepEqual(JSON.parse(seen.options.body).allowed_mentions.parse,[]);assert.ok(!JSON.stringify(result).includes(webhook));
});
test('rate limits retry only known rejected requests, bounded by retry-after and attempt budget',async()=>{
 let attempts=0;const waits=[];const result=await sendWebhook(webhook,plan().payload,{fetchFn:async()=>++attempts<3?{status:429,json:async()=>({retry_after:0.01})}:{status:200},sleep:async ms=>waits.push(ms)});assert.equal(result.status,'sent');assert.deepEqual(waits,[10,10]);assert.equal(attempts,3);
 const limited=await sendWebhook(webhook,plan().payload,{fetchFn:async()=>({status:429,json:async()=>({retry_after:100})}),sleep:async()=>assert.fail()});assert.equal(limited.status,'rate_limited');
});
test('network uncertainty, redirects and 5xx are never blindly retried or logged with secrets',async()=>{
 for(const result of [()=>{throw new Error(webhook);},()=>({status:500}),()=>({status:302})]){let count=0;const response=await sendWebhook(webhook,plan().payload,{fetchFn:async()=>{count++;return result();}});assert.equal(count,1);assert.ok(!JSON.stringify(response).includes(webhook));assert.notEqual(response.status,'sent');}
 assert.equal((await sendWebhook(webhook,plan().payload,{fetchFn:async()=>({status:403})})).status,'rejected');
});
test('persistent reservations suppress replays and require the owning workflow attempt',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'labcafe-claims-'));try{const p=plan();assert.equal(await claim(p,dir,'1:1'),true);assert.equal(await claim(p,dir,'2:1'),false);let calls=0;await assert.rejects(deliverClaimed(p,{GITHUB_ACTIONS:'true',GITHUB_RUN_ID:'2',GITHUB_RUN_ATTEMPT:'1',DISCORD_DEV_WEBHOOK_URL:webhook},{directory:dir,fetchFn:async()=>{calls++;}}),/reservation/);const response=await deliverClaimed(p,{GITHUB_ACTIONS:'true',GITHUB_RUN_ID:'1',GITHUB_RUN_ATTEMPT:'1',DISCORD_DEV_WEBHOOK_URL:webhook},{directory:dir,fetchFn:async()=>{calls++;return {status:200};}});assert.equal(response.status,'sent');await assert.rejects(deliverClaimed(p,{DISCORD_DEV_WEBHOOK_URL:webhook},{directory:dir,fetchFn:async()=>{calls++;}}));assert.equal(calls,1);assert.throws(()=>validatePlan({...p,key:'../private'}));}finally{await rm(dir,{recursive:true,force:true});}
});
test('dry-run Beta and Stable examples never send, and are explicitly marked illustrative',()=>{
 for(const kind of ['beta','stable']){const run=spawnSync(process.execPath,['scripts/release/notify.mjs','preview','--example',kind],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);const payload=JSON.parse(run.stdout);assert.match(payload.embeds[0].description,/ÖRNEK/);assert.ok(!run.stdout.includes(webhook));assert.equal(validatePayload(example(kind)),true);}
});
test('configured-without-secret logs only a skip and untrusted manual branch cannot plan',async()=>{
 const messages=[];const log=console.log;console.log=x=>messages.push(x);try{await main(['configured'],{PLAN_JSON:JSON.stringify(plan())});}finally{console.log=log;}assert.deepEqual(messages,['webhook_not_configured_skipped']);
 const dir=await mkdtemp(join(tmpdir(),'labcafe-event-'));try{const file=join(dir,'event.json');await writeFile(file,JSON.stringify({repository:event.repository,inputs:{sha,confirmed:'true'}}));await assert.rejects(main(['plan'],{GITHUB_REPOSITORY:REPOSITORY,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/other',GITHUB_EVENT_PATH:file}),/requires_default_branch/);}finally{await rm(dir,{recursive:true,force:true});}
});
test('GitHub network errors omit tokens and forbid off-repository requests',async()=>{
 const api=githubClient('private-token',{fetchFn:async()=>{throw new Error('private-token https://private-url');}});await assert.rejects(api.get(base+'releases'),e=>e.message==='github_request_failed');await assert.rejects(api.get('/repos/attacker/repo/releases'),/invalid_github/);
});
test('release-note drafts use actual commit subjects, preserve categories and disclaim publication',()=>{
 const text=notesFromSubjects(['feat: Ayar paneli','fix: İzin denetimi','security: Erişim kontrolü','docs: Kurulum rehberi']);assert.match(text,/Yeni özellikler\n- Ayar paneli/);assert.match(text,/Hata düzeltmeleri\n- İzin/);assert.match(text,/yayın kanıtı değildir/);assert.match(text,/Bilinen sorunlar\n- Henüz değerlendirilmedi/);
});
test('workflow keeps secret execution on trusted default-branch code with read-only permissions and dedup reservation before POST',async()=>{
 const yml=await readFile('.github/workflows/discord-notify.yml','utf8');assert.doesNotMatch(yml,/pull_request_target|npm ci|secrets.*TOKEN|permissions: write-all|ref:.*head_sha/);assert.match(yml,/ref: \$\{\{ github.event.repository.default_branch \}\}/);assert.match(yml,/persist-credentials: false/);assert.match(yml,/types: \[published\]/);assert.ok(yml.indexOf('notify.mjs claim')<yml.indexOf('notify.mjs send'));assert.match(yml,/steps.reserved.outputs.cache-hit == 'true'/);assert.match(yml,/cancel-in-progress: false/);
 const ci=await readFile('.github/workflows/ci.yml','utf8');assert.match(ci,/ubuntu-latest, windows-latest/);assert.match(ci,/npm test/);assert.match(ci,/npm run build/);
});

test('simultaneous local delivery attempts cannot POST twice',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'labcafe-race-'));try{const p=plan();await claim(p,dir);let calls=0;const options={directory:dir,fetchFn:async()=>{calls++;return {status:200};}};const results=await Promise.allSettled([deliverClaimed(p,{DISCORD_DEV_WEBHOOK_URL:webhook},options),deliverClaimed(p,{DISCORD_DEV_WEBHOOK_URL:webhook},options)]);assert.equal(calls,1);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);}finally{await rm(dir,{recursive:true,force:true});}
});
test('English and Turkish release headings share the supported groups',()=>{assert.equal(releaseNotes('## Improvements\n- Improved.')[0].name,'İyileştirmeler');assert.equal(releaseNotes('## İyileştirmeler\n- Düzenlendi.')[0].name,'İyileştirmeler');});

test('a lost persistent reservation blocks sending instead of silently becoming a new attempt',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'labcafe-lost-'));try{let calls=0;await assert.rejects(deliverClaimed(plan(),{DISCORD_DEV_WEBHOOK_URL:webhook},{directory:dir,fetchFn:async()=>{calls++;return {status:200};}}));assert.equal(calls,0);}finally{await rm(dir,{recursive:true,force:true});}
});
test('Discord hard limits and unsafe mention allowlists are rejected before POST',async()=>{
 const p=plan().payload;p.embeds[0].fields.push({name:'Too long',value:'a'.repeat(1025)});await assert.rejects(sendWebhook(webhook,p,{fetchFn:async()=>assert.fail()}),/payload_limit/);const unsafe=plan().payload;unsafe.allowed_mentions.users=['1'.repeat(18)];assert.throws(()=>validatePayload(unsafe),/unsafe_payload/);
});
