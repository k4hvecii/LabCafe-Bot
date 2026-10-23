import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Events } from 'discord.js';
import { createHealthServer } from '../src/core/health.ts';
import { GuildSettingsStore } from '../src/config/settings.ts';
import { createBot } from '../src/bot/client.ts';

test('health transitions between unavailable, ready and failed without exposing errors', async t => {
  let ready = false;
  const server = createHealthServer(() => {
    if (ready === 'failed') throw new Error('private dependency detail');
    return ready;
  });
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}/healthz`;
  assert.equal((await fetch(url)).status,503);
  ready = true;
  assert.deepEqual(await (await fetch(url)).json(),{ready:true});
  ready = 'failed';
  const failed = await fetch(url);
  assert.equal(failed.status,503);
  assert.deepEqual(await failed.json(),{ready:false});
  assert.equal((await fetch(url+'/other')).status,404);
});

test('guild departure and rejoin preserve guild settings and isolation', async () => {
  const store = new GuildSettingsStore(':memory:');
  const id = '123456789012345678';
  const other = '223456789012345678';
  const client = createBot('error','offline',[],{clientId:id,logLevel:'error'},store);
  try {
    store.update(id,{ephemeralReplies:false});
    client.emit(Events.GuildDelete,{id});
    client.emit(Events.GuildCreate,{id});
    assert.equal(store.get(id).ephemeralReplies,false);
    assert.equal(store.get(other).ephemeralReplies,true);
    assert.equal(store.healthy(),true);
  } finally { await client.destroy(); store.close(); }
  assert.throws(() => store.healthy());
});

test('private bot metrics require a separate bearer key and keep public health minimal',async t=>{
  const token='test-observer-key-'.repeat(3);let calls=0;
  assert.throws(()=>createHealthServer(()=>true,{token:'weak',snapshot:()=>({})}));
  const server=createHealthServer(()=>true,{token,snapshot:range=>{calls++;return {service:'bot',range,ready:true};}});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const base=`http://127.0.0.1:${server.address().port}`;
  assert.deepEqual(await(await fetch(base+'/healthz')).json(),{ready:true});
  assert.equal((await fetch(base+'/metrics')).status,401);
  assert.equal((await fetch(base+'/metrics?token='+token)).status,401);
  assert.equal((await fetch(base+'/metrics',{headers:{Authorization:'Bearer wrong'}})).status,401);
  assert.equal(calls,0);
  const headers={Authorization:'Bearer '+token};
  assert.equal((await fetch(base+'/metrics?range=forever',{headers})).status,400);
  const result=await fetch(base+'/metrics?range=15m',{headers});
  assert.equal(result.headers.get('cache-control'),'no-store');
  assert.deepEqual(await result.json(),{service:'bot',range:'15m',ready:true});
  assert.equal(calls,1);
});

test('bot metrics export is disabled by default and exporter failure is contained',async t=>{
  for(const enabled of [false,true]){
    const token='separate-observer-key-'.repeat(2);
    const server=createHealthServer(()=>true,enabled?{token,snapshot(){throw new Error('private-token');}}:undefined);
    server.listen(0,'127.0.0.1');await once(server,'listening');
    t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
    const base=`http://127.0.0.1:${server.address().port}`;
    const result=await fetch(base+'/metrics',{headers:{Authorization:'Bearer '+token}});
    assert.equal(result.status,enabled?503:404);assert.ok(!(await result.text()).includes('private'));
    assert.equal((await fetch(base+'/healthz')).status,200);
  }
});
