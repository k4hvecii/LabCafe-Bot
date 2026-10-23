import type { DatabaseSync } from 'node:sqlite';
import { isSnowflake } from '../config/env.js';

export interface CommandAccessSettings {
  disabled: boolean; allowedRoleIds: string[]; deniedRoleIds: string[];
  allowedChannelIds: string[]; deniedChannelIds: string[];
}
export const defaultAccess = (): CommandAccessSettings => ({ disabled: false, allowedRoleIds: [], deniedRoleIds: [], allowedChannelIds: [], deniedChannelIds: [] });
export function parseAccess(value: unknown): CommandAccessSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Geçersiz komut ayarları.');
  const settings = defaultAccess();
  for (const key of Object.keys(value)) if (!Object.hasOwn(settings,key)) throw new Error('Geçersiz komut ayarı.');
  if (!('disabled' in value) || typeof value.disabled !== 'boolean') throw new Error('Geçersiz komut durumu.');
  settings.disabled = value.disabled;
  for (const key of ['allowedRoleIds','deniedRoleIds','allowedChannelIds','deniedChannelIds'] as const) {
    const ids: unknown = Reflect.get(value, key);
    if (!Array.isArray(ids) || ids.length > 25 || !ids.every((id: unknown) => typeof id === 'string' && isSnowflake(id))) throw new Error('Geçersiz rol veya kanal.');
    settings[key] = [...new Set<string>(ids)];
  }
  return settings;
}
export function getAccess(db: DatabaseSync, guildId: string, command: string): CommandAccessSettings {
  const row = db.prepare('SELECT payload FROM guild_command_access WHERE guild_id=? AND command_name=?').get(guildId, command);
  if (!row) return defaultAccess();
  if (typeof row.payload !== 'string') throw new Error('Geçersiz komut kaydı.');
  return parseAccess(JSON.parse(row.payload) as unknown);
}
export function accessAllows(settings: CommandAccessSettings, roles: readonly string[], channelId: string | null, parentId?: string | null): boolean {
  const channels = [channelId, parentId].filter((id): id is string => Boolean(id));
  return !settings.disabled && !settings.deniedRoleIds.some(id => roles.includes(id))
    && !settings.deniedChannelIds.some(id => channels.includes(id))
    && (!settings.allowedRoleIds.length || settings.allowedRoleIds.some(id => roles.includes(id)))
    && (!settings.allowedChannelIds.length || settings.allowedChannelIds.some(id => channels.includes(id)));
}
