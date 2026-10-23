import {readFile} from 'node:fs/promises';
import {AnalyticsService} from '../../src/analytics/service.ts';
// Explicit local-only fixture. No Discord requests, production data, or real authentication.
import {createServer,request as proxyRequest} from 'node:http';
import {once} from 'node:events';
import {createDashboardServer} from '../../src/dashboard/server.ts';
import {GuildSettingsStore} from '../../src/config/settings.ts';
import {ControlStore} from '../../src/observability/store.ts';
import {ControlCenter} from '../../src/observability/center.ts';
import {DiscordRestMetrics} from '../../src/observability/discord-metrics.ts';
import {StartupTracker} from '../../src/observability/startup.ts';
import {LocalObservationClient} from '../../src/observability/local-client.ts';
import {BotRuntime} from '../../src/observability/bot-runtime.ts';
import {createLogger} from '../../src/core/logger.ts';
import {readDashboardConfig} from '../../src/dashboard/config.ts';
if(!process.argv.includes('--fixture'))throw new Error('Local fixture requires --fixture');
const port=4319;const owner='100000000000000001';const config={...readDashboardConfig({DISCORD_CLIENT_ID:'123456789012345678',DISCORD_CLIENT_SECRET:'fixture-only',DASHBOARD_ORIGIN:'http://127.0.0.1:'+port}),ownerId:owner};
const settings=new GuildSettingsStore(':memory:');const store=new ControlStore(':memory:');const botStore=new ControlStore(':memory:');
const rest=new DiscordRestMetrics('dashboard');for(let i=0;i<80;i++)rest.attempt('guild_read',10+i*2,i%25===0?429:200);
const startup=new StartupTracker(createLogger('error',[],{sink(){}}));for(const phase of ['configuration','commands','database','health','ready']){startup.start(phase);startup.complete(phase);}
const runtime=new BotRuntime(['ping','yardım'],botStore);runtime.initializeGuilds(['123456789012345678']);runtime.gateway('connected');runtime.heartbeat();for(let i=0;i<20;i++)runtime.commandStart(i%2?'ping':'yardım','123456789012345678')(i%5?'succeeded':'failed');botStore.flush();
const bot=new LocalObservationClient(3001,'fixture-observer-key-'.repeat(2),'bot',async()=>{runtime.heartbeat();return Response.json({service:'bot',sampledAt:Date.now(),ready:true,gatewayConnected:true,guildCount:1,discordRest:rest.snapshot(),runtime:{...runtime.snapshot(),gatewayPingMs:42},events:botStore.events()});});
const center=new ControlCenter(store,rest,startup,bot);const snapshot=center.snapshot.bind(center);center.snapshot=async range=>({...await snapshot(range),sampleMode:'test-fixture'});center.start();
const discord={async exchangeCode(){return {accessToken:'fixture-only-access',expiresIn:3600};},async getUser(){return {id:owner,name:'Local Preview',avatar:null};},async getGuilds(){return [];},async getBotGuildIds(){return [];},async getPublicGuilds(){return {count:0,guilds:[]};}};
const analytics=new AnalyticsService({url:'http://127.0.0.1:3010',websiteId:'12345678-1234-1234-1234-123456789012',username:'fixture',password:'fixture',startedAt:new Date().toISOString()},async url=>{
 if(url.includes('/auth/login'))return Response.json({token:'fixture'});if(url.includes('/stats?'))return Response.json({pageviews:120,visitors:40,visits:55,bounces:12,totaltime:1400});
 if(url.includes('/pageviews?')){const query=new URL(url).searchParams;const step=query.get('unit')==='minute'?60000:query.get('unit')==='hour'?3600000:86400000;const start=Number(query.get('startAt'));const end=Number(query.get('endAt'));const count=Math.min(12,Math.floor((end-start)/step)+1);const series=Array.from({length:count},(_,i)=>({x:new Date(start+i*step).toISOString(),y:3+i%5}));return Response.json({pageviews:series,sessions:series.map(x=>({...x,y:Math.max(1,x.y-2)}))});}
 if(url.endsWith('/active'))return Response.json({visitors:2});return Response.json([{x:'Fixture',y:20}]);
});
const server=createDashboardServer({analytics,config,store:settings,discord,commands:[],observability:{rest,startup,center}});server.listen(0,'127.0.0.1');await once(server,'listening');
const upstream=server.address().port;
const proxy=createServer((req,res)=>{if(req.url==='/benchmark'){void readFile(new URL('./chart-benchmark.html',import.meta.url)).then(body=>{res.writeHead(200,{'Content-Type':'text/html'});res.end(body);});return;}const forwarded=proxyRequest({host:'127.0.0.1',port:upstream,path:req.url,method:req.method,headers:req.headers},response=>{
 const headers={...response.headers};if(req.url==='/auth/login'&&headers.location){const url=new URL(headers.location);headers.location='/auth/callback?code=fixture&state='+url.searchParams.get('state');}else if(req.url?.startsWith('/auth/callback')&&headers.location==='/dashboard')headers.location='/admin';
 res.writeHead(response.statusCode,headers);response.pipe(res);res.once('close',()=>response.destroy());
 });forwarded.on('error',()=>{res.writeHead(502);res.end('Fixture upstream unavailable');});req.pipe(forwarded);res.once('close',()=>forwarded.destroy());});
proxy.listen(port,'127.0.0.1');await once(proxy,'listening');console.log('LOCAL TEST FIXTURE http://127.0.0.1:'+port+'/admin');
const stop=()=>{proxy.closeAllConnections();proxy.close();server.closeAllConnections();server.close();center.close();botStore.close();settings.close();};process.once('SIGINT',stop);process.once('SIGTERM',stop);

