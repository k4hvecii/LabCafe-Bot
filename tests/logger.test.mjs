import test from 'node:test';
import assert from 'node:assert/strict';
import { redact, safeErrorName } from '../src/core/logger.ts';
test('redacts token everywhere in a message', () => {
  assert.equal(redact('secret-token 2x secret-token', ['secret-token']), '[REDACTED] 2x [REDACTED]');
});
test('ignores blank secrets', () => assert.equal(redact('abc', ['', '']), 'abc'));
test('identifies unexpected error safely', () => {
  assert.equal(safeErrorName(new TypeError('sensitive detail')), 'TypeError');
  assert.equal(safeErrorName('string'), 'UnknownError');
});

import { createLogger, LEVELS } from '../src/core/logger.ts';
import { readConfig } from '../src/config/env.ts';

function capture(level = 'trace', options = {}) {
  const lines = [];
  return { lines, logger: createLogger(level, ['test-secret-123'], {format:'json', ...options, sink: line => lines.push(line)}) };
}

test('supports all seven levels and preserves info/success threshold semantics', () => {
  const {logger,lines} = capture('info');
  for (const level of LEVELS) logger[level]('Bot bağlandı', {count:2});
  assert.deepEqual(lines.map(line => JSON.parse(line).level), ['info','success','warn','error','fatal']);
  assert.ok(lines.every(line => JSON.parse(line).message === 'Bot bağlandı'));
  for (const level of LEVELS) assert.equal(readConfig({DISCORD_TOKEN:'test',DISCORD_CLIENT_ID:'123456789012345678',LOG_LEVEL:level}).logLevel,level);
});

test('redacts secrets, auth, callback queries and webhook credentials before output', () => {
  const {logger,lines} = capture();
  logger.error('https://labcafe.xyz/auth/callback?code=private-code&state=private-state Bearer private-bearer test-secret-123', {
    authorization:'private-auth', accessToken:'private-access', client_secret:'private-client-secret', cookie:'private-cookie',
    endpoint:'https://discord.com/api/v10/webhooks/123/private-webhook?wait=true',
    detail:'code=private-code state=private-state',
    literal:'test-secret-123'
  });
  const result = JSON.parse(lines[0]);
  for (const secret of ['private-code','private-state','private-bearer','test-secret-123','private-auth','private-access','private-client-secret','private-cookie','private-webhook','wait=true']) {
    assert.ok(!lines[0].includes(secret), secret);
  }
  assert.equal(result.context.authorization,'[REDACTED]');
  assert.ok(result.message.includes('/auth/callback'));
});

test('production forces valid JSON and strips injected terminal formatting', () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const {logger,lines} = capture('info',{format:'pretty',module:'Gateway\x1b[31m'});
    logger.info('ready\nFORGED\x1b[31m', {detail:'\r\nforged'});
    const result = JSON.parse(lines[0]);
    assert.equal(result.module,'Gateway');
    assert.ok(!/[\u0000-\u001f\u007f-\u009f]/.test(lines[0]));
    assert.equal(result.message,'ready FORGED');
  } finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
});

test('pretty output respects NO_COLOR and includes module without altering JSON context', () => {
  const previous = process.env.NO_COLOR;
  const oldEnv = process.env.NODE_ENV;
  process.env.NO_COLOR = '1'; process.env.NODE_ENV = 'development';
  try {
    const {logger,lines} = capture('info',{format:'pretty',module:'Database'});
    logger.success('SQLite ready',{durationMs:3});
    assert.match(lines[0], /SUCCESS.*Database.*SQLite ready/);
    assert.ok(!lines[0].includes('\x1b'));
  } finally {
    if (previous === undefined) delete process.env.NO_COLOR; else process.env.NO_COLOR = previous;
    if (oldEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnv;
  }
});

test('bounds output and does not leave a truncated secret prefix', () => {
  const lines=[];
  const secret='sensitive'.repeat(1000);
  const logger=createLogger('info',[secret],{format:'json',sink:line=>lines.push(line)});
  logger.info(secret+'x'.repeat(6000), Object.fromEntries(Array.from({length:100},(_,i)=>['key'+i,'y'.repeat(4000)])));
  const record=JSON.parse(lines[0]);
  assert.ok(!lines[0].includes('sensitive'));
  assert.ok(record.message.length <= 4096);
  assert.equal(Object.keys(record.context).length,32);
  assert.ok(Object.values(record.context).every(value=>value.length<=2048));
});

test('sink failure cannot escape into bot code and emits no unsafe fallback', () => {
  const logger=createLogger('trace',[],{sink(){throw new Error('sink unavailable');}});
  assert.doesNotThrow(()=>logger.fatal('private payload',{token:'private'}));
});
