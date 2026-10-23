import test from 'node:test';
import assert from 'node:assert/strict';
import { readConfig, isSnowflake } from '../src/config/env.ts';
const sample = { DISCORD_TOKEN: 'fake.valid.test.token', DISCORD_CLIENT_ID: '123456789012345678' };

test('accepts valid Discord snowflakes', () => assert.equal(isSnowflake(sample.DISCORD_CLIENT_ID), true));
test('rejects unsafe snowflake strings', () => {
  for (const value of ['', '123', '1'.repeat(21), '12345678901234567X', '../123456789012345678']) {
    assert.equal(isSnowflake(value), false);
  }
});
test('accepts minimal configuration', () => {
  assert.deepEqual(readConfig(sample), { token: sample.DISCORD_TOKEN, clientId: sample.DISCORD_CLIENT_ID, guildId: undefined, logLevel: 'info' });
});
test('recognizes optional test guild and log level', () => {
  assert.equal(readConfig({ ...sample, DISCORD_GUILD_ID: '987654321098765432', LOG_LEVEL: 'debug' }).guildId, '987654321098765432');
});
test('rejects missing token without exposing it', () => {
  assert.throws(() => readConfig({ DISCORD_CLIENT_ID: sample.DISCORD_CLIENT_ID }), /DISCORD_TOKEN/);
});
test('rejects sample placeholder token', () => {
  assert.throws(() => readConfig({ ...sample, DISCORD_TOKEN: 'BOT_TOKEN_BURAYA' }), /DISCORD_TOKEN/);
});
test('rejects invalid log level and IDs', () => {
  assert.throws(() => readConfig({ ...sample, LOG_LEVEL: 'verbose' }), /LOG_LEVEL/);
  assert.throws(() => readConfig({ ...sample, DISCORD_GUILD_ID: 'wrong' }), /DISCORD_GUILD_ID/);
});
