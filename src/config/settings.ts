import { getAccess, parseAccess } from '../help/access-store.js';
import type { CommandAccessSettings } from '../help/access-store.js';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isSnowflake } from './env.js';

export interface GuildSettings {
  locale: 'tr' | 'en';
  ephemeralReplies: boolean;
  commandChannelId: string | null;
}

export interface BetaPolicy { enabled: boolean; guildIds: string[] }
export function parseBetaPolicy(value: unknown): BetaPolicy {
  if (typeof value !== 'object' || value === null || !('enabled' in value) || typeof value.enabled !== 'boolean'
    || !('guildIds' in value) || !Array.isArray(value.guildIds) || value.guildIds.length > 100
    || !value.guildIds.every((id: unknown) => typeof id === 'string' && isSnowflake(id))
    || Object.keys(value).some(key => !['enabled','guildIds'].includes(key))) throw new Error('Geçersiz beta ayarları.');
  return { enabled:value.enabled, guildIds:[...new Set<string>(value.guildIds)] };
}

export const defaultSettings = (): GuildSettings => ({ locale:'tr', ephemeralReplies: true, commandChannelId: null });

export class GuildSettingsStore {
  private readonly db: DatabaseSync;

  constructor(path = process.env.LABCAFE_SETTINGS_PATH?.trim() || fileURLToPath(new URL('../../data/settings.sqlite', import.meta.url))) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS guild_command_access (guild_id TEXT NOT NULL, command_name TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(guild_id, command_name));
      CREATE TABLE IF NOT EXISTS guild_settings (
        guild_id TEXT PRIMARY KEY,
        ephemeral INTEGER NOT NULL CHECK(ephemeral IN (0, 1)),
        command_channel_id TEXT
      );`);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const columns=this.db.prepare('PRAGMA table_info(guild_settings)').all();
      if(!columns.some(column=>column.name==='locale'))this.db.exec("ALTER TABLE guild_settings ADD COLUMN locale TEXT NOT NULL DEFAULT 'tr' CHECK(locale IN ('tr','en'))");
      this.db.exec('COMMIT');
    }catch(error){this.db.exec('ROLLBACK');throw error;}
    this.db.exec(`CREATE TABLE IF NOT EXISTS settings_history (
      id INTEGER PRIMARY KEY, guild_id TEXT NOT NULL, actor_id TEXT NOT NULL,
      changed_at TEXT NOT NULL, action TEXT NOT NULL, previous_payload TEXT NOT NULL, payload TEXT NOT NULL
    ); CREATE INDEX IF NOT EXISTS settings_history_guild ON settings_history(guild_id,id);
    CREATE TABLE IF NOT EXISTS beta_policy (
      id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL
    ); CREATE TABLE IF NOT EXISTS beta_policy_history (
      id INTEGER PRIMARY KEY, actor_id TEXT NOT NULL, changed_at TEXT NOT NULL,
      previous_payload TEXT NOT NULL, payload TEXT NOT NULL
    );`);
  }

  history(guildId: string) {
    if (!isSnowflake(guildId)) throw new Error('Geçersiz sunucu.');
    return this.db.prepare('SELECT actor_id AS actorId, changed_at AS changedAt, action, previous_payload AS previousPayload, payload FROM settings_history WHERE guild_id=? ORDER BY id DESC LIMIT 20').all(guildId);
  }

  getCommandAccess(guildId: string, command: string): CommandAccessSettings {
    if (!isSnowflake(guildId)) throw new Error('Geçersiz sunucu.');
    return getAccess(this.db, guildId, command);
  }

  setCommandAccess(guildId: string, command: string, value: unknown, actorId?: string): CommandAccessSettings {
    if (!isSnowflake(guildId) || !/^[\p{L}\p{N}_-]{1,32}$/u.test(command)) throw new Error('Geçersiz komut veya sunucu.');
    const settings = parseAccess(value);
    if (actorId && !isSnowflake(actorId)) throw new Error('Geçersiz kullanıcı.');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const previous=this.getCommandAccess(guildId,command);
      this.db.prepare('INSERT INTO guild_command_access (guild_id,command_name,payload) VALUES (?,?,?) ON CONFLICT(guild_id,command_name) DO UPDATE SET payload=excluded.payload').run(guildId, command, JSON.stringify(settings));
      if(actorId) this.db.prepare('INSERT INTO settings_history (guild_id,actor_id,changed_at,action,previous_payload,payload) VALUES (?,?,?,?,?,?)')
        .run(guildId,actorId,new Date().toISOString(),`command-access:${command}`,JSON.stringify(previous),JSON.stringify(settings));
      this.db.exec('COMMIT'); return settings;
    } catch(error) { this.db.exec('ROLLBACK'); throw error; }
  }

  getBetaPolicy(): BetaPolicy {
    const row = this.db.prepare('SELECT payload FROM beta_policy WHERE id=1').get();
    if (!row) return { enabled:false, guildIds:[] };
    if (typeof row.payload !== 'string') throw new Error('Geçersiz beta kaydı.');
    return parseBetaPolicy(JSON.parse(row.payload) as unknown);
  }

  setBetaPolicy(value: unknown, actorId: string): BetaPolicy {
    if (!isSnowflake(actorId)) throw new Error('Geçersiz yönetici.');
    const policy = parseBetaPolicy(value);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const previous = this.getBetaPolicy();
      const payload = JSON.stringify(policy);
      this.db.prepare('INSERT INTO beta_policy (id,payload) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(payload);
      this.db.prepare('INSERT INTO beta_policy_history (actor_id,changed_at,previous_payload,payload) VALUES (?,?,?,?)')
        .run(actorId,new Date().toISOString(),JSON.stringify(previous),payload);
      this.db.exec('COMMIT'); return policy;
    } catch(error) { this.db.exec('ROLLBACK'); throw error; }
  }

  betaAllows(guildId: string): boolean {
    const policy = this.getBetaPolicy();
    return !policy.enabled || policy.guildIds.includes(guildId);
  }

  get(guildId: string): GuildSettings {
    if (!isSnowflake(guildId)) throw new Error('Geçersiz sunucu ID.');
    const row = this.db.prepare('SELECT ephemeral, command_channel_id, locale FROM guild_settings WHERE guild_id = ?').get(guildId);
    if (!row) return defaultSettings();
    if ((row.ephemeral !== 0 && row.ephemeral !== 1)
      || (row.command_channel_id !== null && (typeof row.command_channel_id !== 'string' || !isSnowflake(row.command_channel_id)))) {
      throw new Error('Kayıtlı sunucu ayarları geçersiz.');
    }
    return { locale:row.locale==='en'?'en':'tr', ephemeralReplies: row.ephemeral === 1, commandChannelId: row.command_channel_id };
  }

  update(guildId: string, patch: Partial<GuildSettings>, actorId?: string, expected?: GuildSettings): GuildSettings {
    if(patch.locale!==undefined && patch.locale!=='tr' && patch.locale!=='en')throw new Error('Geçersiz dil.');
    if (patch.ephemeralReplies !== undefined && typeof patch.ephemeralReplies !== 'boolean') throw new Error('Geçersiz yanıt ayarı.');
    if (patch.commandChannelId !== undefined && patch.commandChannelId !== null && !isSnowflake(patch.commandChannelId)) {
      throw new Error('Geçersiz kanal ID.');
    }
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const previous = this.get(guildId);
      if (expected && JSON.stringify(expected) !== JSON.stringify(previous)) throw new Error('SETTINGS_CONFLICT');
      const settings = { ...previous, ...patch };
      this.db.prepare(`INSERT INTO guild_settings (guild_id, ephemeral, command_channel_id, locale) VALUES (?, ?, ?, ?)
        ON CONFLICT(guild_id) DO UPDATE SET ephemeral = excluded.ephemeral, command_channel_id = excluded.command_channel_id, locale=excluded.locale`)
        .run(guildId, settings.ephemeralReplies ? 1 : 0, settings.commandChannelId, settings.locale);
      if (actorId) {
        if (!isSnowflake(actorId)) throw new Error('Geçersiz kullanıcı.');
        this.db.prepare('INSERT INTO settings_history (guild_id,actor_id,changed_at,action,previous_payload,payload) VALUES (?,?,?,?,?,?)')
          .run(guildId,actorId,new Date().toISOString(),'update',JSON.stringify(previous),JSON.stringify(settings));
      }
      this.db.exec('COMMIT');
      return settings;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  reset(guildId: string, actorId?: string, expected?: GuildSettings): GuildSettings {
    if (!isSnowflake(guildId)) throw new Error('Geçersiz sunucu ID.');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const previous = this.get(guildId);
      if (expected && JSON.stringify(expected) !== JSON.stringify(previous)) throw new Error('SETTINGS_CONFLICT');
      this.db.prepare('DELETE FROM guild_settings WHERE guild_id = ?').run(guildId);
      if (actorId) {
        if (!isSnowflake(actorId)) throw new Error('Geçersiz kullanıcı.');
        this.db.prepare('INSERT INTO settings_history (guild_id,actor_id,changed_at,action,previous_payload,payload) VALUES (?,?,?,?,?,?)')
          .run(guildId,actorId,new Date().toISOString(),'reset',JSON.stringify(previous),JSON.stringify(defaultSettings()));
      }
      this.db.exec('COMMIT'); return defaultSettings();
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  healthy(): boolean { return this.db.prepare('SELECT 1').get() !== undefined; }

  close(): void { this.db.close(); }
}
