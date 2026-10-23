import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Events, MessageFlags, PermissionFlagsBits, ChannelType } from 'discord.js';
import { GuildSettingsStore, defaultSettings } from '../src/config/settings.ts';
import { settingsCommand } from '../src/commands/settings.ts';
import { pingCommand } from '../src/commands/ping.ts';
import { createBot } from '../src/bot/client.ts';

const guild = '123456789012345678';
const otherGuild = '223456789012345678';
const channel = '323456789012345678';

test('settings survive reopening, remain isolated, and reset only the chosen guild', async () => {
  const directory = await mkdtemp(join(process.cwd(), 'work-settings-test-'));
  const path = join(directory, 'settings.sqlite');
  let store;
  try {
    store = new GuildSettingsStore(path);
    assert.deepEqual(store.get(guild), defaultSettings());
    store.update(guild, { ephemeralReplies: false });
    store.update(guild, { commandChannelId: channel });
    store.update(otherGuild, { ephemeralReplies: false });
    store.close();
    store = new GuildSettingsStore(path);
    assert.deepEqual(store.get(guild), { locale:'tr', ephemeralReplies: false, commandChannelId: channel });
    store.reset(guild);
    assert.deepEqual(store.get(guild), defaultSettings());
    assert.equal(store.get(otherGuild).ephemeralReplies, false);
    store.setBetaPolicy({enabled:true,guildIds:[otherGuild]},guild);
    store.close(); store=new GuildSettingsStore(path);
    assert.deepEqual(store.getBetaPolicy(),{enabled:true,guildIds:[otherGuild]});
    assert.equal(store.betaAllows(guild),false);
    assert.equal(store.betaAllows(otherGuild),true);
  } finally { store?.close(); await rm(directory, { recursive: true, force: true }); }
});

test('invalid IDs are rejected and a failed update rolls back without losing settings', () => {
  const store = new GuildSettingsStore(':memory:');
  try {
    store.update(guild, { ephemeralReplies: false });
    assert.throws(() => store.update(guild, { commandChannelId: '../bad' }));
    assert.throws(() => store.update('bad', { ephemeralReplies: true }));
    assert.deepEqual(store.get(guild), { locale:'tr', ephemeralReplies: false, commandChannelId: null });
    store.update(guild, { commandChannelId: channel });
    assert.equal(store.get(guild).commandChannelId, channel);
  } finally { store.close(); }
});

test('beta policy blocks command execution outside allowed guilds', async () => {
  const store=new GuildSettingsStore(':memory:');
  store.setBetaPolicy({enabled:true,guildIds:[otherGuild]},guild);
  let executed=false;
  const client=createBot('error','offline',[{data:{name:'ping'},async run(){executed=true;}}],
    {clientId:guild,logLevel:'error'},store);
  try {
    const reply=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Missing beta reply')),1000);
      client.emit(Events.InteractionCreate,{
        isChatInputCommand:()=>true,commandName:'ping',guildId:guild,
        async reply(payload){clearTimeout(timer);resolve(payload);}
      });
    });
    assert.equal(executed,false);
    assert.match(reply.embeds[0].toJSON().description,/kapalı beta/);
  } finally { await client.destroy(); store.close(); }
});

function interaction(subcommand, permitted = true) {
  let payload;
  return { user:{id:otherGuild},
    guildId: guild, channelId: channel, client: { user: { id: '423456789012345678' } },
    inGuild: () => true,
    memberPermissions: { has: permission => permitted && permission === PermissionFlagsBits.ManageGuild },
    options: { getSubcommand: () => subcommand, getString: () => 'acik', getChannel: () => null },
    async reply(value) { payload = value; },
    get payload() { return payload; }
  };
}

test('unauthorized members and DMs cannot read or change settings', async () => {
  const store = new GuildSettingsStore(':memory:');
  try {
    for (const directMessage of [false, true]) {
      const input = interaction('yanit', false);
      input.inGuild = () => !directMessage;
      await settingsCommand.run(input, { settings: defaultSettings(), settingsStore: store });
      assert.match(input.payload.embeds[0].toJSON().description, /yetkisi gerekli/);
      assert.equal(input.payload.flags, MessageFlags.Ephemeral);
      assert.deepEqual(store.get(guild), defaultSettings());
    }
  } finally { store.close(); }
});

test('administrator can view, update and reset settings with private confirmations', async () => {
  const store = new GuildSettingsStore(':memory:');
  try {
    const context = { settings: defaultSettings(), settingsStore: store };
    const update = interaction('yanit');
    await settingsCommand.run(update, context);
    assert.equal(store.get(guild).ephemeralReplies, false);
    assert.equal(update.payload.flags, MessageFlags.Ephemeral);
    const view = interaction('goster');
    await settingsCommand.run(view, context);
    assert.match(view.payload.embeds[0].toJSON().description, /Herkese açık/);
    await settingsCommand.run(interaction('sifirla'), context);
    assert.deepEqual(store.get(guild), defaultSettings());
  } finally { store.close(); }
});

test('channel selection validates bot permissions; empty selection removes restriction', async () => {
  const store = new GuildSettingsStore(':memory:');
  try {
    for (const permitted of [false, true]) {
      const input = interaction('kanal');
      input.options.getChannel = () => ({ id: channel });
      input.guild = { channels: { async fetch() { return {
        type: ChannelType.GuildText, permissionsFor: () => ({ has: () => permitted })
      }; } } };
      await settingsCommand.run(input, { settings: defaultSettings(), settingsStore: store });
      assert.equal(store.get(guild).commandChannelId, permitted ? channel : null);
    }
    await settingsCommand.run(interaction('kanal'), { settings: defaultSettings(), settingsStore: store });
    assert.equal(store.get(guild).commandChannelId, null);
  } finally { store.close(); }
});

test('ping actually follows the per-guild reply visibility', async () => {
  for (const ephemeralReplies of [false, true]) {
    const input = interaction('');
    input.client.ws = { ping: 40 };
    await pingCommand.run(input, { settings: { ephemeralReplies, commandChannelId: null } });
    assert.deepEqual(input.payload.flags, ephemeralReplies ? MessageFlags.Ephemeral : []);
  }
});

test('command channel restriction blocks execution but keeps settings accessible', async () => {
  const store = new GuildSettingsStore(':memory:');
  let executions = 0;
  const commands = ['ping', 'ayarlar'].map(name => ({
    data: { name }, async run(input) { executions++; await input.reply({ content: 'ok' }); }
  }));
  const client = createBot('error', 'test-token', commands,
    { token: 'test-token', clientId: guild, guildId: guild, logLevel: 'error' }, store);
  try {
    store.update(guild, { commandChannelId: channel });
    for (const name of ['ping', 'ayarlar']) {
      const input = interaction('');
      input.channelId = '523456789012345678';
      input.commandName = name;
      input.isChatInputCommand = () => true;
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('No reply')), 1000);
        input.reply = async payload => { input.result = payload; clearTimeout(timeout); resolve(); };
        client.emit(Events.InteractionCreate, input);
      });
      if (name === 'ping') assert.match(input.result.embeds[0].toJSON().description, new RegExp(channel));
    }
    assert.equal(executions, 1);
  } finally { await client.destroy(); store.close(); }
});
