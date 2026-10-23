import { LEVELS, type Level } from '../core/logger.js';

/** Pure environment parsing: no file reads or process mutations. */
export interface BotConfig {
  registerJoinedGuilds?: boolean;
  settingsPanelPrototype?: boolean;
  settingsPanelTestApplicationId?: string;
  token: string;
  clientId: string;
  guildId: string | undefined;
  logLevel: Level;
}

export const SNOWFLAKE_PATTERN = /^\d{17,20}$/;

export function isSnowflake(value: string): boolean {
  return SNOWFLAKE_PATTERN.test(value);
}

export function readConfig(env: NodeJS.ProcessEnv): BotConfig {
  const token = env.DISCORD_TOKEN?.trim();
  if (!token || token === 'BOT_TOKEN_BURAYA') {
    throw new Error('DISCORD_TOKEN eksik. .env dosyasını düzenleyin.');
  }

  const clientId = env.DISCORD_CLIENT_ID?.trim() ?? '';
  if (!isSnowflake(clientId)) {
    throw new Error('DISCORD_CLIENT_ID geçerli bir Discord Application ID olmalı.');
  }

  const guildId = env.DISCORD_GUILD_ID?.trim() || undefined;
  if (guildId && !isSnowflake(guildId)) {
    throw new Error('DISCORD_GUILD_ID geçerli bir sunucu ID olmalı.');
  }
  const joined = env.DISCORD_REGISTER_JOINED_GUILDS?.trim();
  if (joined && !['true','false'].includes(joined)) throw new Error('DISCORD_REGISTER_JOINED_GUILDS true veya false olmalı.');

  const prototype = env.LABCAFE_SETTINGS_PANEL_PROTOTYPE?.trim();
  if (prototype && !['true','false'].includes(prototype)) throw new Error('LABCAFE_SETTINGS_PANEL_PROTOTYPE must be true or false.');
  const testApplication = env.LABCAFE_TEST_APPLICATION_ID?.trim();
  if (prototype === 'true' && (!['development','test'].includes(env.NODE_ENV ?? '') || !guildId || joined === 'true' || testApplication !== clientId)) {
    throw new Error('Settings prototype requires development/test mode, a dedicated test application ID, a test guild and joined-guild registration disabled.');
  }

  const logLevel = env.LOG_LEVEL?.trim() || 'info';
  if (!(LEVELS as readonly string[]).includes(logLevel)) {
    throw new Error(`LOG_LEVEL: ${LEVELS.join(', ')} olmalı.`);
  }

  return { token, clientId, guildId, logLevel: logLevel as BotConfig['logLevel'], ...(joined ? {registerJoinedGuilds:joined === 'true'} : {}), ...(prototype==='true'?{settingsPanelPrototype:true,settingsPanelTestApplicationId:testApplication!}:{}) };
}
