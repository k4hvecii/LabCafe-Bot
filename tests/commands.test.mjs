import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { ApplicationCommand, Client, SlashCommandBuilder } from 'discord.js';
import { loadCommands } from '../src/commands/index.ts';
import { syncCommands } from '../src/bot/sync-commands.ts';
import { settingsCommand } from '../src/commands/settings.ts';

const command = { data: new SlashCommandBuilder().setName('ping').setDescription('Test'), async run() {} };
const client = new Client({ intents: [] });
function remote(description = 'Test') {
  return new ApplicationCommand(client, {
    id: '123456789012345678', application_id: '123456789012345679', version: '1',
    type: 1, name: 'ping', description, options: [], nsfw: false,
    integration_types: [0], contexts: [0, 1, 2]
  });
}

test('discovers existing named command automatically', async () => {
  assert.deepEqual((await loadCommands()).map(c => c.data.name), ['yardım', 'bilgi', 'ping', 'ayarlar', 'kurulum']);
});
test('unchanged remote command and Discord defaults cause no write', async () => {
  assert.equal(await syncCommands([command], {
    async fetch() { return new Map([['1', remote()]]); },
    async set() { assert.fail('unexpected registration'); }
  }), false);
});
test('guild settings command does not re-register when Discord omits global DM permission', async () => {
  const { dm_permission, ...data } = settingsCommand.data.toJSON();
  const existing = new ApplicationCommand(client, { ...data,
    options: data.options.map(option => {
      if (option.options?.length === 0) { const { options, ...rest } = option; return rest; }
      return option;
    }),
    id: '123456789012345678', application_id: '123456789012345679',
    guild_id: '123456789012345680', version: '1', type: 1, nsfw: false
  }, null, '123456789012345680');
  assert.equal(await syncCommands([settingsCommand], {
    async fetch() { return new Map([['1', existing]]); },
    async set() { assert.fail('unexpected registration'); }
  }), false);
});

test('new, changed and removed commands update the registry', async () => {
  for (const existing of [[], [remote('Old description')], [remote(), remote()]]) {
    let writes = 0;
    assert.equal(await syncCommands([command], {
      async fetch() { return new Map(existing.map((c, i) => [String(i), c])); },
      async set(body) { writes++; assert.deepEqual(body, [command.data.toJSON()]); }
    }), true);
    assert.equal(writes, 1);
  }
});
test('fetch failures and empty lists never overwrite the registry', async () => {
  const registry = { async fetch() { throw new Error('offline'); }, async set() { assert.fail(); } };
  await assert.rejects(syncCommands([command], registry), /offline/);
  await assert.rejects(syncCommands([], registry), /Boş/);
});
test('invalid, duplicate and empty command directories fail before registration', async () => {
  const directory = await mkdtemp(join(process.cwd(), 'work-command-test-'));
  const url = pathToFileURL(directory + '/');
  const source = `import { SlashCommandBuilder } from 'discord.js';
export default { data: new SlashCommandBuilder().setName('duplicate').setDescription('Test'), async run() {} };`;
  try {
    await assert.rejects(loadCommands(url), /Komut bulunamadı/);
    await writeFile(join(directory, 'a.ts'), source);
    await writeFile(join(directory, 'ignored.d.ts'), 'invalid declaration fixture');
    assert.equal((await loadCommands(url)).length, 1);
    await writeFile(join(directory, 'b.ts'), source);
    await assert.rejects(loadCommands(url), /Tekrarlanan/);
    await rm(join(directory, 'b.ts'));
    await writeFile(join(directory, 'bad.ts'), 'export const invalid = {};');
    await assert.rejects(loadCommands(url), /tam olarak bir komut/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
