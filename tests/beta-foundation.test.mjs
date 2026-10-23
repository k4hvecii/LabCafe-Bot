import {GuildSettingsStore} from '../src/config/settings.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, MessageFlags, PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { clientIp } from '../src/dashboard/client-ip.ts';
import { readDashboardConfig } from '../src/dashboard/config.ts';
import { setupCommand } from '../src/commands/setup.ts';
import { helpCommand } from '../src/commands/help.ts';

test('proxy headers are trusted only with explicit opt-in and loopback peer', () => {
  const req = (peer, value) => ({socket:{remoteAddress:peer},headers:{'x-real-ip':value}});
  assert.equal(clientIp(req('127.0.0.1','203.0.113.10')), '127.0.0.1');
  assert.equal(clientIp(req('127.0.0.1','203.0.113.10'),true), '203.0.113.10');
  assert.equal(clientIp(req('198.51.100.1','203.0.113.10'),true), '198.51.100.1');
  assert.equal(clientIp(req('::1','fake, 1.2.3.4'),true), '::1');
  assert.equal(clientIp(req('::1',['1.2.3.4']),true), '::1');
  assert.throws(() => readDashboardConfig({DASHBOARD_TRUST_LOOPBACK_PROXY:'yes'}));
});

test('setup rejects unauthorized users and reports only verified channel permissions', async () => {
  let reply;
  const input = {inGuild:()=>true,memberPermissions:new PermissionsBitField(),
    appPermissions:new PermissionsBitField(),reply:async payload=>{reply=payload;}};
  await setupCommand.run(input);
  assert.match(reply.embeds[0].toJSON().description,/Sunucuyu Yönet/);
  input.memberPermissions.add(PermissionFlagsBits.ManageGuild);
  await setupCommand.run(input);
  assert.match(reply.embeds[0].toJSON().description,/eksik izinler/);
  input.appPermissions.add(PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks);
  await setupCommand.run(input);
  assert.match(reply.embeds[0].toJSON().description,/temel bot izinleri uygun/);
  input.appPermissions=null;
  await setupCommand.run(input);
  assert.match(reply.embeds[0].toJSON().description,/doğrulanamadı/);
});

test('help command opens the independent catalog through the standard command context',async()=>{
 const store=new GuildSettingsStore(':memory:');let reply;
 try{await helpCommand.run({user:{id:'123456789012345678'},options:{getString:()=>null},guildId:null,channelId:null,locale:'en-US',memberPermissions:null,reply:async p=>{reply=p;}},{commands:[helpCommand],settings:store.get('123456789012345678'),settingsStore:store});
 assert.equal(reply.embeds[0].toJSON().title,'Command guide');assert.equal(reply.allowedMentions.parse.length,0);assert.ok(reply.components.length<=5);assert.notEqual(reply.flags,MessageFlags.IsComponentsV2);
 }finally{store.close();}
});
