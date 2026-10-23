import test from 'node:test';
import assert from 'node:assert/strict';
import {AnalyticsService,analyticsRange,parseTrafficEvent,readAnalyticsConfig,ignoreTraffic} from '../src/analytics/service.ts';
import {ConversionStore} from '../src/analytics/conversions.ts';
const now=Date.parse('2026-10-21T10:00:00Z');
const config={url:'http://127.0.0.1:3010',websiteId:'12345678-1234-1234-1234-123456789012',username:'private-user',password:'private-secret',startedAt:'2026-10-21T09:00:00Z'};
const params=period=>new URLSearchParams({period});

test('short traffic windows retain minute resolution and reject sensitive campaign or performance fields',()=>{
 for(const [period,duration] of [['15m',900000],['1h',3600000],['24h',86400000]]){const range=analyticsRange(params(period),now);assert.equal(range.end-range.start,duration);}
 assert.throws(()=>parseTrafficEvent({path:'/',utm:{campaign:'person123456789'}},'https://labcafe.xyz'));
 assert.throws(()=>parseTrafficEvent({path:'/',event:'web_vitals',performance:{lcp:1,token:2}},'https://labcafe.xyz'));
 assert.throws(()=>parseTrafficEvent({path:'/',performance:{lcp:1}},'https://labcafe.xyz'));
 assert.deepEqual(parseTrafficEvent({path:'/',event:'web_vitals',performance:{lcp:200,cls:.1},utm:{source:'community'}},'https://labcafe.xyz').performance,{lcp:200,cls:.1});
});
test('periods use Istanbul day boundaries and reject invalid, future or excessive ranges',()=>{
 const day=analyticsRange(params('1'),now);assert.equal(day.start,Date.parse('2026-10-20T21:00:00Z'));assert.equal(day.end,now);assert.equal(day.unit,'hour');
 const week=analyticsRange(params('7'),now);assert.equal(week.startDate,'2026-10-15');assert.equal(week.unit,'day');
 for(const query of ['period=999','period=no','period=custom&start=2026-02-31&end=2026-10-21','period=custom&start=2026-10-22&end=2026-10-23','period=custom&start=2020-01-01&end=2026-10-21','period=custom&start=2026-10-21&end=2026-10-20'])assert.throws(()=>analyticsRange(new URLSearchParams(query),now));
});
test('analytics only accepts local services; public event schema removes referrer secrets and rejects raw identifiers',()=>{
 assert.equal(readAnalyticsConfig({}),undefined);
 for(const url of ['https://external.test','http://localhost:3010','http://127.0.0.1:3010/api','http://user:pass@127.0.0.1:3010'])assert.throws(()=>readAnalyticsConfig({ANALYTICS_URL:url}));
 const event=parseTrafficEvent({path:'/dashboard',referrer:'https://search.test/private?token=secret#x',language:'tr-TR',screen:'1920x1080'},'https://labcafe.xyz');
 assert.equal(event.referrer,'https://search.test');assert.ok(!JSON.stringify(event).includes('secret'));
 for(const payload of [{path:'/dashboard?guild=123456789012345678'},{path:'/auth/callback'},{path:'/admin'},{path:'/',userId:'private'},{path:'/',event:'login_success'},{path:'/',ip:'1.2.3.4'}])assert.throws(()=>parseTrafficEvent(payload,'https://labcafe.xyz'));
 for(const headers of [{dnt:'1','user-agent':'Mozilla/5.0'},{'sec-gpc':'1','user-agent':'Mozilla/5.0'},{'user-agent':'Googlebot/2.1'},{'user-agent':'HeadlessChrome/130'}])assert.equal(ignoreTraffic({headers}),true);
});
test('provider reads are authenticated, coalesced, cached and return only normalized aggregates',async()=>{
 let login=0,reads=0;
 const request=async(url,options)=>{
  if(url.endsWith('/auth/login')){login++;assert.ok(options.body.includes('private-secret'));return Response.json({token:'never-expose-this'});}
  reads++;assert.equal(options.headers.Authorization,'Bearer never-expose-this');
  if(url.includes('/stats?'))return Response.json({pageviews:12,visitors:5,visits:7,bounces:1,totaltime:100,comparison:{pageviews:8,visitors:4,visits:5},private:'must-not-leak'});
  if(url.includes('/pageviews?'))return Response.json({pageviews:[{x:'2026-10-21',y:12}],sessions:[{x:'2026-10-21',y:5}]});
  if(url.endsWith('/active'))return Response.json({visitors:2});
  return Response.json([{x:'/',y:12,secret:'never-expose-this'}]);
 };
 const analytics=new AnalyticsService(config,request);const range=analyticsRange(params('7'),now);
 const [a,b]=await Promise.all([analytics.report(range),analytics.report(range)]);assert.equal(login,1);assert.equal(reads,11);assert.equal(a,b);assert.equal(a.summary.pageviews,12);assert.equal(a.active,2);assert.equal(a.pages[0].label,'/');assert.ok(!JSON.stringify(a).includes('never-expose-this'));assert.ok(!JSON.stringify(a).includes('private-secret'));
 await analytics.report({...range,end:range.end+5000});assert.equal(reads,11);
});
test('rolling traffic windows use distinct pending and cache entries while repeated requests coalesce',async()=>{
 const queries=[];
 const request=async url=>{
  if(url.endsWith('/auth/login'))return Response.json({token:'test-token'});
  const query=new URL(url);queries.push(query);
  if(query.pathname.endsWith('/stats'))return Response.json({pageviews:Number(query.searchParams.get('endAt'))-Number(query.searchParams.get('startAt')),visitors:1});
  if(query.pathname.endsWith('/pageviews'))return Response.json({pageviews:[],sessions:[]});
  if(query.pathname.endsWith('/active'))return Response.json({visitors:0});
  return Response.json([]);
 };
 const analytics=new AnalyticsService(config,request);const short=analyticsRange(params('15m'),now),long=analyticsRange(params('1h'),now);
 const [a,b,repeat]=await Promise.all([analytics.report(short),analytics.report(long),analytics.report(short)]);
 assert.equal(a,repeat);assert.equal(a.summary.pageviews,900000);assert.equal(b.summary.pageviews,3600000);assert.equal(queries.length,22);
 for(const range of [short,long])assert.ok(queries.some(query=>query.pathname.endsWith('/stats')&&query.searchParams.get('startAt')===String(range.start)&&query.searchParams.get('endAt')===String(range.end)));
 assert.equal(await analytics.report({...short,start:short.start+5000,end:short.end+5000}),a);
 assert.equal(await analytics.report(long),b);assert.equal(queries.length,22);
});

test('analytics outage cannot throw through reports or collection; failed collection opens a short circuit',async()=>{
 let calls=0;const analytics=new AnalyticsService(config,async()=>{calls++;throw new Error('private-secret');});
 const report=await analytics.report(analyticsRange(params('7'),now));assert.deepEqual(report,{configured:true,available:false});
 const event=parseTrafficEvent({path:'/'},'https://labcafe.xyz');await analytics.collect(event,'198.51.100.1','Mozilla/5.0','https://labcafe.xyz');const before=calls;await analytics.collect(event,'198.51.100.1','Mozilla/5.0','https://labcafe.xyz');assert.equal(calls,before);
 assert.deepEqual(await new AnalyticsService(undefined).report(analyticsRange(params('7'),now)),{configured:false,available:false});
});
test('server conversions contain only daily counts, never identifiers, and apply retention',()=>{
 const store=new ConversionStore(':memory:');
 store.record('login_success',now);store.record('login_success',now);store.record('bot_joined',now-91*86400000);store.record('bot_joined',now);
 const stats=store.stats('2026-01-01','2026-12-31');assert.equal(stats.loginSuccess,2);assert.equal(stats.botJoined,1);assert.throws(()=>store.record('anything'));store.close();
});

