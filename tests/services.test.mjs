import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('separate bot and dashboard processes survive each other stopping and share persistent settings', { timeout: 20000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'labcafe-services-'));
  const children = [];
  t.after(async () => {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) {
        const closed = once(child, 'exit'); child.kill(); await closed;
      }
    }
    await rm(directory, { recursive: true, force: true });
  });
  const storeUrl = new URL('../src/config/settings.ts', import.meta.url).href;
  const serverUrl = new URL('../src/dashboard/server.ts', import.meta.url).href;
  const clientUrl = new URL('../src/bot/client.ts', import.meta.url).href;
  async function start(role) {
    const code = `
      import { GuildSettingsStore } from ${JSON.stringify(storeUrl)};
      import { createDashboardServer } from ${JSON.stringify(serverUrl)};
      import { createBot } from ${JSON.stringify(clientUrl)};
      const store = new GuildSettingsStore();
      const guild = '123456789012345678';
      if (${JSON.stringify(role)} === 'bot') {
        createBot('error', 'offline-test', [], {clientId:guild,logLevel:'error'}, store);
        store.update(guild, {ephemeralReplies:false});
        process.on('message', () => process.send({alive:true}));
        process.send({ready:true});
      } else {
        const server = createDashboardServer({
          config:{origin:'http://localhost',clientId:guild},store,discord:{},commands:[]
        });
        process.on('message', () => process.send(store.get(guild)));
        server.listen(0,'127.0.0.1', () => process.send({port:server.address().port}));
      }
    `;
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], {
      env: {...process.env, LABCAFE_SETTINGS_PATH:join(directory,'settings.sqlite')},
      stdio:['ignore','ignore','pipe','ipc']
    });
    children.push(child);
    let stderr = ''; child.stderr.on('data', data => { stderr += data; });
    const ready = await new Promise((resolve,reject) => {
      child.once('message',resolve);
      child.once('error',reject);
      child.once('exit',code => reject(new Error(`Child exited ${code}: ${stderr}`)));
    });
    return {child,ready};
  }
  const bot = await start('bot');
  const web = await start('dashboard');
  const url = `http://127.0.0.1:${web.ready.port}/api/session`;
  assert.equal((await fetch(url)).status,200);
  const stopped = once(bot.child,'exit'); bot.child.kill(); await stopped;
  assert.deepEqual(await (await fetch(url)).json(), {authenticated:false});
  const settings = once(web.child,'message'); web.child.send('settings');
  assert.equal((await settings)[0].ephemeralReplies,false);
  const restarted = await start('bot');
  const webStopped = once(web.child,'exit'); web.child.kill(); await webStopped;
  const alive = once(restarted.child,'message'); restarted.child.send('ping');
  assert.deepEqual((await alive)[0],{alive:true});
});
