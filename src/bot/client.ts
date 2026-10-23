import { localizedInteraction } from '../i18n/interaction.js';
import { accessAllows } from '../help/access-store.js';
import { Client, Events, GatewayIntentBits, MessageFlags, PermissionFlagsBits } from 'discord.js';
import type { InteractionReplyOptions } from 'discord.js';
import type { BotCommand } from '../commands/index.js';
import type { BotConfig } from '../config/env.js';
import { syncCommands } from './sync-commands.js';
import type { Level } from '../core/logger.js';
import { createLogger, safeErrorName } from '../core/logger.js';
import { createBotEmbed } from '../ui/embeds.js';
import { defaultSettings } from '../config/settings.js';
import type { GuildSettingsStore } from '../config/settings.js';
import { handleHelp } from '../help/handler.js';
import { createGuildCommandSync } from './guild-commands.js';
import { DiscordRestMetrics } from '../observability/discord-metrics.js';
import { measuredRestTransport, observeRateLimits } from '../observability/discord-rest.js';
import type { StartupTracker } from '../observability/startup.js';
import type { BotRuntime } from '../observability/bot-runtime.js';
import {randomUUID} from 'node:crypto';
import {withTrace} from '../observability/tracing.js';

const syncedClients = new WeakSet<Client>();
export function isBotReady(client: Client): boolean { return client.isReady() && syncedClients.has(client); }

export function createBot(level: Level, token: string, commands: BotCommand[], config: BotConfig, settingsStore: GuildSettingsStore, onFatal?: () => void, onGuildJoined?:()=>void, telemetry?:{rest:DiscordRestMetrics;startup:StartupTracker;runtime?:BotRuntime}): Client {
  const logger = createLogger(level, [token], {module:'Discord'});
  const metrics=telemetry?.rest??new DiscordRestMetrics('bot');
  const commandMap = new Map(commands.map(command => [command.data.name, command]));
  const syncGuild = createGuildCommandSync(commands,id => settingsStore.betaAllows(id));
  let applicationVerified = false;
  const client = new Client({
    intents: [GatewayIntentBits.Guilds], // No MessageContent / GuildMembers privileged intent
    allowedMentions: { parse: [] },
    failIfNotExists: false,
    rest:{makeRequest:measuredRestTransport(metrics)}
  });
  const disposeMetrics=observeRateLimits(client.rest,metrics);
  const originalDestroy=client.destroy.bind(client);
  client.destroy=async()=>{disposeMetrics();await originalDestroy();};

  client.once(Events.ClientReady, ready => {
    telemetry?.runtime?.initializeGuilds(ready.guilds.cache.keys());
    telemetry?.runtime?.gateway('connected');
    telemetry?.runtime?.heartbeat();
    telemetry?.startup.complete('gateway');
    telemetry?.startup.start('command_sync');
    logger.info('Bot bağlandı', { guildCount: ready.guilds.cache.size, userId: ready.user.id });
    void (async () => {
      if (ready.application.id !== config.clientId) throw new Error('DISCORD_CLIENT_ID token ile uyuşmuyor.');
      applicationVerified = true;
      // Cache own application emojis in the background; original Unicode fallbacks remain usable.
      void ready.application.emojis?.fetch().catch(() => logger.warn('Uygulama emojileri alınamadı'));
      if (config.registerJoinedGuilds) {
        for (const guild of ready.guilds.cache.values()) {
          const changed = await syncGuild(guild);
          logger.info(changed === null ? 'Beta dışında: komut kaydı atlandı' : changed ? 'Slash komutları güncellendi' : 'Slash komutları zaten güncel', {
            count:commands.length,scope:guild.id
          });
        }
        syncedClients.add(client);
        telemetry?.startup.complete('command_sync',commands.length);
        telemetry?.startup.complete('ready');
        return;
      }
      const manager = config.guildId
        ? (await ready.guilds.fetch(config.guildId)).commands
        : ready.application.commands;
      const changed = await syncCommands(commands, manager);
      syncedClients.add(client);
      telemetry?.startup.complete('command_sync',commands.length);
      telemetry?.startup.complete('ready');
      logger.info(changed ? 'Slash komutları güncellendi' : 'Slash komutları zaten güncel', {
        count: commands.length, scope: config.guildId ?? 'global'
      });
    })().catch(error => {
      telemetry?.startup.fail('command_sync',error);
      telemetry?.startup.fail('ready',error);
      logger.error('Otomatik komut kaydı başarısız', { error: safeErrorName(error) });
      syncedClients.delete(client);
      if (onFatal) onFatal();
      else { void client.destroy(); process.exitCode = 1; }
    });
  });
  client.on(Events.GuildCreate, guild => {
    logger.info('Sunucuya katıldı', {guildId:guild.id});
    try{if(telemetry?.runtime?.guildJoined(guild.id))onGuildJoined?.();}catch{logger.warn('Sunucu katılım sayacı güncellenemedi');}
    if (!config.registerJoinedGuilds || !applicationVerified) return;
    const register = async (attempt = 0): Promise<void> => {
      try { await syncGuild(guild); logger.info('Yeni sunucu komut kaydı kontrol edildi',{guildId:guild.id}); }
      catch (error) {
        logger.error('Yeni sunucu komut kaydı başarısız',{guildId:guild.id,error:safeErrorName(error),attempt});
        if (attempt < 2) setTimeout(() => { if (client.guilds.cache.has(guild.id)) void register(attempt+1); },30_000).unref();
      }
    };
    void register();
  });
  // A removal does not imply consent to delete persisted settings.
  client.on(Events.GuildDelete, guild => {telemetry?.runtime?.guildLeft(guild.id);logger.info('Sunucudan ayrıldı', { guildId: guild.id });});
  client.on(Events.ShardDisconnect,()=>telemetry?.runtime?.gateway('disconnected'));
  client.on(Events.ShardReconnecting,()=>telemetry?.runtime?.gateway('reconnecting'));
  client.on(Events.ShardResume,()=>telemetry?.runtime?.gateway('connected'));
  client.on(Events.ShardReady,()=>telemetry?.runtime?.gateway('connected'));
  client.on(Events.Error, error => logger.error('Discord istemci hatası', { error: safeErrorName(error) }));
  client.on(Events.Warn, warning => logger.warn('Discord uyarısı', { detail: warning.slice(0, 180) }));

  client.on(Events.InteractionCreate, async rawInteraction => {
    const interaction=localizedInteraction(rawInteraction,settingsStore);
    try {
      if ((interaction.isAutocomplete?.() || interaction.isButton?.() || interaction.isStringSelectMenu?.() || interaction.isModalSubmit?.())
        && await handleHelp(interaction, commands, settingsStore)) return;
    } catch (error) {
      logger.error('Yardım etkileşimi tamamlanamadı', { error:safeErrorName(error) });
      try {
        if (interaction.isAutocomplete()) await interaction.respond([]);
        else if (interaction.isRepliable()) {
          const response = {content:'Yardım menüsü açılamadı. `/yardım` ile tekrar dene.',flags:MessageFlags.Ephemeral} satisfies InteractionReplyOptions;
          if (interaction.replied || interaction.deferred) await interaction.followUp(response);
          else await interaction.reply(response);
        }
      } catch { /* The interaction may already have expired. */ }
      return;
    }
    if (!interaction.isChatInputCommand()) return;
    const command = commandMap.get(interaction.commandName);
    if (!command) return;
    const traceId=randomUUID();
    const finish=telemetry?.runtime?.commandStart(interaction.commandName,interaction.guildId,traceId);
    let outcome:'succeeded'|'failed'|'rejected'='rejected';
    try {
      if (interaction.guildId && !settingsStore.betaAllows(interaction.guildId)) {
        await interaction.reply({embeds:[createBotEmbed({kind:'info',description:'Bu sunucu kapalı beta listesinde değil.'})],
          flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});
        return;
      }
      const settings = interaction.guildId ? settingsStore.get(interaction.guildId) : defaultSettings();
      if (interaction.commandName !== 'ayarlar' && settings.commandChannelId && interaction.channelId !== settings.commandChannelId) {
        await interaction.reply({
          embeds: [createBotEmbed({ kind: 'info', description: `Bu komutu <#${settings.commandChannelId}> kanalında kullan.` })],
          flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] }
        });
        return;
      }
      if (interaction.guildId && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        const member = interaction.member;
        const roles = [interaction.guildId, ...(member ? (Array.isArray(member.roles) ? member.roles : [...member.roles.cache.keys()]) : [])];
        const parentId = interaction.channel?.isThread() ? interaction.channel.parentId : null;
        if (!accessAllows(settingsStore.getCommandAccess(interaction.guildId, interaction.commandName), roles, interaction.channelId, parentId)) {
          await interaction.reply({ content:'Bu komut için erişim iznin yok.', flags:MessageFlags.Ephemeral, allowedMentions:{parse:[]} });
          return;
        }
      }
      await withTrace(()=>command.run(interaction, { settings, settingsStore, commands }),traceId);
      outcome='succeeded';
    } catch (error: unknown) {
      outcome='failed';
      logger.error('Komut çalıştırılamadı', { command: interaction.commandName, error: safeErrorName(error) });
      const response = {
        embeds: [createBotEmbed({
          kind: 'error',
          description: 'Komut çalıştırılamadı. Tekrar deneyin.'
        })],
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] }
      } satisfies InteractionReplyOptions;
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(response);
        } else {
          await interaction.reply(response);
        }
      } catch {
        logger.warn('Hata yanıtı Discord tarafından teslim edilemedi.');
      }
    } finally {try{finish?.(outcome);}catch{/* Telemetry never breaks interactions. */}}
  });
  return client;
}
