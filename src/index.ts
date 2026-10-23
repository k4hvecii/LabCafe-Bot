import {ConversionStore} from './analytics/conversions.js';
import 'dotenv/config';
import { readConfig } from './config/env.js';
import { createLogger, safeErrorName } from './core/logger.js';
import { createBot, isBotReady } from './bot/client.js';
import { loadCommands } from './commands/index.js';
import { readEmbedEmojis } from './ui/embeds.js';
import { GuildSettingsStore } from './config/settings.js';
import { createHealthServer } from './core/health.js';
import { performance } from 'node:perf_hooks';
import { DiscordRestMetrics } from './observability/discord-metrics.js';
import { StartupTracker } from './observability/startup.js';
import { ControlStore } from './observability/store.js';
import { BotRuntime } from './observability/bot-runtime.js';
import { connectLogEvents } from './observability/log-events.js';

async function main(): Promise<void> {
  const started=performance.now();
  const config = readConfig(process.env);
  readEmbedEmojis(process.env);
  const healthPort = Number(process.env.BOT_HEALTH_PORT || 3001);
  if (!Number.isInteger(healthPort) || healthPort < 1 || healthPort > 65535) throw new Error('Geçersiz BOT_HEALTH_PORT.');
  const logger = createLogger(config.logLevel, [config.token],{module:'LabCafe'});
  const startup=new StartupTracker(logger);
  let control:ControlStore|undefined;
  try{if(process.env.LABCAFE_BOT_CONTROL_PATH){control=new ControlStore(process.env.LABCAFE_BOT_CONTROL_PATH);control.start();}}catch{logger.warn('Bot gözlem deposu kullanılamıyor.');}
  if(control)connectLogEvents('bot',control);
  const rest=new DiscordRestMetrics('bot',Date.now,code=>control?.record({at:Date.now(),service:'bot',level:'warning',code}));
  try{rest.restoreState(control?.loadMetrics('bot','discord_rest'));}catch{logger.warn('Eski metrik örneği okunamadı.');}
  const observabilityToken=process.env.LABCAFE_OBSERVABILITY_TOKEN;
  if(observabilityToken&&!/^[A-Za-z0-9_-]{32,128}$/.test(observabilityToken))throw new Error('Geçersiz observability erişim anahtarı.');
  startup.start('ready',started);startup.start('configuration',started);startup.complete('configuration');
  startup.start('commands');
  const commands = await loadCommands().catch(error=>{startup.fail('commands',error);throw error;});
  startup.complete('commands',commands.length);
  startup.start('database');
  let settingsStore:GuildSettingsStore;
  try{settingsStore=new GuildSettingsStore();startup.complete('database');}
  catch(error){startup.fail('database',error);throw error;}
  process.once('exit', () => settingsStore.close());
  let conversions:ConversionStore|undefined;
  try{if(process.env.LABCAFE_ANALYTICS_EVENTS_PATH)conversions=new ConversionStore(process.env.LABCAFE_ANALYTICS_EVENTS_PATH);}catch{logger.warn('İşlem sayacı kullanılamıyor; bot devam ediyor.');}
  process.once('exit',()=>conversions?.close());
  const runtime=new BotRuntime(commands.map(command=>command.data.name),control);
  const client = createBot(config.logLevel, config.token, commands, config, settingsStore, () => { void stop('command sync failed', 1); },()=>conversions?.record('bot_joined'),{rest,startup,runtime});
  const telemetryTimer=setInterval(()=>{
    runtime.heartbeat();try{control?.snapshot('bot','runtime',runtime.snapshot());control?.snapshot('bot','rest',rest.snapshot('1h'));if(control){control.saveMetrics('bot','discord_rest',rest.exportState());rest.markPersisted();}}catch{}
  },15000);telemetryTimer.unref();
  const retentionTimer=setInterval(()=>{try{control?.retention();}catch{}},3600000);retentionTimer.unref();
  process.once('exit',()=>{clearInterval(telemetryTimer);clearInterval(retentionTimer);control?.close();});
  let stopping = false;
  const health = createHealthServer(() => !stopping && isBotReady(client) && settingsStore.healthy(),observabilityToken?{
    token:observabilityToken,snapshot:range=>({schemaVersion:1,service:'bot',sampledAt:Date.now(),
      ready:!stopping&&isBotReady(client)&&settingsStore.healthy(),gatewayConnected:client.isReady(),
      guildCount:client.guilds.cache.size,startup:startup.snapshot(),discordRest:rest.snapshot(range),events:control?.events()??[],runtime:{...runtime.snapshot(),gatewayPingMs:Number.isFinite(client.ws.ping)&&client.ws.ping>=0?client.ws.ping:null,shards:[...client.ws.shards].map(([id,shard])=>({id,state:shard.status,pingMs:shard.ping>=0?shard.ping:null}))}})
  }:undefined);
  const stop = async (reason: string, exitCode = 0): Promise<void> => {
    if (stopping) return;
    stopping = true;
    clearInterval(telemetryTimer);clearInterval(retentionTimer);
    startup.start('stopping');
    logger.info('Bot kapatılıyor', { reason });
    const failSafe = setTimeout(() => process.exit(exitCode || 1), 8_000);
    failSafe.unref();
    try {
      health.close(); health.closeAllConnections();
      await client.destroy();
      try{control?.saveMetrics('bot','discord_rest',rest.exportState());control?.snapshot('bot','runtime',runtime.snapshot());}catch{}
    } catch (error) {
      startup.fail('stopping',error);
      logger.error('Bot kapatılamadı', { error: safeErrorName(error) });
      exitCode = 1;
    } finally { startup.complete('stopping');clearTimeout(failSafe); process.exitCode = exitCode; }
  };
  health.once('error', error => {
    startup.fail('health',error);
    startup.fail('ready',error);
    logger.error('Sağlık kontrolü başlatılamadı', { error: safeErrorName(error) });
    void stop('health failed', 1);
  });
  startup.start('health');
  health.listen(healthPort, '127.0.0.1',()=>startup.complete('health'));

  process.once('SIGINT', () => { void stop('SIGINT'); });
  process.once('SIGTERM', () => { void stop('SIGTERM'); });
  process.once('uncaughtException', error => {
    logger.error('Beklenmeyen istisna', { error: safeErrorName(error) });
    void stop('uncaughtException', 1);
  });
  process.once('unhandledRejection', error => {
    logger.error('Yakalanmamış Promise hatası', { error: safeErrorName(error) });
    void stop('unhandledRejection', 1);
  });

  startup.start('gateway');
  try { await client.login(config.token); }
  catch (error) {
    startup.fail('gateway',error);startup.fail('ready',error);
    logger.error('Oturum açılamadı', { error: safeErrorName(error) });
    await stop('login failed', 1);
  }
}

main().catch(error => {
  createLogger('error',[],{module:'Bootstrap'}).fatal('Bot başlatılamadı.',{error:safeErrorName(error)});
  process.exitCode = 1;
});
