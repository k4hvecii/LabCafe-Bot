import {AnalyticsService,readAnalyticsConfig} from '../analytics/service.js';
import {ConversionStore} from '../analytics/conversions.js';
import {NativeAnalytics} from '../analytics/native.js';
import 'dotenv/config';
import { readConfig } from '../config/env.js';
import { GuildSettingsStore } from '../config/settings.js';
import { readDashboardConfig } from '../dashboard/config.js';
import { createDiscordService } from '../dashboard/discord.js';
import { createDashboardServer } from '../dashboard/server.js';
import { loadCommands } from '../commands/index.js';
import { createLogger, safeErrorName } from '../core/logger.js';
import { performance } from 'node:perf_hooks';
import { StartupTracker } from '../observability/startup.js';
import { DiscordRestMetrics } from '../observability/discord-metrics.js';
import { ControlStore } from '../observability/store.js';
import { ControlCenter } from '../observability/center.js';
import { LocalObservationClient } from '../observability/local-client.js';
import { connectLogEvents } from '../observability/log-events.js';

async function main(): Promise<void> {
  const started=performance.now();
  const bot = readConfig(process.env);
  const config = readDashboardConfig(process.env);
  const logger=createLogger(bot.logLevel,[bot.token,config.clientSecret??''],{module:'Dashboard'});
  const startup=new StartupTracker(logger);
  let control:ControlStore|undefined;
  try{if(process.env.LABCAFE_WEB_CONTROL_PATH)control=new ControlStore(process.env.LABCAFE_WEB_CONTROL_PATH);}catch{logger.warn('Yönetim deposu kullanılamıyor.');}
  if(control)connectLogEvents('dashboard',control);
  const rest=new DiscordRestMetrics('dashboard',Date.now,code=>control?.record({at:Date.now(),service:'dashboard',level:'warning',code}));
  const observerKey=process.env.LABCAFE_OBSERVABILITY_TOKEN;
  const botObservation=observerKey?new LocalObservationClient(Number(process.env.BOT_HEALTH_PORT??3001),observerKey,'bot'):undefined;
  const observer=observerKey?new LocalObservationClient(Number(process.env.LABCAFE_OBSERVER_PORT??3002),observerKey,'observer'):undefined;
  const http=new DiscordRestMetrics('dashboard');
  const center=control?new ControlCenter(control,rest,startup,botObservation,observer,http,()=>({settingsReady:store.healthy()})):undefined;
  center?.start();
  const retention=setInterval(()=>{try{control?.retention();}catch{}},3600000);retention.unref();
  startup.start('ready',started);startup.start('configuration',started);startup.complete('configuration');
  startup.start('commands');
  const commands = (await loadCommands().catch(error=>{startup.fail('commands',error);throw error;})).map(command => {
    const data = command.data.toJSON(); return { name: data.name, description: data.description };
  });
  startup.complete('commands',commands.length);
  startup.start('database');
  let store:GuildSettingsStore;
  try{store=new GuildSettingsStore();startup.complete('database');}catch(error){startup.fail('database',error);throw error;}
  let conversions:ConversionStore|undefined;let analytics=new AnalyticsService(undefined);
  try{if(process.env.LABCAFE_ANALYTICS_EVENTS_PATH)conversions=new ConversionStore(process.env.LABCAFE_ANALYTICS_EVENTS_PATH);}catch{logger.warn('İşlem sayacı kullanılamıyor; dashboard devam ediyor.');}
  try{analytics=new AnalyticsService(readAnalyticsConfig(process.env));}catch{logger.warn('Analitik yapılandırması geçersiz; dashboard devam ediyor.');}
  let nativeAnalytics:NativeAnalytics|undefined;
  try{if(analytics.config&&process.env.ANALYTICS_NATIVE_URL)nativeAnalytics=new NativeAnalytics(analytics.config,process.env.ANALYTICS_NATIVE_URL,fetch,process.env.ANALYTICS_NATIVE_BOARD_ID);}catch{logger.warn('Detaylı analiz kullanılamıyor; dashboard devam ediyor.');}
  const server = createDashboardServer({ observability:{rest,startup,...(center?{center}:{})},analytics,...(nativeAnalytics?{nativeAnalytics}:{}),...(conversions?{conversions}:{}),config, store, commands, discord: createDiscordService(config, bot.token,undefined,rest), preloadPublicGuilds: true });
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    clearInterval(retention);server.stopStreams();
    const forceClose=setTimeout(()=>server.closeAllConnections(),8000);forceClose.unref();
    server.close(() => {clearTimeout(forceClose);try{center?.close();}catch{logger.warn('Gözlem kuyruğu kapatılamadı.');}conversions?.close();store.close();});
    server.closeIdleConnections();
  };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  server.once('error', error => {
    startup.fail('health',error);startup.fail('ready',error);
    logger.error('Dashboard başlatılamadı.',{error:safeErrorName(error)});
    conversions?.close();store.close(); process.exitCode = 1;
  });
  startup.start('health');
  server.listen(config.port, config.host, () => {
    startup.complete('health');startup.complete('ready');
    logger.success('Dashboard hazır');
    if (!config.clientSecret) logger.warn('Discord girişi yapılandırılmadı.');
  });
}
main().catch(error => { createLogger('error',[],{module:'Bootstrap'}).fatal('Dashboard başlatılamadı.',{error:safeErrorName(error)}); process.exitCode = 1; });

