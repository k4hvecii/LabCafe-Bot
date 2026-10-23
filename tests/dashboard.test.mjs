import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import vm from 'node:vm';
import { GuildSettingsStore, defaultSettings } from '../src/config/settings.ts';
import { createDashboardServer } from '../src/dashboard/server.ts';
import { readDashboardConfig } from '../src/dashboard/config.ts';
import { canManageGuild } from '../src/dashboard/discord.ts';
import {NativeAnalytics,nativeApiAllowed,nativeBootstrap} from '../src/analytics/native.ts';

const guildId='123456789012345678', channelId='223456789012345678', otherId='323456789012345678';
const config=readDashboardConfig({ DISCORD_CLIENT_ID:guildId, DISCORD_CLIENT_SECRET:'private-client-secret' });

async function fixture(t, dashboardConfig = config, options = {}) {
  const store=new GuildSettingsStore(':memory:');
  const control={ permission:'32', present:true, channelAllowed:true, fail:false, exchanged:0, publicCalls:0, publicFail:false };
  const discord={
    async getBotGuildIds() { return control.present ? [guildId] : []; },
    async getPublicGuilds() {
      control.publicCalls++;
      if(control.publicFail)throw new Error('private-bot-token');
      return {count:1,guilds:[{id:guildId,name:'Test Guild',icon:'a_animated',members:42,verified:false,partnered:true,community:true}]};
    },
    async exchangeCode() { control.exchanged++; return {accessToken:'private-access-token',expiresIn:3600,...(control.grantGuild?{installationGuildId:control.grantGuild}:{})}; },
    async getUser() { return {id:otherId,name:'Test User',avatar:null}; },
    async getGuilds() {
      if(control.fail)throw new Error('private-token-must-not-leak');
      return [{id:guildId,name:'Test Guild',icon:null,owner:false,permissions:control.permission},
        {id:otherId,name:'No Permission',icon:null,owner:false,permissions:'0'}];
    },
    async getGuild() { return control.present ? {id:guildId,name:'Test Guild',icon:null,channels:[{id:channelId,name:'bot-komut'}]} : null; },
    async canUseChannel() { return control.channelAllowed; }
  };
  const server=createDashboardServer({config:dashboardConfig,store,discord,commands:[{name:'ping',description:'Test'}],...options});
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));store.close();});
  const request=(path,options={})=>fetch(base+path,{redirect:'manual',...options});
  async function login() {
    const start=await request('/auth/login');
    assert.equal(start.status,302);
    const location=new URL(start.headers.get('location'));
    assert.equal(location.origin,'https://discord.com');
    assert.equal(location.searchParams.get('scope'),'identify guilds');
    const state=location.searchParams.get('state');
    const cookie=start.headers.getSetCookie()[0].split(';')[0];
    const finish=await request(`/auth/callback?code=test-code&state=${state}`,{headers:{Cookie:cookie}});
    assert.equal(finish.status,302);
    const sessionCookie=finish.headers.getSetCookie().find(value=>value.startsWith('lc_session=')).split(';')[0];
    const session=await (await request('/api/session',{headers:{Cookie:sessionCookie}})).json();
    return {cookie:sessionCookie,csrf:session.csrf,state,oauthCookie:cookie,session};
  }
  return {store,control,request,login};
}

test('native analytics protects assets and API, keeps provider tokens server-side and checks mutation origin',async t=>{
 const websiteId='11111111-1111-4111-8111-111111111111';const calls=[];
 const nativeAnalytics=new NativeAnalytics({url:'http://127.0.0.1:3010',websiteId,username:'service-user',password:'private-provider-password',startedAt:new Date().toISOString()},'http://127.0.0.1:3011',async(url,options)=>{
  calls.push({url,options});
  if(url.endsWith('/api/auth/login'))return Response.json({token:'private-provider-token'});
  if(url.includes('/api/'))return Response.json({visitors:1});
  return new Response('<html><head><script>window.native=true</script></head><body>Native Umami</body></html>',{headers:{'Content-Type':'text/html','Content-Security-Policy':"default-src 'self'"}});
 });
 const ordinary=await fixture(t,{...config,ownerId:guildId},{nativeAnalytics});const nonowner=await ordinary.login();
 assert.equal((await ordinary.request('/admin/analytics/_next/static/a.js',{headers:{Cookie:nonowner.cookie}})).status,403);
 const app=await fixture(t,{...config,ownerId:otherId},{nativeAnalytics});
 assert.equal((await app.request('/admin/analytics')).status,302);
 assert.equal((await app.request('/admin/analytics/api/config')).status,401);
 assert.equal((await app.request('/admin/analytics/_bridge.js')).status,401);
 assert.equal(calls.length,0);
 const owner=await app.login();const headers={Cookie:owner.cookie,Origin:config.origin,Authorization:'Bearer attacker-token'};
 const page=await app.request('/admin/analytics/websites/'+websiteId,{headers});const html=await page.text();
 assert.equal(page.status,200);assert.match(html,/_bridge.js/);assert.ok(!html.includes('private-provider'));
 assert.match(page.headers.get('content-security-policy'),/script-src 'self' 'nonce-/);
 assert.match(html,/<script nonce="[^"]+">window.native/);
 const report=await app.request('/admin/analytics/api/websites/'+websiteId+'/stats',{headers});assert.equal(report.status,200);
 assert.equal(calls.at(-1).options.headers.Authorization,'Bearer private-provider-token');
 assert.equal(new URL(calls.at(-1).url).searchParams.get('hostname'),'eq.labcafe.xyz');
 assert.equal(new URL(calls.at(-1).url).searchParams.get('match'),'all');
 assert.ok(!('Cookie'in calls.at(-1).options.headers));
 assert.equal((await app.request('/admin/analytics/api/auth/verify',{method:'POST',headers:{Cookie:owner.cookie}})).status,403);
 assert.equal((await app.request('/admin/analytics/api/auth/verify',{method:'POST',headers})).status,200);
 assert.equal((await app.request('/admin/analytics/api/websites/'+websiteId,{method:'DELETE',headers})).status,403);
 assert.equal((await app.request('/admin/analytics/api/me/password',{method:'POST',headers})).status,403);
 assert.equal((await app.request('/admin/analytics/api/boards/'+websiteId+'/shares',{method:'POST',headers})).status,403);
 assert.equal(nativeApiAllowed('/api/websites/other/stats','GET',websiteId),false);
 assert.equal(nativeApiAllowed('/api/realtime/'+websiteId,'GET',websiteId),true);
 assert.equal(nativeApiAllowed('/api/realtime/other','GET',websiteId),false);
 assert.equal(nativeApiAllowed('/api/websites/'+websiteId+'/shares','GET',websiteId),false);
 assert.equal(nativeApiAllowed('/api/boards','POST',websiteId),true);
 assert.ok(!nativeBootstrap('tr').includes('private-provider'));
 assert.doesNotThrow(()=>new vm.Script(nativeBootstrap('tr')));
 assert.doesNotThrow(()=>new vm.Script(nativeBootstrap('en',true)));
 const loggedOut=await app.request('/api/logout',{method:'POST',headers:{Cookie:owner.cookie,Origin:config.origin,'x-csrf-token':owner.csrf}});
 assert.equal(loggedOut.status,200);
 assert.equal((await app.request('/admin/analytics/api/config',{headers:{Cookie:owner.cookie}})).status,401);
});

test('native analytics failure is contained and external upstream addresses are rejected',async t=>{
 const config={url:'http://127.0.0.1:3010',websiteId:'11111111-1111-4111-8111-111111111111',username:'test',password:'private-test',startedAt:new Date().toISOString()};
 assert.throws(()=>new NativeAnalytics(config,'https://example.com'),/loopback/);
 const nativeAnalytics=new NativeAnalytics(config,'http://127.0.0.1:3011',async()=>{throw new Error('private-provider-failure');});
 const app=await fixture(t,{...readDashboardConfig({DISCORD_CLIENT_ID:guildId,DISCORD_CLIENT_SECRET:'test-private'}),ownerId:otherId},{nativeAnalytics});
 const owner=await app.login();
 const response=await app.request('/admin/analytics/api/config',{headers:{Cookie:owner.cookie}});
 assert.equal(response.status,503);assert.ok(!(await response.text()).includes('private-provider'));
 assert.equal((await app.request('/healthz')).status,200);
});

test('owner beta administration denies ordinary users and requires CSRF for owner changes', async t => {
  const ordinary=await fixture(t,{...config,ownerId:guildId});
  const user=await ordinary.login();
  assert.equal((await ordinary.request('/api/admin/beta',{headers:{Cookie:user.cookie}})).status,403);
  const owner=await fixture(t,{...config,ownerId:otherId});
  const session=await owner.login();
  const headers={Cookie:session.cookie,'Content-Type':'application/json',Origin:config.origin,'x-csrf-token':session.csrf};
  assert.equal((await owner.request('/api/admin/beta',{method:'PUT',headers:{Cookie:session.cookie,'Content-Type':'application/json'},body:'{}'})).status,403);
  assert.equal((await owner.request('/api/admin/beta',{method:'PUT',headers,body:JSON.stringify({enabled:true,guildIds:['bad']})})).status,400);
  const saved=await owner.request('/api/admin/beta',{method:'PUT',headers,body:JSON.stringify({enabled:true,guildIds:[]})});
  assert.equal(saved.status,200);
  assert.equal((await (await owner.request('/api/guilds',{headers:{Cookie:session.cookie}})).json()).guilds[0].betaAllowed,false);
  assert.equal((await owner.request(`/api/guilds/${guildId}`,{headers:{Cookie:session.cookie}})).status,403);
  assert.equal(owner.store.betaAllows(guildId),false);
  assert.equal((await owner.request('/api/admin/beta',{method:'PUT',headers,body:JSON.stringify({enabled:true,guildIds:[guildId]})})).status,200);
  assert.equal((await owner.request(`/api/guilds/${guildId}`,{headers:{Cookie:session.cookie}})).status,200);
});

test('guild selection reports actual bot membership while retaining manageable unjoined guilds', async t => {
  const app=await fixture(t);
  const session=await app.login();
  const headers={Cookie:session.cookie};
  const joined=await (await app.request('/api/guilds',{headers})).json();
  assert.equal(joined.guilds.length,1);
  assert.equal(joined.guilds[0].botPresent,true);
  app.control.present=false;
  const unjoined=await (await app.request('/api/guilds',{headers})).json();
  assert.equal(unjoined.guilds.length,1);
  assert.equal(unjoined.guilds[0].id,guildId);
  assert.equal(unjoined.guilds[0].botPresent,false);
  assert.equal((await app.request(`/api/guilds/${guildId}`,{headers})).status,409);
});

test('static traffic does not exhaust API quota and API quota remains enforced', async t => {
  const app=await fixture(t);
  for(let i=0;i<185;i++) assert.equal((await app.request('/logo.svg')).status,200);
  assert.equal((await app.request('/api/session')).status,200);
  for(let i=0;i<179;i++) assert.equal((await app.request('/api/session')).status,200);
  const limited=await app.request('/api/session');
  assert.equal(limited.status,429);
  assert.ok(limited.headers.get('Retry-After'));
  assert.equal((await app.request('/healthz')).status,200);
});

test('legacy page URLs redirect to English canonical paths without losing query parameters', async t => {
  const app=await fixture(t);
  for(const [oldPath,newPath] of [['/yonetim','/admin'],['/hizmet-kosullari','/terms-of-service'],['/gizlilik-politikasi','/privacy-policy'],['/veri-silme','/data-deletion']]){
    const response=await app.request(oldPath+'?source=old-link');
    assert.equal(response.status,301);
    assert.equal(response.headers.get('Location'),newPath+'?source=old-link');
    assert.equal((await app.request(newPath)).status,newPath==='/admin'?302:200);
  }
});

test('dashboard config allows local HTTP and requires HTTPS for remote domains',()=>{
  assert.equal(readDashboardConfig({DISCORD_CLIENT_ID:guildId}).redirectUri,'http://localhost:3000/auth/callback');
  assert.throws(()=>readDashboardConfig({DISCORD_CLIENT_ID:guildId,DASHBOARD_ORIGIN:'http://example.com'}));
  assert.throws(()=>readDashboardConfig({DISCORD_CLIENT_ID:guildId,DASHBOARD_ORIGIN:'https://example.com/path'}));
  assert.throws(()=>readDashboardConfig({DISCORD_CLIENT_ID:guildId,DASHBOARD_PORT:'0'}));
  assert.equal(readDashboardConfig({DISCORD_CLIENT_ID:guildId,DASHBOARD_ORIGIN:'https://panel.example.com'}).port,3000);
});
test('Manage Guild, administrator and owner permissions are recognized; malformed permissions are denied',()=>{
  for(const permissions of ['32','8'])assert.equal(canManageGuild({owner:false,permissions}),true);
  for(const permissions of ['0','invalid'])assert.equal(canManageGuild({owner:false,permissions}),false);
  assert.equal(canManageGuild({owner:true,permissions:'0'}),true);
});
test('public homepage is accessible but APIs require authentication; files and secrets stay private',async t=>{
  const {request}=await fixture(t);
  const page=await request('/');assert.equal(page.status,200);
  assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.match(await page.text(),/LabCafe/);
  const font=await request('/manrope-regular.ttf');
  assert.equal(font.status,200);assert.equal(font.headers.get('content-type'),'font/ttf');
  const logo=await request('/logo.svg');
  assert.equal(logo.status,200);assert.equal(logo.headers.get('content-type'),'image/svg+xml');
  assert.match(await logo.text(),/LabCafe/);
  assert.equal((await request('/reference/compact.svg')).status,404);
  assert.equal((await request('/reference/not-an-allowed-file.svg')).status,404);
  for(const path of ['/api/guilds',`/api/guilds/${guildId}`])assert.equal((await request(path)).status,401);
  for(const path of ['/.env','/data/settings.sqlite','/src/index.ts'])assert.equal((await request(path)).status,404);
  const publicData=await (await request('/api/public')).text();assert.ok(!publicData.includes('private-client-secret'));
});
test('OAuth is bound to the initiating browser and state is single-use',async t=>{
  const {request,login,control}=await fixture(t);
  assert.equal((await request('/auth/callback?code=forged&state=forged')).status,400);
  assert.equal(control.exchanged,0);
  const user=await login();assert.equal(user.session.authenticated,true);
  assert.ok(!JSON.stringify(user.session).includes('private-access-token'));
  assert.equal((await request(`/auth/callback?code=again&state=${user.state}`,{headers:{Cookie:user.oauthCookie}})).status,400);
  assert.equal(control.exchanged,1);
});
test('missing OAuth secret keeps the homepage available without enabling login',async t=>{
  const {request,control}=await fixture(t,{...config,clientSecret:undefined});
  const result=await request('/auth/login');
  assert.equal(result.headers.get('location'),'/?error=oauth-not-configured');
  assert.equal(control.exchanged,0);
  assert.equal((await request('/preview')).status,301);
  assert.equal((await(await request('/api/public')).json()).loginConfigured,false);
});
test('HTTPS origin uses Secure and HttpOnly cookies',async t=>{
  const {request}=await fixture(t,{...config,origin:'https://panel.example.com',redirectUri:'https://panel.example.com/auth/callback'});
  const result=await request('/auth/login');
  const cookie=result.headers.getSetCookie()[0];
  assert.match(cookie,/; Secure/);assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Lax/);
  assert.equal(new URL(result.headers.get('location')).searchParams.get('redirect_uri'),'https://panel.example.com/auth/callback');
});
test('guild list is filtered and permission is rechecked before every settings read',async t=>{
  const {request,login,control}=await fixture(t);const user=await login();const headers={Cookie:user.cookie};
  const list=await (await request('/api/guilds',{headers})).json();assert.deepEqual(list.guilds.map(g=>g.id),[guildId]);
  assert.equal((await request(`/api/guilds/${otherId}`,{headers})).status,403);
  assert.equal((await request(`/api/guilds/${guildId}`,{headers})).status,200);
  control.permission='0';assert.equal((await request(`/api/guilds/${guildId}`,{headers})).status,403);
  control.permission='32';control.present=false;assert.equal((await request(`/api/guilds/${guildId}`,{headers})).status,409);
});
test('updates require CSRF and same-origin, validate channels, and persist in the shared store',async t=>{
  const {request,login,store,control}=await fixture(t);const user=await login();
  const path=`/api/guilds/${guildId}/settings`;
  const headers={Cookie:user.cookie,'Content-Type':'application/json',Origin:config.origin,'X-CSRF-Token':user.csrf};
  const body=JSON.stringify({locale:'tr',ephemeralReplies:false,commandChannelId:channelId});
  assert.equal((await request(path,{method:'PATCH',headers:{...headers,Origin:'https://attacker.example'},body})).status,403);
  assert.equal((await request(path,{method:'PATCH',headers:{...headers,'X-CSRF-Token':'forged'},body})).status,403);
  assert.equal((await request(path,{method:'PATCH',headers,body:JSON.stringify({ephemeralReplies:false,commandChannelId:otherId})})).status,400);
  control.channelAllowed=false;assert.equal((await request(path,{method:'PATCH',headers,body})).status,400);
  control.channelAllowed=true;assert.equal((await request(path,{method:'PATCH',headers,body})).status,200);
  assert.deepEqual(store.get(guildId),{locale:'tr',ephemeralReplies:false,commandChannelId:channelId});
  const read=await(await request(`/api/guilds/${guildId}`,{headers})).json();assert.deepEqual(read.settings,store.get(guildId));
  store.update(guildId,{ephemeralReplies:true});
  const fromBot=await(await request(`/api/guilds/${guildId}`,{headers})).json();assert.equal(fromBot.settings.ephemeralReplies,true);
  assert.equal((await request(`/api/guilds/${guildId}/reset`,{method:'POST',headers})).status,200);
  assert.deepEqual(store.get(guildId),defaultSettings());
});
test('revoked users cannot write or reset; malformed and oversized settings are rejected',async t=>{
  const {request,login,control,store}=await fixture(t);const user=await login();
  const headers={Cookie:user.cookie,'Content-Type':'application/json',Origin:config.origin,'X-CSRF-Token':user.csrf};
  const path=`/api/guilds/${guildId}/settings`;
  for(const body of ['{',JSON.stringify({ephemeralReplies:'false',commandChannelId:null}),JSON.stringify({ephemeralReplies:true,commandChannelId:null,token:'unexpected'})]){
    assert.equal((await request(path,{method:'PATCH',headers,body})).status,400);
  }
  assert.equal((await request(path,{method:'PATCH',headers,body:'x'.repeat(4097)})).status,413);
  control.permission='0';
  assert.equal((await request(path,{method:'PATCH',headers,body:JSON.stringify(defaultSettings())})).status,403);
  assert.equal((await request(`/api/guilds/${guildId}/reset`,{method:'POST',headers})).status,403);
  assert.deepEqual(store.get(guildId),defaultSettings());
});
test('logout invalidates session and Discord failures never leak raw errors',async t=>{
  const {request,login,control}=await fixture(t);const user=await login();
  const headers={Cookie:user.cookie,Origin:config.origin,'X-CSRF-Token':user.csrf};
  control.fail=true;const failure=await request('/api/guilds',{headers});assert.equal(failure.status,502);
  assert.ok(!(await failure.text()).includes('private-token'));
  assert.equal((await request('/api/logout',{method:'POST',headers})).status,200);
  assert.equal((await request('/api/guilds',{headers})).status,401);
});


test('public guild showcase returns only public metadata and shares concurrent requests',async t=>{
  const {request,control}=await fixture(t);
  const responses=await Promise.all(Array.from({length:5},()=>request('/api/public/guilds')));
  for(const response of responses){
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{count:1,guilds:[{id:guildId,name:'Test Guild',icon:'a_animated',members:42,verified:false,partnered:true,community:true}]});
  }
  assert.equal(control.publicCalls,1);
  await request('/api/public/guilds');
  assert.equal(control.publicCalls,1);
});
test('unavailable showcase fails safely and caches failures to avoid Discord retry storms',async t=>{
  const {request,control}=await fixture(t);control.publicFail=true;
  for(let i=0;i<2;i++){
    const response=await request('/api/public/guilds');assert.equal(response.status,503);
    assert.doesNotMatch(await response.text(),/private-bot-token/);
  }
  assert.equal(control.publicCalls,1);
});


test('support guild selection uses an explicit ID before the existing test guild and rejects malformed IDs',()=>{
  assert.equal(readDashboardConfig({DISCORD_CLIENT_ID:guildId,DISCORD_GUILD_ID:otherId}).supportGuildId,otherId);
  assert.equal(readDashboardConfig({DISCORD_CLIENT_ID:guildId,DISCORD_GUILD_ID:otherId,DASHBOARD_SUPPORT_GUILD_ID:guildId}).supportGuildId,guildId);
  assert.equal(readDashboardConfig({DISCORD_CLIENT_ID:guildId}).supportGuildId,undefined);
  assert.throws(()=>readDashboardConfig({DISCORD_CLIENT_ID:guildId,DASHBOARD_SUPPORT_GUILD_ID:'invalid'}));
});
test('public configuration identifies the support guild without exposing OAuth secrets',async t=>{
  const {request}=await fixture(t,{...config,supportGuildId:guildId});
  const response=await request('/api/public');
  assert.deepEqual(await response.json(),{loginConfigured:true,clientId:guildId,installFlowEnabled:false,supportGuildId:guildId,supportInviteUrl:null,publicGuilds:null});
});


test('public bootstrap includes already cached guilds so the first render can include cards and badges',async t=>{
  const {request}=await fixture(t);
  const data=await (await request('/api/public/guilds')).json();
  const config=await (await request('/api/public')).json();
  assert.deepEqual(config.publicGuilds,data);
  assert.equal(config.publicGuilds.guilds[0].community,true);
});
test('embedded badge colors do not depend on inline styles blocked by the page CSP',async()=>{
  const {readFile}=await import('node:fs/promises');
  const app=await readFile(new URL('../dashboard/app.js',import.meta.url),'utf8');
  const declaration=app.match(/^const guildBadges = (.+);\r?$/m);
  assert.ok(declaration);
  const badges=JSON.parse(declaration[1]);
  for(const svg of Object.values(badges)){
    assert.doesNotMatch(svg,/<style\b|\sstyle=/);
    assert.match(svg,/<path[^>]+fill=/);
  }
});


test('public assets revalidate with ETags while HTML and API responses remain uncached',async t=>{
  const {request}=await fixture(t);
  for(const path of ['/styles.css','/app.js','/manrope-bold.ttf','/logo.svg']){
    const first=await request(path);assert.equal(first.status,200);
    const etag=first.headers.get('etag');assert.match(etag,/^"[a-f0-9]{64}"$/);
    assert.match(first.headers.get('cache-control'),/must-revalidate/);
    const cached=await request(path,{headers:{'If-None-Match':etag}});
    assert.equal(cached.status,304);assert.equal(await cached.text(),'');
    const weak=await request(path,{headers:{'If-None-Match':`W/${etag}`}});assert.equal(weak.status,304);
    const stale=await request(path,{headers:{'If-None-Match':'"old-content"'}});assert.equal(stale.status,200);
  }
  for(const path of ['/','/api/session','/api/public']){
    const response=await request(path);assert.equal(response.headers.get('cache-control'),'no-store');
  }
});


test('support invitation accepts only direct HTTPS Discord invite URLs',()=>{
  for(const url of ['https://discord.gg/ExampleCode','https://discord.com/invite/Example-Code']){
    assert.equal(readDashboardConfig({DISCORD_CLIENT_ID:guildId,DASHBOARD_SUPPORT_INVITE_URL:url}).supportInviteUrl,url);
  }
  for(const url of ['javascript:alert(1)','http://discord.gg/code','https://evil.test/code','https://discord.gg.evil.test/code','https://user@discord.gg/code','https://discord.gg/code?next=evil','https://discord.gg/code#fragment','https://discord.gg/']){
    assert.throws(()=>readDashboardConfig({DISCORD_CLIENT_ID:guildId,DASHBOARD_SUPPORT_INVITE_URL:url}));
  }
});
test('public login configuration includes the selected support invitation',async t=>{
  const {request}=await fixture(t,{...config,supportInviteUrl:'https://discord.gg/ExampleCode'});
  const result=await (await request('/api/public')).json();
  assert.equal(result.supportInviteUrl,'https://discord.gg/ExampleCode');
  assert.equal('clientSecret' in result,false);
});


test('legal pages are public, readable without JavaScript and linked from every legal footer',async t=>{
  const {request}=await fixture(t);
  const pages=['/terms-of-service','/privacy-policy','/data-deletion'];
  for(const path of pages){
    const response=await request(path);assert.equal(response.status,200);
    assert.match(response.headers.get('content-type'),/text\/html/);
    const html=await response.text();assert.match(html,/<h1>/);assert.match(html,/Son güncelleme: \d{1,2} \S+ \d{4}/);
    assert.ok(html.includes('<script src="/i18n.js" defer>'));assert.match(html,/<main class="legal-page">/);
    for(const link of pages)assert.ok(html.includes(`href="${link}"`));
  }
});


test('removed preview redirects home and HEAD agrees with GET without a body',async t=>{
 const {request}=await fixture(t);
 for(const path of ['/preview','/onizleme']){
   const response=await request(path);assert.equal(response.status,301);assert.equal(response.headers.get('location'),'/');
 }
 for(const path of ['/','/app.js','/styles.css','/privacy-policy']){
   const get=await request(path),head=await request(path,{method:'HEAD'});
   assert.equal(head.status,get.status);assert.equal(head.headers.get('content-type'),get.headers.get('content-type'));assert.equal(await head.text(),'');
 }
 const home=await (await request('/')).text();assert.doesNotMatch(home,/Neden LabCafe/);assert.doesNotMatch(home,/Sık sorulan sorular/);assert.doesNotMatch(home,/href="\/preview"/);
 const notFound=await request('/missing');assert.equal(notFound.status,404);assert.match(notFound.headers.get('content-type'),/text\/html/);assert.match(await notFound.text(),/Ana sayfaya dön/);
});

test('settings writes record actor and conflict atomically without exposing another guild history',async t=>{
 const app=await fixture(t);const session=await app.login();
 const headers={Cookie:session.cookie,Origin:config.origin,'Content-Type':'application/json','X-CSRF-Token':session.csrf,'X-Settings-Base':JSON.stringify(defaultSettings())};
 const body=JSON.stringify({ephemeralReplies:false,commandChannelId:null});
 const saved=await app.request(`/api/guilds/${guildId}/settings`,{method:'PATCH',headers,body});
 assert.equal(saved.status,200);const result=await saved.json();assert.equal(result.history[0].actorId,otherId);assert.equal(result.analysis.checks[1].ok,null);
 const stale=await app.request(`/api/guilds/${guildId}/settings`,{method:'PATCH',headers,body:JSON.stringify(defaultSettings())});
 assert.equal(stale.status,409);assert.equal(app.store.history(guildId).length,1);assert.equal(app.store.get(guildId).ephemeralReplies,false);assert.equal(app.store.history(otherId).length,0);
 const read=await app.request(`/api/guilds/${guildId}`,{headers:{Cookie:session.cookie}});const data=await read.json();assert.equal(data.analysis.textChannelCount,1);assert.equal(data.analysis.checks[1].ok,null);
 app.control.permission='0';assert.equal((await app.request(`/api/guilds/${guildId}`,{headers:{Cookie:session.cookie}})).status,403);
});

test('feature pages are public, have canonical English paths, real scope and working language assets',async t=>{
 const {request}=await fixture(t);
 for(const key of ['dashboard','server-checks','commands']){
  const response=await request(`/features/${key}`);assert.equal(response.status,200);const html=await response.text();
  assert.match(html,/<h1>/);assert.ok(html.includes(`https://labcafe.xyz/features/${key}`));assert.ok(html.includes('href="/dashboard"'));assert.ok(html.includes('/i18n.js'));
  assert.equal((await request(`/features/${key}`,{method:'HEAD'})).status,200);
 }
 assert.equal((await request('/features/unknown')).status,404);
 const js=await request('/i18n.js');assert.equal(js.status,200);assert.match(js.headers.get('content-type'),/javascript/);
});

test('bot locale uses the authenticated settings approval route, records history and rejects unsupported languages',async t=>{
 const app=await fixture(t);const login=await app.login();const headers={Origin:config.origin,Cookie:login.cookie,'X-CSRF-Token':login.csrf,'Content-Type':'application/json'};
 const body=JSON.stringify({...defaultSettings(),locale:'en'});const path=`/api/guilds/${guildId}/settings`;
 assert.equal((await app.request(path,{method:'PATCH',headers,body})).status,200);assert.equal(app.store.get(guildId).locale,'en');assert.equal(JSON.parse(app.store.history(guildId)[0].payload).locale,'en');
 assert.equal((await app.request(path,{method:'PATCH',headers,body:JSON.stringify({...defaultSettings(),locale:'de'})})).status,400);
 assert.equal(app.store.get(guildId).locale,'en');
});

test('analytics reports require the owner and collection is same-origin, sanitized, bounded and excludes owner/bots',async t=>{
 let reports=0;const collected=[];
 const analytics={async report(range){reports++;return {configured:true,available:true,range,summary:{pageviews:0,visitors:0}};},async collect(...event){collected.push(event);}};
 const ordinary=await fixture(t,config,{analytics});const anon=await ordinary.request('/api/admin/analytics');assert.equal(anon.status,401);
 const session=await ordinary.login();assert.equal((await ordinary.request('/api/admin/analytics',{headers:{Cookie:session.cookie}})).status,403);assert.equal(reports,0);
 const owner=await fixture(t,{...config,ownerId:otherId},{analytics});const admin=await owner.login();const cookie={Cookie:admin.cookie};
 assert.equal((await owner.request('/api/admin/analytics?period=7',{headers:cookie})).status,200);assert.equal(reports,1);
 assert.equal((await owner.request('/api/admin/analytics?period=999',{headers:cookie})).status,400);assert.equal(reports,1);
 const headers={Origin:config.origin,'Content-Type':'application/json','User-Agent':'Mozilla/5.0 Chrome/130.0'};
 const body=JSON.stringify({path:'/',referrer:'https://search.test/private?token=secret',language:'tr-TR',screen:'1920x1080'});
 assert.equal((await ordinary.request('/metrics/collect',{method:'POST',headers,body})).status,204);assert.equal(collected.length,1);assert.equal(collected[0][0].referrer,'https://search.test');assert.equal(collected[0][1],'127.0.0.1');
 assert.equal((await ordinary.request('/metrics/collect',{method:'POST',headers:{...headers,Origin:'https://evil.test'},body})).status,403);
 for(const value of [{path:'/auth/callback?code=secret'},{path:'/',event:'login_success'},{path:'/',userId:'secret'}])assert.equal((await ordinary.request('/metrics/collect',{method:'POST',headers,body:JSON.stringify(value)})).status,400);
 for(const extra of [{DNT:'1'},{'Sec-GPC':'1'},{'User-Agent':'Googlebot'}])assert.equal((await ordinary.request('/metrics/collect',{method:'POST',headers:{...headers,...extra},body})).status,204);
 assert.equal((await owner.request('/metrics/collect',{method:'POST',headers:{...headers,...cookie},body})).status,204);assert.equal(collected.length,1);
});

test('successful login counters exclude the owner and cannot affect authentication',async t=>{
 const calls=[];const conversions={record(name){calls.push(name);},stats(){return {};}};
 const ordinary=await fixture(t,config,{conversions});await ordinary.login();assert.deepEqual(calls,['login_success']);
 const owner=await fixture(t,{...config,ownerId:otherId},{conversions});await owner.login();assert.equal(calls.length,1);
 const broken=await fixture(t,config,{conversions:{record(){throw new Error('counter offline');}}});const session=await broken.login();assert.ok(session.cookie);
});

test('operations API requires owner, validates windows and exposes only process scoped aggregates',async t=>{
  const {DiscordRestMetrics}=await import('../src/observability/discord-metrics.ts');
  const rest=new DiscordRestMetrics('dashboard');rest.attempt('oauth_user',25,200);
  const ordinary=await fixture(t,{...config,ownerId:guildId},{observability:{rest}});
  assert.equal((await ordinary.request('/api/admin/operations')).status,401);
  const user=await ordinary.login();assert.equal((await ordinary.request('/api/admin/operations',{headers:{Cookie:user.cookie}})).status,403);
  const app=await fixture(t,{...config,ownerId:otherId},{observability:{rest}});const owner=await app.login();
  const headers={Cookie:owner.cookie};
  assert.equal((await app.request('/api/admin/operations?range=forever',{headers})).status,400);
  const result=await app.request('/api/admin/operations?range=15m',{headers});
  assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');
  const report=await result.json();assert.equal(report.scope,'dashboard-process');
  assert.equal(report.discordRest.service,'dashboard');assert.equal(report.discordRest.attempts,1);
  assert.equal(report.bot,null);assert.equal(report.botStatus,'not-connected');
  const raw=JSON.stringify(report);for(const secret of ['private-access-token','private-client-secret','private-bot-token'])assert.ok(!raw.includes(secret));
  assert.equal((await app.request('/api/admin/operations',{method:'POST',headers:{...headers,Origin:config.origin,'x-csrf-token':owner.csrf}})).status,405);
  await app.request('/api/logout',{method:'POST',headers:{...headers,Origin:config.origin,'x-csrf-token':owner.csrf}});
  assert.equal((await app.request('/api/admin/operations',{headers})).status,401);
});

test('Control Center assets, writes and live streams are owner protected with audited changes', {timeout:15000},async t=>{
 const {ControlStore}=await import('../src/observability/store.ts');const {ControlCenter}=await import('../src/observability/center.ts');
 const {DiscordRestMetrics}=await import('../src/observability/discord-metrics.ts');const {StartupTracker}=await import('../src/observability/startup.ts');const {createLogger}=await import('../src/core/logger.ts');
 const control=new ControlStore(':memory:');const rest=new DiscordRestMetrics('dashboard');const startup=new StartupTracker(createLogger('error',[],{sink(){}}));const center=new ControlCenter(control,rest,startup);
 t.after(()=>center.close());const app=await fixture(t,{...config,ownerId:otherId},{observability:{rest,startup,center}});
 assert.equal((await app.request('/admin/assets/control.js')).status,401);
 assert.equal((await app.request('/api/admin/control/overview')).status,401);
 const owner=await app.login();const headers={Cookie:owner.cookie,Origin:config.origin,'x-csrf-token':owner.csrf,'Content-Type':'application/json'};
 const page=await app.request('/admin',{headers});assert.equal(page.status,200);assert.match(await page.text(),/id="heading"/);
 const asset=await app.request('/admin/assets/control.js',{headers});assert.equal(asset.status,200);assert.equal(asset.headers.get('cache-control'),'no-store');
 assert.equal((await app.request('/admin/assets/../../.env',{headers})).status,404);
 const result=await(await app.request('/api/admin/control/overview',{headers})).json();assert.equal(result.bot.available,false);assert.equal(result.capabilities.shell,false);
 const settings={cpuPercent:85,memoryPercent:90,diskPercent:85,holdSeconds:120,cooldownSeconds:900};
 assert.equal((await app.request('/api/admin/control/thresholds',{method:'PUT',headers:{Cookie:owner.cookie},body:JSON.stringify(settings)})).status,403);
 assert.equal((await app.request('/api/admin/control/thresholds',{method:'PUT',headers,body:JSON.stringify(settings)})).status,200);assert.equal(control.audits().length,1);
 const review=body=>app.request('/api/admin/control/review',{method:'POST',headers,body:JSON.stringify(body)});
 assert.equal((await review({id:999999})).status,404);assert.equal(control.audits().length,1);
 control.record({at:Date.now(),service:'bot',level:'error',code:'command_failed'});control.flush();const event=control.events({code:'command_failed'})[0];
 assert.equal((await review({id:Number(event.id)})).status,200);assert.equal(control.audits().length,2);
 assert.equal((await review({id:Number(event.id)})).status,200);assert.equal(control.audits().length,2);
 assert.equal((await app.request('/api/admin/control/stream',{headers:{...headers,Origin:'https://attacker.invalid'}})).status,403);
 const first=new AbortController();const second=new AbortController();
 try{
 const a=await app.request('/api/admin/control/stream',{headers,signal:first.signal});assert.equal(a.headers.get('content-type'),'text/event-stream');
 const reader=a.body.getReader();let text='';while(!text.includes('event: snapshot')){const item=await reader.read();if(item.done)break;text+=new TextDecoder().decode(item.value);}assert.match(text,/event: snapshot/);assert.ok(!text.includes('private-access-token'));
 const b=await app.request('/api/admin/control/stream',{headers,signal:second.signal});assert.equal(b.status,200);
 assert.equal((await app.request('/api/admin/control/stream',{headers})).status,429);
 }finally{first.abort();second.abort();}
});

test('admin idle expiry leaves ordinary dashboard sessions intact',async t=>{
 const app=await fixture(t,{...config,ownerId:otherId});const owner=await app.login();const headers={Cookie:owner.cookie};const original=Date.now;
 try{Date.now=()=>original()+901000;assert.equal((await app.request('/api/admin/operations',{headers})).status,401);assert.equal((await(await app.request('/api/session',{headers})).json()).authenticated,true);}
 finally{Date.now=original;}
});


test('installation flow ignores query guild hints, requires canonical grant and new membership, and stays opt-in',async t=>{
 const {ControlStore}=await import('../src/observability/store.ts');const {DiscordRestMetrics}=await import('../src/observability/discord-metrics.ts');
 const control=new ControlStore(':memory:');t.after(()=>control.close());const center={store:control};const rest=new DiscordRestMetrics('dashboard');
 const app=await fixture(t,{...config,installFlowEnabled:true},{observability:{rest,center}});app.control.present=false;
 const start=await app.request('/auth/install?utm_source=community');assert.equal(start.status,302);const target=new URL(start.headers.get('location'));assert.ok(target.searchParams.get('scope').includes('bot'));const state=target.searchParams.get('state');const cookie=start.headers.getSetCookie()[0].split(';')[0];
 assert.equal((await app.request('/auth/callback?code=test&guild_id='+guildId+'&state='+state,{headers:{Cookie:cookie}})).status,302);assert.equal(control.installReport().states.length,0);
 app.control.grantGuild=guildId;
 const second=await app.request('/auth/install');const secondState=new URL(second.headers.get('location')).searchParams.get('state');const secondCookie=second.headers.getSetCookie()[0].split(';')[0];
 assert.equal((await app.request('/auth/callback?code=test&state='+secondState,{headers:{Cookie:secondCookie}})).status,302);assert.equal(control.installReport().states[0].status,'pending');assert.equal(control.confirmInstalls(new Set([guildId])).length,1);
 assert.equal((await app.request('/auth/callback?code=test&state='+secondState,{headers:{Cookie:secondCookie}})).status,400);
 const disabled=await fixture(t,config,{observability:{rest,center}});assert.equal((await disabled.request('/auth/install')).status,404);
});
