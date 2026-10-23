import test from 'node:test';
import assert from 'node:assert/strict';
import { REST, RESTEvents, Routes } from 'discord.js';
import { DiscordRestMetrics } from '../src/observability/discord-metrics.ts';
import { restCategory, measuredRestTransport, measuredFetch, observeRateLimits } from '../src/observability/discord-rest.ts';
import { StartupTracker } from '../src/observability/startup.ts';
import { createLogger } from '../src/core/logger.ts';

function cleanup(rest){rest.clearHashSweeper();rest.clearHandlerSweeper();}

test('per-window latency series uses each bucket histogram and preserves missing observations',()=>{
 let now=Date.parse('2026-10-22T10:00:01Z');const metrics=new DiscordRestMetrics('bot',()=>now);metrics.attempt('other',9,200);now+=60000;metrics.attempt('other',900,500);
 const series=metrics.snapshot('15m').series;assert.equal(series.at(-2).p95,10);assert.equal(series.at(-1).p95,1000);assert.equal(series[0].p95,null);assert.equal(series.at(-1).httpErrors,1);
});

test('route categories discard identifiers, queries and webhook/interaction credentials',()=>{
  const cases=[['/guilds/123','guild_read'],['/guilds/123/channels','channel_read'],['/channels/123/messages','channel_read'],
    ['/applications/123/guilds/456/commands','command_sync'],['/interactions/123/private-token/callback','interaction_response'],
    ['/webhooks/123/private-token','interaction_response'],['/users/@me/guilds?after=secret','identity_read'],['/oauth2/token','oauth_token']];
  for(const [path,expected] of cases)assert.equal(restCategory('https://discord.com/api/v10'+path),expected);
  assert.equal(restCategory('https://discord.com/api/v10/users/@me','oauth'),'oauth_user');
  assert.equal(restCategory('invalid'),'other');
});

test('aggregates HTTP attempts, errors and bounded histogram quantiles without retaining raw data',()=>{
  let now=1_000_000;const metrics=new DiscordRestMetrics('bot',()=>now);
  metrics.attempt('guild_read',20,200);metrics.attempt('channel_read',400,403);
  metrics.attempt('other',1000,null,'timeout');metrics.attempt('unknown-private-id',1,429);
  metrics.rateLimited(true,3000);
  const report=metrics.snapshot('15m');
  assert.equal(report.attempts,4);assert.equal(report.responses,3);assert.equal(report.successful,1);
  assert.equal(report.httpErrors,2);assert.equal(report.networkErrors,1);assert.equal(report.timeouts,1);
  assert.equal(report.statuses['429'],1);assert.equal(report.categories.other,2);
  assert.equal(report.latency.p50,25);assert.equal(report.latency.p95,1000);
  assert.equal(report.globalRateLimitEvents,1);assert.equal(report.retryAfterSumMs,3000);
  assert.equal(report.queueSize,null);assert.equal(report.queueWaitMs,null);assert.equal(report.retryAttempts,null);
  assert.ok(!JSON.stringify(report).includes('unknown-private-id'));
  report.histogram[0]=999;assert.notEqual(metrics.snapshot().histogram[0],999);
});

test('window bounds, missing history, empty quantiles and idle expiry remain truthful',()=>{
  let now=Date.UTC(2026,9,22,12,30,0);const metrics=new DiscordRestMetrics('dashboard',()=>now);
  const initial=metrics.snapshot('30d');
  assert.equal(initial.attempts,0);assert.equal(initial.latency.p99,null);
  assert.ok(initial.series.some(point=>point.attempts===null));
  metrics.attempt('other',70000,500);
  assert.equal(metrics.snapshot().latency.p95,null);
  assert.equal(metrics.snapshot().latency.overflowCount,1);
  now+=31*86400000;
  assert.equal(metrics.snapshot('30d').attempts,0);
  metrics.attempt('other',20,200);
  assert.equal(metrics.snapshot('30d').attempts,1);
  assert.equal(metrics.snapshot('15m').attempts,1);
  assert.equal(metrics.snapshot('15m').series.length,15);
  assert.equal(metrics.snapshot('30d').series.length,720);
});

test('transport preserves response identity/body and original failures while telemetry is unavailable',async()=>{
  const response=Response.json({private:'not for telemetry'});const failure=new Error('private-network-detail');
  const metrics=new DiscordRestMetrics('bot');
  let tick=0;const request=measuredRestTransport(metrics,async()=>response,()=>tick+=10);
  assert.equal(await request('https://discord.com/api/v10/guilds/private-id',{}),response);
  assert.equal(response.bodyUsed,false);
  assert.equal(metrics.snapshot().attempts,1);
  assert.ok(!JSON.stringify(metrics.snapshot()).includes('private'));
  const unavailable={attempt(){throw new Error('telemetry offline');}};
  assert.equal(await measuredRestTransport(unavailable,async()=>response)('https://discord.com',{}),response);
  await assert.rejects(measuredRestTransport(unavailable,async()=>{throw failure;})('https://discord.com',{}),error=>error===failure);
});

test('OAuth fetch observes status and timeout without consuming content or capturing credentials',async()=>{
  const metrics=new DiscordRestMetrics('dashboard');
  const response=Response.json({access_token:'private-token'});
  const request=measuredFetch(metrics,async()=>response);
  assert.equal(await request('https://discord.com/api/oauth2/token',{body:'client_secret=private-secret'}),response);
  assert.equal(response.bodyUsed,false);
  const timeout=new DOMException('private timeout','TimeoutError');
  await assert.rejects(measuredFetch(metrics,async()=>{throw timeout;})('https://discord.com/api/v10/users/@me'),error=>error===timeout);
  const report=metrics.snapshot();assert.equal(report.timeouts,1);assert.equal(report.categories.oauth_token,1);
  assert.ok(!JSON.stringify(report).includes('private'));
});

test('rate-limit listeners attach once and dispose without changing SDK limits',()=>{
  const rest=new REST();const metrics=new DiscordRestMetrics('bot');
  try{
    const dispose=observeRateLimits(rest,metrics);assert.equal(observeRateLimits(rest,metrics),dispose);
    rest.emit(RESTEvents.RateLimited,{global:false,retryAfter:100});
    assert.equal(metrics.snapshot().rateLimitEvents,1);assert.equal(metrics.snapshot().statuses['429'],undefined);
    dispose();rest.emit(RESTEvents.RateLimited,{global:true,retryAfter:100});
    assert.equal(metrics.snapshot().rateLimitEvents,1);
  }finally{cleanup(rest);}
});

test('real SDK queue retries 429 and 5xx with measured physical attempts, no live Discord traffic',async()=>{
  for(const status of [429,500]){
    const metrics=new DiscordRestMetrics('bot');let calls=0;
    const rest=new REST({offset:0,retries:1,makeRequest:measuredRestTransport(metrics,async()=>{
      calls++;return calls===1?Response.json(status===429?{retry_after:.01,global:true}:{message:'retry'},{status,headers:status===429?{'Retry-After':'0.01','X-RateLimit-Global':'true'}:{}}):Response.json({id:'ok'});
    })}).setToken('offline');
    const dispose=observeRateLimits(rest,metrics);
    try{assert.deepEqual(await rest.get(Routes.guild('123456789012345678')),{id:'ok'});assert.equal(calls,2);
      const report=metrics.snapshot();assert.equal(report.attempts,2);assert.equal(report.statuses[String(status)],1);assert.equal(report.statuses['200'],1);
    }finally{dispose();cleanup(rest);}
  }
});

test('startup phases report measured completion/failure and never fake readiness or error names',()=>{
  const output=[];let tick=0;
  const startup=new StartupTracker(createLogger('trace',[],{format:'json',sink:line=>output.push(line)}),()=>tick);
  startup.start('ready');startup.start('commands');tick=15;startup.complete('commands',5);
  assert.equal(startup.snapshot().find(phase=>phase.phase==='ready').status,'running');
  assert.equal(startup.snapshot().find(phase=>phase.phase==='commands').durationMs,15);
  startup.start('database');tick=20;const error=new Error('private-password');error.name='private-token';startup.fail('database',error);
  startup.complete('database');
  assert.equal(startup.snapshot().find(phase=>phase.phase==='database').status,'failed');
  assert.ok(!JSON.stringify(startup.snapshot()).includes('private'));
  assert.ok(!output.join('').includes('private'));
  const copy=startup.snapshot();copy[0].status='failed';assert.equal(startup.snapshot()[0].status,'running');
});

import { createBot } from '../src/bot/client.ts';
import { GuildSettingsStore } from '../src/config/settings.ts';
import { Events } from 'discord.js';

test('bot lifecycle stays unready until command synchronization completes and removes metric listeners on destroy',async()=>{
  const store=new GuildSettingsStore(':memory:');const id='123456789012345678';
  const startup=new StartupTracker(createLogger('error',[],{sink(){}}));const rest=new DiscordRestMetrics('bot');
  startup.start('ready');startup.start('gateway');
  let release;const gate=new Promise(resolve=>{release=resolve;});
  const command={data:{name:'ping',toJSON(){return {name:'ping',description:'Test'};}},async run(){}};
  const client=createBot('error','offline',[command],{clientId:id,logLevel:'error'},store,()=>assert.fail('unexpected fatal'),undefined,{rest,startup});
  try{
    client.emit(Events.ClientReady,{guilds:{cache:{size:0}},user:{id},application:{id,commands:{async fetch(){await gate;return new Map();},async set(){}}}});
    assert.equal(startup.snapshot().find(item=>item.phase==='gateway').status,'succeeded');
    assert.equal(startup.snapshot().find(item=>item.phase==='ready').status,'running');
    release();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(startup.snapshot().find(item=>item.phase==='ready').status,'succeeded');
    assert.equal(startup.snapshot().find(item=>item.phase==='command_sync').count,1);
    assert.equal(client.rest.listenerCount(RESTEvents.RateLimited),1);
    await client.destroy();assert.equal(client.rest.listenerCount(RESTEvents.RateLimited),0);
  }finally{await client.destroy();store.close();}
});
