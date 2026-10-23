import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Client,MessageFlags,PermissionFlagsBits} from 'discord.js';
import {GuildSettingsStore} from '../src/config/settings.ts';
import {localizedInteraction,localizePayload} from '../src/i18n/interaction.ts';
import {translate} from '../src/i18n/catalog.ts';
import {settingsCommand} from '../src/commands/settings.ts';
import {loadCommands} from '../src/commands/index.ts';
import {renderHelp,freshState} from '../src/help/view.ts';
const guild='123456789012345678';

test('existing SQLite settings migrate without losing preferences; locale persists and is validated',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'labcafe-language-'));const path=join(directory,'settings.sqlite');
 const old=new DatabaseSync(path);old.exec('CREATE TABLE guild_settings(guild_id TEXT PRIMARY KEY,ephemeral INTEGER NOT NULL,command_channel_id TEXT)');old.prepare('INSERT INTO guild_settings VALUES(?,0,NULL)').run(guild);old.close();
 let store=new GuildSettingsStore(path);assert.deepEqual(store.get(guild),{locale:'tr',ephemeralReplies:false,commandChannelId:null});
 store.update(guild,{locale:'en'},guild);store.close();store=new GuildSettingsStore(path);
 assert.equal(store.get(guild).locale,'en');assert.equal(store.get('223456789012345678').locale,'tr');
 assert.throws(()=>store.update(guild,{locale:'de'}));assert.equal(store.history(guild).length,1);
 store.reset(guild,guild);assert.equal(store.get(guild).locale,'tr');store.close();await rm(directory,{recursive:true});
});

test('display translation preserves IDs, URLs, command code and mention targets',()=>{
 const payload={content:'Komut Ara `/yardım` https://labcafe.xyz/ <@123456789012345678>',components:[{label:'Düzenle',custom_id:'help:edit:yardım',value:'gizli',url:'https://labcafe.xyz/'}],flags:MessageFlags.Ephemeral};
 const english=localizePayload(payload,'en');assert.match(english.content,/Search Commands/);assert.match(english.content,/`\/yardım`/);
 assert.equal(english.components[0].custom_id,payload.components[0].custom_id);assert.equal(english.components[0].value,'gizli');assert.equal(english.components[0].url,payload.components[0].url);assert.equal(english.flags,payload.flags);
 assert.equal(translate('Server ve roller','en'),'Server and roller');assert.equal(translate('Gizlilik Politikası','tr'),'Gizlilik Politikası');
});

test('language command is manager-only and its response uses the newly saved language',async()=>{
 const store=new GuildSettingsStore(':memory:');let payload;
 const input={guildId:guild,locale:'tr',user:{id:guild},inGuild:()=>true,memberPermissions:{has:()=>true},options:{getSubcommand:()=> 'dil',getString:()=> 'en'},reply:async p=>{payload=p;}};
 await settingsCommand.run(localizedInteraction(input,store),{settings:store.get(guild),settingsStore:store});
 assert.equal(store.get(guild).locale,'en');assert.match(payload.embeds[0].description,/Bot language: English/);
 const denied={...input,memberPermissions:{has:()=>false}};
 await settingsCommand.run(localizedInteraction(denied,store),{settings:store.get(guild),settingsStore:store});
 assert.match(payload.embeds[0].description,/Manage Server permission/);assert.equal(store.history(guild).length,1);store.close();
});

test('English help uses independent labels while IDs remain language-neutral',async()=>{
 const commands=await loadCommands();const state=freshState();
 const tr=renderHelp('a'.repeat(24),state,commands,'tr',false);const en=renderHelp('a'.repeat(24),freshState(),commands,'en',false);
 assert.equal(en.embeds[0].toJSON().title,'Command guide');
 const rows=p=>p.components.map(r=>r.toJSON());
 assert.equal(rows(tr)[0].components[0].custom_id,rows(en)[0].components[0].custom_id);
 assert.equal(rows(en)[0].components[0].placeholder,'Category');
 for(const command of commands){const data=command.data.toJSON();assert.ok(data.name_localizations['en-US']);assert.ok(data.description_localizations['en-US']);}
});
