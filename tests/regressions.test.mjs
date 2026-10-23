import test from 'node:test';
import assert from 'node:assert/strict';
import { Events } from 'discord.js';
import { createBot, isBotReady } from '../src/bot/client.ts';
import { GuildSettingsStore } from '../src/config/settings.ts';
import { createDiscordService } from '../src/dashboard/discord.ts';

test('failed command registration invokes fatal shutdown and never reports ready', async () => {
  const store=new GuildSettingsStore(':memory:');
  let finish;
  const failed=new Promise(resolve=>{finish=resolve;});
  const id='123456789012345678';
  const client=createBot('error','offline',[],{clientId:id,logLevel:'error'},store,finish);
  try {
    assert.equal(isBotReady(client),false);
    client.emit(Events.ClientReady,{guilds:{cache:{size:0}},user:{id},application:{id,commands:{async fetch(){throw new Error('offline');}}}});
    await failed;
    assert.equal(isBotReady(client),false);
  } finally { await client.destroy(); store.close(); }
});

test('bot membership reads share concurrent work, paginate fully and refresh after completion', async () => {
  const rows=Array.from({length:201},(_,i)=>({id:String(123456789012345678n+BigInt(i)),name:'Test',features:[]}));
  let calls=0;
  const service=createDiscordService({},'offline',{async get(route,{query}){
    calls++;
    await new Promise(resolve=>setImmediate(resolve));
    return query.has('after')?rows.slice(200):rows.slice(0,200);
  }});
  const [first,second]=await Promise.all([service.getBotGuildIds(),service.getBotGuildIds()]);
  assert.equal(calls,2);
  assert.equal(first.length,201);
  assert.deepEqual(first,second);
  await service.getBotGuildIds();
  assert.equal(calls,4);
});
