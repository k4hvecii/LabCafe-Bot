import test from 'node:test';
import assert from 'node:assert/strict';
import {SlashCommandBuilder} from 'discord.js';
import {createGuildCommandSync} from '../src/bot/guild-commands.ts';
import {readConfig} from '../src/config/env.ts';
const commands=[{data:new SlashCommandBuilder().setName('ping').setDescription('Test komutu'),async run(){}}];

test('joined-guild mode is explicit and validates configuration without changing default scope',()=>{
 const env={DISCORD_TOKEN:'offline-test',DISCORD_CLIENT_ID:'123456789012345678',DISCORD_GUILD_ID:'223456789012345678'};
 assert.equal(readConfig(env).registerJoinedGuilds,undefined);
 assert.equal(readConfig({...env,DISCORD_REGISTER_JOINED_GUILDS:'true'}).registerJoinedGuilds,true);
 assert.equal(readConfig({...env,DISCORD_REGISTER_JOINED_GUILDS:'true'}).guildId,env.DISCORD_GUILD_ID);
 assert.throws(()=>readConfig({...env,DISCORD_REGISTER_JOINED_GUILDS:'yes'}),/DISCORD_REGISTER_JOINED_GUILDS/);
});

test('guild synchronization coalesces repeated joins, serializes writes, skips blocked guilds and recovers after failures',async()=>{
 const writes=[];let active=0,maximum=0,fail=true;
 const target=id=>({id,commands:{async fetch(){if(id==='failed'&&fail)throw new Error('offline');return new Map();},async set(){active++;maximum=Math.max(active,maximum);await new Promise(resolve=>setImmediate(resolve));writes.push(id);active--;}}});
 const sync=createGuildCommandSync(commands,id=>id!=='blocked');
 const first=target('first');const p=sync(first);assert.equal(sync(first),p);
 await Promise.all([p,sync(target('second'))]);assert.deepEqual(writes,['first','second']);assert.equal(maximum,1);
 assert.equal(await sync(target('blocked')),null);
 await assert.rejects(sync(target('failed')),/offline/);
 await sync(target('third'));fail=false;await sync(target('failed'));
 assert.deepEqual(writes,['first','second','third','failed']);
});
