import test from 'node:test';
import assert from 'node:assert/strict';
import {MessageFlags,PermissionFlagsBits,PermissionsBitField,ChannelType,Events} from 'discord.js';
import {GuildSettingsStore,defaultSettings} from '../src/config/settings.ts';
import {SettingsPanel} from '../src/settings-panel/handler.ts';
import {renderSettingsPanel} from '../src/settings-panel/view.ts';
import {settingsPanelCommands} from '../src/settings-panel/prototype.ts';
import {settingsCommand} from '../src/commands/settings.ts';
import {loadCommands} from '../src/commands/index.ts';
import {readConfig} from '../src/config/env.ts';
import {createBot} from '../src/bot/client.ts';

const guild='111111111111111111',owner='222222222222222222',channel='333333333333333333',bot='444444444444444444',other='555555555555555555';
const permitted=()=>new PermissionsBitField([PermissionFlagsBits.ManageGuild]);
function fixture(){
 const store=new GuildSettingsStore(':memory:');let now=1000;
 const panel=new SettingsPanel(()=>now);
 const state={manager:true,memberManager:true,validChannel:true,botPermissions:true,fetches:0,hold:null,failFetch:false};
 const g={id:guild,members:{async fetch({user,force}){assert.equal(force,true);state.fetches++;if(state.hold)await state.hold;if(state.failFetch)throw new Error('offline');return {id:user,permissions:state.memberManager?permitted():new PermissionsBitField()};}},channels:{async fetch(id,{force}){assert.equal(force,true);return state.validChannel?{id,guildId:guild,type:ChannelType.GuildText,permissionsFor:()=>new PermissionsBitField(state.botPermissions?[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks]:[])}:null;}}};
 function interaction(kind='slash',id='',values=[]){
  const out={};return {out,user:{id:owner},client:{user:{id:bot}},guildId:guild,guild:g,channelId:channel,locale:'tr',memberPermissions:state.manager?permitted():new PermissionsBitField(),message:{id:'message'},customId:id,values,
   isButton:()=>kind==='button',isStringSelectMenu:()=>kind==='select',isChannelSelectMenu:()=>kind==='channel',isModalSubmit:()=>kind==='modal',
   async deferReply(p){out.defer=p;this.deferred=true;},async deferUpdate(){out.deferred=true;this.deferred=true;},
   async reply(p){out.reply=p;this.replied=true;},async editReply(p){out.edit=p;return {id:'message'};}};
 }
 let payload;
 return {store,panel,state,interaction,expire(){now+=300001;},async open(){const i=interaction();await panel.open(i,store);payload=i.out.edit;return i;},async act(action,kind='button',values=[],overrides={}){const i=Object.assign(interaction(kind,control(payload,action),values),overrides);await panel.handle(i,store);if(i.out.edit)payload=i.out.edit;return i;},payload:()=>payload};
}
function serialize(p){return {...p,components:p.components.map(c=>c.toJSON())};}
function flatten(p){const all=[];function walk(c){all.push(c);for(const child of c.components??[])walk(child);}for(const c of serialize(p).components)walk(c);return all;}
function control(p,action){const c=flatten(p).find(c=>c.custom_id?.endsWith(':'+action));assert.ok(c,action+' control absent');return c.custom_id;}
const text=p=>flatten(p).filter(c=>c.type===10).map(c=>c.content).join('\n');

// Every fixture uses an isolated SQLite database and never connects to Discord.
test('authorized opening is ephemeral V2, reads current settings and respects component limits',async()=>{
 const f=fixture();try{f.store.update(guild,{locale:'en',commandChannelId:channel,ephemeralReplies:false});const i=await f.open();assert.equal(i.out.defer.flags,MessageFlags.Ephemeral);const p=serialize(f.payload());assert.equal(p.flags,MessageFlags.IsComponentsV2);assert.equal(p.content,undefined);assert.equal(p.embeds,undefined);assert.match(text(f.payload()),/English/);assert.match(text(f.payload()),/Public/);assert.match(text(f.payload()),new RegExp(channel));assert.ok(flatten(f.payload()).length<=40);assert.ok(f.state.fetches>0);for(const c of flatten(f.payload())){if(c.custom_id)assert.ok(c.custom_id.length<=100);if(c.type===1)assert.ok(c.components.length<=5);}}finally{f.store.close();}
});
test('unauthorized opening and permission fetch failure cannot create writable sessions',async()=>{
 const f=fixture();try{f.state.manager=false;const i=await f.open();assert.match(i.out.edit.content,/yetkisi/);assert.equal(f.store.history(guild).length,0);f.state.manager=true;f.state.failFetch=true;const failed=await f.open();assert.match(failed.out.edit.content,/doğrulanamadı/);}finally{f.store.close();}
});
test('language and visibility stay draft until preview and explicit confirmation, then audit once',async()=>{
 const f=fixture();try{await f.open();await f.act('locale','select',['en']);await f.act('visibility','select',['public']);assert.deepEqual(f.store.get(guild),defaultSettings());await f.act('save');assert.match(text(f.payload()),/English/);assert.deepEqual(f.store.get(guild),defaultSettings());const id=control(f.payload(),'confirm');await f.act('confirm');assert.deepEqual(f.store.get(guild),{locale:'en',ephemeralReplies:false,commandChannelId:null});assert.equal(f.store.history(guild).length,1);assert.equal(f.store.history(guild)[0].actorId,owner);assert.match(text(f.payload()),/Saved/);const replay=f.interaction('button',id);await f.panel.handle(replay,f.store);assert.match(replay.out.reply.content,/outdated/);assert.equal(f.store.history(guild).length,1);assert.equal(f.payload().flags,MessageFlags.IsComponentsV2);}finally{f.store.close();}
});
test('session checks owner, guild, channel and message for every component type',async()=>{
 for(const kind of ['button','select','channel'])for(const override of [{user:{id:other}},{guildId:other},{channelId:other},{message:{id:'another-message'}}]){
  const f=fixture();try{await f.open();const action=kind==='button'?'save':kind==='select'?'locale':'channel';const i=await f.act(action,kind,kind==='select'?['en']:[channel],override);assert.match(i.out.reply.content,/ait değil/);assert.deepEqual(f.store.get(guild),defaultSettings());assert.equal(f.store.history(guild).length,0);}finally{f.store.close();}
 }
});
test('permissions are rechecked, including cached interaction permission versus freshly fetched member',async()=>{
 for(const revoke of ['manager','memberManager']){const f=fixture();try{await f.open();f.state[revoke]=false;await f.act('locale','select',['en']);assert.match(text(f.payload()),/yetkisi/);assert.equal(flatten(f.payload()).some(c=>c.custom_id),false);assert.equal(f.store.history(guild).length,0);}finally{f.store.close();}}
});
test('valid channel can be selected and cleared; deleted, foreign, non-text and inaccessible channels are rejected',async()=>{
 const f=fixture();try{await f.open();await f.act('channel','channel',[channel]);await f.act('save');await f.act('confirm');assert.equal(f.store.get(guild).commandChannelId,channel);await f.act('channel','channel',[]);await f.act('save');await f.act('confirm');assert.equal(f.store.get(guild).commandChannelId,null);
  f.state.validChannel=false;await f.act('channel','channel',[channel]);assert.match(text(f.payload()),/metin kanalı/);f.state.validChannel=true;f.state.botPermissions=false;await f.act('channel','channel',[channel]);assert.match(text(f.payload()),/metin kanalı/);await f.act('channel','channel',['bad']);assert.match(text(f.payload()),/metin kanalı/);
  for(const invalid of [{guildId:other,type:ChannelType.GuildText},{guildId:guild,type:ChannelType.GuildVoice}]){f.interaction().guild.channels.fetch=async()=>({id:channel,...invalid,permissionsFor:()=>new PermissionsBitField(PermissionFlagsBits.Administrator)});await f.act('channel','channel',[channel]);assert.match(text(f.payload()),/metin kanalı/);}
 }finally{f.store.close();}
});
test('channel permissions are checked again on confirm',async()=>{
 const f=fixture();try{await f.open();await f.act('channel','channel',[channel]);await f.act('save');f.state.botPermissions=false;await f.act('confirm');assert.match(text(f.payload()),/Kanalı yeniden seç/);assert.equal(f.store.history(guild).length,0);}finally{f.store.close();}
});
test('cancel, back and close never persist draft changes',async()=>{
 const f=fixture();try{await f.open();await f.act('locale','select',['en']);await f.act('save');await f.act('back');assert.match(text(f.payload()),/English/);await f.act('cancel');assert.match(text(f.payload()),/Türkçe/);await f.act('visibility','select',['public']);const closeId=control(f.payload(),'close');await f.act('close');assert.equal(flatten(f.payload()).some(c=>c.custom_id),false);const i=f.interaction('button',closeId);await f.panel.handle(i,f.store);assert.match(i.out.reply.content,/süresi doldu/);assert.deepEqual(f.store.get(guild),defaultSettings());assert.equal(f.store.history(guild).length,0);}finally{f.store.close();}
});
test('reset requires explicit confirmation and preserves reset audit semantics',async()=>{
 const f=fixture();try{f.store.update(guild,{locale:'en',ephemeralReplies:false,commandChannelId:channel});await f.open();await f.act('reset');assert.equal(f.store.get(guild).locale,'en');await f.act('back');assert.equal(f.store.history(guild).length,0);await f.act('reset');await f.act('confirm');assert.deepEqual(f.store.get(guild),defaultSettings());assert.equal(f.store.history(guild)[0].action,'reset');}finally{f.store.close();}
});
test('both save and reset reject dashboard changes atomically and offer reload',async()=>{
 for(const mode of ['save','reset']){const f=fixture();try{f.store.update(guild,{ephemeralReplies:false});await f.open();if(mode==='save')await f.act('locale','select',['en']);await f.act(mode);f.store.update(guild,{commandChannelId:other},other);await f.act('confirm');assert.match(text(f.payload()),/başka bir yerde/);assert.equal(f.store.get(guild).commandChannelId,other);assert.equal(f.store.history(guild).length,1);await f.act('refresh');assert.match(text(f.payload()),new RegExp(other));assert.ok(control(f.payload(),'save'));}finally{f.store.close();}}
});
test('reset expected-state check rolls back without deleting settings or adding history',()=>{const s=new GuildSettingsStore(':memory:');try{const old=s.get(guild);s.update(guild,{locale:'en'},owner);assert.throws(()=>s.reset(guild,owner,old),/SETTINGS_CONFLICT/);assert.equal(s.get(guild).locale,'en');assert.equal(s.history(guild).length,1);}finally{s.close();}});
test('in-flight double confirmation is acknowledged safely and writes once',async()=>{
 const f=fixture();try{await f.open();await f.act('locale','select',['en']);await f.act('save');const id=control(f.payload(),'confirm');let release;f.state.hold=new Promise(resolve=>release=resolve);const first=f.interaction('button',id);const pending=f.panel.handle(first,f.store);await Promise.resolve();const second=f.interaction('button',id);await f.panel.handle(second,f.store);assert.match(second.out.reply.content,/sürüyor/);release();await pending;assert.equal(f.store.history(guild).length,1);}finally{f.store.close();}
});
test('expired, restarted and malformed panels fail closed; no help interaction is intercepted',async()=>{
 const f=fixture();try{await f.open();const id=control(f.payload(),'reset');const fresh=new SettingsPanel();const restart=f.interaction('button',id);await fresh.handle(restart,f.store);assert.match(restart.out.reply.content,/süresi doldu/);f.expire();const expired=f.interaction('button',id);await f.panel.handle(expired,f.store);assert.match(expired.out.reply.content,/süresi doldu/);const malformed=f.interaction('button','lc.settings:bad');await f.panel.handle(malformed,f.store);assert.match(malformed.out.reply.content,/süresi doldu/);assert.equal(await f.panel.handle(f.interaction('button','lc.help:any:home'),f.store),false);assert.equal(f.store.history(guild).length,0);}finally{f.store.close();}
});
test('invalid values, wrong component types and direct confirmation cannot write',async()=>{
 const f=fixture();try{await f.open();await f.act('locale','select',['de']);assert.match(text(f.payload()),/Geçersiz/);await f.act('visibility','select',['yes']);await f.act('locale','button');const save=control(f.payload(),'save');const forged=f.interaction('button',save.replace(/save$/,'confirm'));await f.panel.handle(forged,f.store);assert.match(text(forged.out.edit),/Geçersiz/);assert.equal(f.store.history(guild).length,0);}finally{f.store.close();}
});
test('beta revocation and REST outages cannot write',async()=>{
 const f=fixture();try{await f.open();await f.act('locale','select',['en']);await f.act('save');f.state.failFetch=true;await f.act('confirm');assert.equal(f.store.history(guild).length,0);assert.match(text(f.payload()),/tamamlanamadı/);f.state.failFetch=false;f.store.setBetaPolicy({enabled:true,guildIds:[]},owner);await f.act('close');assert.match(text(f.payload()),/yetkisi/);assert.equal(f.store.history(guild).length,0);}finally{f.store.close();}
});
test('prototype configuration refuses global, joined-guild, production and mismatched application scopes',async()=>{
 const env={DISCORD_TOKEN:'offline-test-token',DISCORD_CLIENT_ID:bot,DISCORD_GUILD_ID:guild,NODE_ENV:'test',LABCAFE_SETTINGS_PANEL_PROTOTYPE:'true',LABCAFE_TEST_APPLICATION_ID:bot};
 for(const override of [{DISCORD_GUILD_ID:''},{NODE_ENV:'production'},{NODE_ENV:''},{DISCORD_REGISTER_JOINED_GUILDS:'true'},{LABCAFE_TEST_APPLICATION_ID:owner},{LABCAFE_SETTINGS_PANEL_PROTOTYPE:'yes'}])assert.throws(()=>readConfig({...env,...override}));
 const commands=await loadCommands();const original=commands.find(c=>c.data.name==='ayarlar');assert.equal(original.data.toJSON().options.length,5);assert.equal(settingsPanelCommands(commands,readConfig({...env,LABCAFE_SETTINGS_PANEL_PROTOTYPE:'false'})),commands);
 const selected=settingsPanelCommands(commands,readConfig(env));assert.equal(selected.find(c=>c.data.name==='ayarlar').data.toJSON().options.length,0);assert.equal(original.data.toJSON().options.length,5);assert.equal(selected.find(c=>c.data.name==='yardım'),commands.find(c=>c.data.name==='yardım'));assert.throws(()=>settingsPanelCommands(commands,{...readConfig(env),guildId:undefined}));
 const f=fixture();try{const run=selected.find(c=>c.data.name==='ayarlar').run;await assert.rejects(run({...f.interaction(),guildId:other},{settingsStore:f.store}),/restricted/);}finally{f.store.close();}
});
test('bot event router dispatches channel selects to settings without breaking help routing',async()=>{
 const f=fixture();const cfg=readConfig({DISCORD_TOKEN:'offline-test-token',DISCORD_CLIENT_ID:bot,DISCORD_GUILD_ID:guild,NODE_ENV:'test',LABCAFE_SETTINGS_PANEL_PROTOTYPE:'true',LABCAFE_TEST_APPLICATION_ID:bot});const client=createBot('error',cfg.token,[settingsCommand],cfg,f.store);
 try{const slash=f.interaction();slash.commandName='ayarlar';slash.isChatInputCommand=()=>true;slash.inGuild=()=>true;slash.isRepliable=()=>true;slash.member={roles:[]};slash.channel={isThread:()=>false};const opened=new Promise(resolve=>{const edit=slash.editReply;slash.editReply=async p=>{const r=await edit.call(slash,p);resolve(p);return r;};});client.emit(Events.InteractionCreate,slash);const p=await Promise.race([opened,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Panel open timeout')),2000).unref())]);await new Promise(resolve=>setImmediate(resolve));const select=f.interaction('channel',control(p,'channel'),[channel]);select.isRepliable=()=>true;const done=new Promise(resolve=>{const edit=select.editReply;select.editReply=async p=>{const r=await edit.call(select,p);resolve(p);return r;};});client.emit(Events.InteractionCreate,select);assert.match(text(await Promise.race([done,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Panel component timeout')),2000).unref())])),new RegExp(channel));assert.equal(f.store.history(guild).length,0);}finally{await client.destroy();f.store.close();}
});

test('back from reset restores the unsaved draft instead of staging defaults',async()=>{
 const f=fixture();try{await f.open();await f.act('locale','select',['en']);await f.act('reset');await f.act('back');assert.match(text(f.payload()),/English/);assert.deepEqual(f.store.get(guild),defaultSettings());}finally{f.store.close();}
});
test('permission revocation and expiry while confirmation is in flight prevent writes',async()=>{
 for(const change of ['permission','expiry']){const f=fixture();try{await f.open();await f.act('locale','select',['en']);await f.act('save');let release;f.state.hold=new Promise(resolve=>release=resolve);const i=f.interaction('button',control(f.payload(),'confirm'));const pending=f.panel.handle(i,f.store);await Promise.resolve();if(change==='permission')f.state.memberManager=false;else f.expire();release();await pending;assert.equal(f.store.history(guild).length,0);assert.equal(flatten(i.out.edit).some(c=>c.custom_id),false);}finally{f.store.close();}}
});
test('open and component acknowledgements precede slow REST requests',async()=>{
 const f=fixture();try{let release;f.state.hold=new Promise(resolve=>release=resolve);const open=f.interaction();const pending=f.panel.open(open,f.store);await Promise.resolve();assert.equal(open.out.defer.flags,MessageFlags.Ephemeral);release();await pending;f.state.hold=null;
 const i=f.interaction('select',control(open.out.edit,'locale'),['en']);f.state.hold=new Promise(resolve=>release=resolve);const action=f.panel.handle(i,f.store);await Promise.resolve();assert.equal(i.out.deferred,true);release();await action;assert.equal(f.store.history(guild).length,0);
 }finally{f.store.close();}
});


test('production opt-in selects the same panel across normal registration scopes without weakening prototype isolation',async()=>{
 const base={DISCORD_TOKEN:'offline-test-token',DISCORD_CLIENT_ID:bot,NODE_ENV:'production',LABCAFE_SETTINGS_PANEL_ENABLED:'true'};
 const commands=await loadCommands();
 for(const scope of [{},{DISCORD_GUILD_ID:guild},{DISCORD_REGISTER_JOINED_GUILDS:'true',DISCORD_GUILD_ID:guild}]){
  const cfg=readConfig({...base,...scope});assert.equal(cfg.settingsPanelEnabled,true);assert.equal(cfg.settingsPanelPrototype,undefined);
  const f=fixture();try{
   const selected=settingsPanelCommands(commands,cfg,f.panel);const settings=selected.find(c=>c.data.name==='ayarlar');
   assert.equal(settings.data.toJSON().options.length,0);assert.equal(settings.data.toJSON().default_member_permissions,'32');assert.equal(settings.data.toJSON().dm_permission,false);
   for(const command of commands.filter(c=>c.data.name!=='ayarlar'))assert.equal(selected.find(c=>c.data.name===command.data.name),command);
   await settings.run(f.interaction(),{settingsStore:f.store});assert.equal(f.store.history(guild).length,0);
   const unauthorized=f.interaction();unauthorized.memberPermissions=new PermissionsBitField();await settings.run(unauthorized,{settingsStore:f.store});assert.match(unauthorized.out.edit.content,/yetkisi/);
  }finally{f.store.close();}
 }
 assert.equal(settingsPanelCommands(commands,readConfig({...base,LABCAFE_SETTINGS_PANEL_ENABLED:'false'})),commands);
 for(const invalid of ['1','TRUE','yes'])assert.throws(()=>readConfig({...base,LABCAFE_SETTINGS_PANEL_ENABLED:invalid}));
 assert.throws(()=>readConfig({...base,LABCAFE_SETTINGS_PANEL_PROTOTYPE:'true'}),/not both/);
 assert.throws(()=>settingsPanelCommands(commands,{...readConfig(base),settingsPanelPrototype:true}),/one settings panel mode/);
});
