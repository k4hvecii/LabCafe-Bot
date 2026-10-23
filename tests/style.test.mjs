import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hexToDecimal, styleBody, resetBody, guildStyleRoute,
  uniqueGuildIds, parseStyleArgs, executeStyle
} from '../src/style/name-style.ts';
const a = '123456789012345678';
const b = '987654321098765432';

test('converts HEX accurately', () => {
  assert.equal(hexToDecimal('#FFFFFF'), 0xffffff);
  assert.equal(hexToDecimal('#000000'), 0);
  assert.equal(hexToDecimal('#C58A61'), 0xc58a61);
});
test('rejects non-hex color values', () => assert.throws(() => hexToDecimal('red'), /Geçersiz/));
test('labcafe is a two-color gradient', () => {
  const style = styleBody('labcafe');
  assert.equal(style.display_name_effect_id, 2);
  assert.equal(style.display_name_colors.length, 2);
});
test('terminal and classic are single-color', () => {
  for (const preset of ['terminal', 'classic']) assert.equal(styleBody(preset).display_name_colors.length, 1);
});
test('reset payload removes all experimental fields', () => {
  assert.deepEqual(resetBody(), { display_name_font_id: null, display_name_effect_id: null, display_name_colors: null });
});
test('validates route IDs against injection', () => {
  assert.equal(guildStyleRoute(a), `/guilds/${a}/members/@me`);
  assert.throws(() => guildStyleRoute(`${a}/wrong`), /Geçersiz/);
});
test('de-duplicates guilds and rejects invalid ones', () => {
  assert.deepEqual(uniqueGuildIds(`${a}, ${a},${b}`), [a,b]);
  assert.throws(() => uniqueGuildIds(''), /En az/);
  assert.throws(() => uniqueGuildIds(`${a},abcd`), /geçersiz/);
});
test('preview parses without consent flag', () => {
  assert.deepEqual(parseStyleArgs(['preview','--guild='+a,'--preset=classic']), {
    mode: 'preview', guildIds: [a], preset: 'classic', confirmed: false
  });
});
test('falls back to explicit env guild IDs', () => {
  assert.deepEqual(parseStyleArgs(['apply','--confirm-unsupported-api'], `${a},${b}`).guildIds, [a,b]);
});
test('unknown args and presets are rejected', () => {
  assert.throws(() => parseStyleArgs(['apply', '--guild='+a, '--secret']), /Bilinmeyen/);
  assert.throws(() => parseStyleArgs(['apply', '--guild='+a, '--preset=random']), /Preset/);
});
test('refuses unintended mutating REST calls', async () => {
  let calls = 0;
  const patch = async () => { calls++; };
  await assert.rejects(executeStyle(parseStyleArgs(['apply', '--guild='+a]), patch), /confirm/);
  assert.equal(calls, 0);
  await assert.rejects(executeStyle(parseStyleArgs(['preview', '--guild='+a]), patch), /Preview/);
  assert.equal(calls, 0);
});
test('manual apply patches only named guilds, sequentially', async () => {
  const calls = [];
  const sleeps = [];
  const args = parseStyleArgs(['apply', `--guild=${a},${b}`, '--confirm-unsupported-api']);
  const result = await executeStyle(args, async (route, body) => calls.push({route, body}), async ms => {sleeps.push(ms);});
  assert.equal(result.successful.length, 2);
  assert.deepEqual(calls.map(c => c.route), [`/guilds/${a}/members/@me`, `/guilds/${b}/members/@me`]);
  assert.deepEqual(sleeps, [1000]);
});
test('one bad guild does not cancel processing others', async () => {
  const args = parseStyleArgs(['reset', `--guild=${a},${b}`, '--confirm-unsupported-api']);
  const result = await executeStyle(args, async (route, body) => {
    assert.deepEqual(body, resetBody());
    if (route.includes(a)) throw new Error('403 Forbidden');
  }, async () => {});
  assert.deepEqual(result, { successful: [b], failed: [a] });
});
