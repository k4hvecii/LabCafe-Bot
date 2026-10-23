import test from 'node:test';
import assert from 'node:assert/strict';
import { createBotEmbed, readEmbedEmojis } from '../src/ui/embeds.ts';
import { pingCommand } from '../src/commands/ping.ts';
import { MessageFlags } from 'discord.js';

test('embed has a compact neutral layout without default emojis', () => {
  const embed = createBotEmbed({ kind: 'success', description: 'Gecikme: `0 ms`', emojis: {} }).toJSON();
  assert.equal(embed.description, 'Gecikme: `0 ms`');
  for (const key of ['color', 'image', 'thumbnail', 'title', 'fields', 'footer', 'timestamp']) assert.equal(embed[key], undefined);
});
test('custom and animated emoji mentions are accepted and used in the matching heading', () => {
  const emojis = readEmbedEmojis({ EMBED_EMOJI_SUCCESS: '<:success:123456789012345678>',
    EMBED_EMOJI_ERROR: '<a:error:123456789012345679>' });
  const embed = createBotEmbed({ kind: 'error', title: 'Hata', description: 'Tekrar deneyin.', emojis }).toJSON();
  assert.ok(embed.description.startsWith('<a:error:123456789012345679> **Hata**'));
  assert.ok(!embed.description.includes('<:success:'));
  assert.deepEqual(readEmbedEmojis({ EMBED_EMOJI_INFO: '  ' }), {});
});
test('Unicode emojis and malformed custom emojis are rejected without echoing input', () => {
  for (const value of ['✅', ':success:', '<:ok:123>', '<:ok:123456789012345678> extra', 'sensitive-input']) {
    assert.throws(() => readEmbedEmojis({ EMBED_EMOJI_SUCCESS: value }), error =>
      error.message.includes('EMBED_EMOJI_SUCCESS') && !error.message.includes(value));
  }
});
test('ping responds with an ephemeral embed and no mentions', async () => {
  let reply;
  await pingCommand.run({ client: { ws: { ping: 37.4 } }, async reply(payload) { reply = payload; } });
  assert.equal(reply.flags, MessageFlags.Ephemeral);
  assert.deepEqual(reply.allowedMentions, { parse: [] });
  assert.equal(reply.content, undefined);
  assert.match(reply.embeds[0].toJSON().description, /`37 ms`/);
});
