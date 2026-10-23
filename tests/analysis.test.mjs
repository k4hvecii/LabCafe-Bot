import test from 'node:test';
import assert from 'node:assert/strict';
import {ChannelType,PermissionFlagsBits,Routes} from 'discord.js';
import {createDiscordService} from '../src/dashboard/discord.ts';
import {analyze} from '../src/dashboard/server.ts';
const guild='123456789012345678';

test('read-only audit derives role and channel recommendations from Discord data without writes',async()=>{
 const requested=[];
 const roles=[{id:guild,name:'@everyone',permissions:String(PermissionFlagsBits.ManageRoles),managed:false},
  {id:'223456789012345678',name:'Yönetim',permissions:String(PermissionFlagsBits.Administrator),managed:false},
  {id:'323456789012345678',name:'Entegrasyon',permissions:String(PermissionFlagsBits.Administrator),managed:true}];
 const channels=[{id:'423456789012345678',type:ChannelType.GuildCategory,name:'Boş'},
  {id:'523456789012345678',type:ChannelType.GuildText,name:'genel',parent_id:null}];
 const service=createDiscordService({},'offline',{async get(route){requested.push(route);if(route===Routes.guild(guild))return {id:guild,name:'Test',icon:null,roles};if(route===Routes.guildChannels(guild))return channels;throw new Error('Unexpected request');}});
 const details=await service.getGuild(guild);assert.equal(details.audit.roleCount,3);assert.equal(details.audit.emptyCategoryCount,1);
 const report=analyze(details,{ephemeralReplies:true,commandChannelId:null},5,null);
 assert.equal(report.checks.find(c=>c.label==='@everyone yetkileri').ok,false);
 assert.match(report.checks.find(c=>c.label==='Yönetici rolleri').detail,/1 normal rol/);
 assert.equal(report.checks.find(c=>c.label==='Yönetici rolleri').status,'info');
 assert.equal(report.checks.find(c=>c.label==='Mesaj izinleri').ok,null);
 assert.deepEqual(requested,[Routes.guild(guild),Routes.guildChannels(guild)]);
 roles[0].permissions='0';const safe=analyze(await service.getGuild(guild),{ephemeralReplies:true,commandChannelId:null},5,null);
 assert.equal(safe.checks.find(c=>c.label==='@everyone yetkileri').ok,true);
});
