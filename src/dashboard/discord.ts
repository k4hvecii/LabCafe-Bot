import { REST, Routes, PermissionFlagsBits, ChannelType } from 'discord.js';
import type { RESTGetAPIGuildChannelsResult, RESTGetAPIGuildResult } from 'discord.js';
import type { DashboardConfig } from './config.js';
import { DiscordRestMetrics } from '../observability/discord-metrics.js';
import { measuredRestTransport, measuredFetch, observeRateLimits } from '../observability/discord-rest.js';

export interface DashboardUser { id: string; name: string; avatar: string | null }
export interface DashboardGuild { id: string; name: string; icon: string | null; owner: boolean; permissions: string }
export interface DashboardChannel { id: string; name: string }
export interface GuildAudit {
  roleCount: number; channelCount: number;
  administratorRoles: {id:string;name:string;managed:boolean}[];
  everyoneRiskyPermissions: string[]; emptyCategoryCount: number; uncategorizedChannelCount: number;
}
export interface GuildDetails { audit?: GuildAudit; id: string; name: string; icon: string | null; channels: DashboardChannel[] }
export interface OAuthResult { accessToken: string; expiresIn: number;installationGuildId?:string }
export interface PublicGuild { id: string; name: string; icon: string | null; members: number | null; verified: boolean; partnered: boolean; community: boolean }
export interface PublicGuilds { count: number; guilds: PublicGuild[] }
export interface DiscordService {
  getBotGuildIds(): Promise<string[]>;
  getPublicGuilds(): Promise<PublicGuilds>;
  exchangeCode(code: string): Promise<OAuthResult>;
  getUser(token: string): Promise<DashboardUser>;
  getGuilds(token: string): Promise<DashboardGuild[]>;
  getGuild(id: string): Promise<GuildDetails | null>;
  canUseChannel(guildId: string, channelId: string): Promise<boolean>;
}

export class DiscordUserRequestError extends Error {
 constructor(readonly status:number,message:string){super(message);this.name='DiscordUserRequestError';}
}
function object(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
export function canManageGuild(guild: DashboardGuild): boolean {
  if (guild.owner) return true;
  try { return (BigInt(guild.permissions) & (PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator)) !== 0n; }
  catch { return false; }
}

export function createDiscordService(config: DashboardConfig, botToken: string, transport?: Pick<REST, 'get'>, metrics=new DiscordRestMetrics('dashboard')): DiscordService {
  const rest = transport ?? new REST({ version: '10',makeRequest:measuredRestTransport(metrics) }).setToken(botToken);
  if(rest instanceof REST)observeRateLimits(rest,metrics);
  const request=measuredFetch(metrics);
  async function userRequest(path: string, token: string): Promise<unknown> {
    const response = await request(`https://discord.com/api/v10${path}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) throw new DiscordUserRequestError(response.status===401||response.status===403?401:response.status===429?429:502,
      response.status===401||response.status===403?'Discord oturumun doğrulanamadı. Tekrar giriş yap.':response.status===429?'Discord kısa sürede çok fazla istek aldı. Biraz bekleyip tekrar dene.':'Discord şu anda yanıt veremiyor. Biraz sonra tekrar dene.');
    return response.json();
  }
  async function readBotGuilds() {
      // Bot authentication: never expose a visitor's personal guild list.
      const guilds: { id: string; name: string; icon: string | null; features: string[] }[] = [];
      let after = '';
      for (let page = 0; page < 20; page++) {
        const data = await rest.get(Routes.userGuilds(), { query: new URLSearchParams({ limit: '200', ...(after ? { after } : {}) }) });
        if (!Array.isArray(data)) throw new Error('Sunucu listesi alınamadı.');
        for (const entry of data) {
          if (!object(entry) || typeof entry.id !== 'string' || !/^\d{17,20}$/.test(entry.id) || typeof entry.name !== 'string') throw new Error('Geçersiz sunucu.');
          guilds.push({ id: entry.id, name: entry.name, icon: typeof entry.icon === 'string' ? entry.icon : null,
            features: Array.isArray(entry.features) ? entry.features.filter((feature): feature is string => typeof feature === 'string') : [] });
        }
        if (data.length < 200) break;
        const last = guilds.at(-1)?.id;
        if (!last || last === after || page === 19) throw new Error('Sunucu listesi tamamlanamadı.');
        after = last;
      }
      return guilds;
  }
  // Share concurrent reads without caching membership or user authorization.
  let botGuildsRequest: ReturnType<typeof readBotGuilds> | undefined;
  async function fetchBotGuilds() {
    botGuildsRequest ??= readBotGuilds();
    const request = botGuildsRequest;
    try { return await request; }
    finally { if (botGuildsRequest === request) botGuildsRequest = undefined; }
  }
  return {
    async getBotGuildIds() { return (await fetchBotGuilds()).map(guild => guild.id); },
    async getPublicGuilds() {
      const guilds = await fetchBotGuilds();
      const result: PublicGuild[] = [];
      // Bound expensive count requests; the homepage displays at most 24 guilds.
      const featured = [...guilds].sort((a, b) => Number(b.id === config.supportGuildId) - Number(a.id === config.supportGuildId));
      for (let offset = 0; offset < Math.min(featured.length, 24); offset += 4) {
        const batch = await Promise.all(featured.slice(offset, Math.min(offset + 4, 24)).map(async guild => {
        let members: number | null = null;
        try {
          const detail = await rest.get(Routes.guild(guild.id), { query: new URLSearchParams({ with_counts: 'true' }) });
          if (object(detail) && typeof detail.approximate_member_count === 'number') members = detail.approximate_member_count;
        } catch { /* Missing counts do not hide an otherwise available guild. */ }
        return { id: guild.id, name: guild.name, icon: guild.icon, members,
          verified: guild.features.includes('VERIFIED'), partnered: guild.features.includes('PARTNERED'), community: guild.features.includes('COMMUNITY') };
        }));
        result.push(...batch);
      }
      return { count: guilds.length, guilds: result };
    },
    async exchangeCode(code) {
      if (!config.clientSecret) throw new Error('Discord girişi yapılandırılmadı.');
      const response = await request('https://discord.com/api/oauth2/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret,
          grant_type: 'authorization_code', code, redirect_uri: config.redirectUri }),
        signal: AbortSignal.timeout(10_000)
      });
      if (!response.ok) throw new Error('Discord oturumu açılamadı.');
      const data: unknown = await response.json();
      if (!object(data) || typeof data.access_token !== 'string' || typeof data.expires_in !== 'number'
        || !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw new Error('Geçersiz OAuth yanıtı.');
      return { accessToken: data.access_token, expiresIn: data.expires_in,...(object(data.guild)&&typeof data.guild.id==='string'&&/^\d{17,20}$/.test(data.guild.id)?{installationGuildId:data.guild.id}:{}) };
    },
    async getUser(token) {
      const data = await userRequest('/users/@me', token);
      if (!object(data) || typeof data.id !== 'string' || typeof data.username !== 'string') throw new Error('Geçersiz kullanıcı.');
      return { id: data.id, name: typeof data.global_name === 'string' ? data.global_name : data.username,
        avatar: typeof data.avatar === 'string' ? data.avatar : null };
    },
    async getGuilds(token) {
      const result: DashboardGuild[] = [];
      let after = '';
      for (let page = 0; page < 20; page++) {
        const data = await userRequest(`/users/@me/guilds?limit=200${after ? `&after=${after}` : ''}`, token);
        if (!Array.isArray(data)) throw new Error('Geçersiz sunucu listesi.');
        for (const entry of data) {
          if (!object(entry) || typeof entry.id !== 'string' || !/^\d{17,20}$/.test(entry.id)
            || typeof entry.name !== 'string' || typeof entry.permissions !== 'string') throw new Error('Geçersiz sunucu.');
          result.push({ id: entry.id, name: entry.name, permissions: entry.permissions,
            owner: entry.owner === true, icon: typeof entry.icon === 'string' ? entry.icon : null });
        }
        if (data.length < 200) return result;
        const last = result.at(-1)?.id;
        if (!last || last === after) throw new Error('Sunucu listesi tamamlanamadı.');
        after = last;
      }
      throw new Error('Sunucu listesi çok uzun.');
    },
    async getGuild(id) {
      try {
        const guild = await rest.get(Routes.guild(id)) as RESTGetAPIGuildResult;
        const channels = await rest.get(Routes.guildChannels(id)) as RESTGetAPIGuildChannelsResult;
        const roles=guild.roles;
        const everyone=roles.find(role=>role.id===id);
        const everyonePermissions=BigInt(everyone?.permissions ?? '0');
        const risky = [
          ['Yönetici',PermissionFlagsBits.Administrator],['Sunucuyu Yönet',PermissionFlagsBits.ManageGuild],
          ['Rolleri Yönet',PermissionFlagsBits.ManageRoles],['Kanalları Yönet',PermissionFlagsBits.ManageChannels],
          ['Webhook Yönet',PermissionFlagsBits.ManageWebhooks],['Üyeleri Yasakla',PermissionFlagsBits.BanMembers],
          ['Üyeleri At',PermissionFlagsBits.KickMembers],['Herkesten Bahset',PermissionFlagsBits.MentionEveryone]
        ] as const;
        const children=new Set(channels.map(channel=>'parent_id' in channel?channel.parent_id:null).filter(Boolean));
        return { id: guild.id, name: guild.name, icon: guild.icon,
          audit:{roleCount:roles.length,channelCount:channels.length,
            administratorRoles:roles.filter(role=>(BigInt(role.permissions)&PermissionFlagsBits.Administrator)!==0n).map(role=>({id:role.id,name:role.name,managed:role.managed})),
            everyoneRiskyPermissions:risky.filter(([,bit])=>(everyonePermissions&bit)!==0n).map(([name])=>name),
            emptyCategoryCount:channels.filter(channel=>channel.type===ChannelType.GuildCategory&&!children.has(channel.id)).length,
            uncategorizedChannelCount:channels.filter(channel=>channel.type!==ChannelType.GuildCategory&&'parent_id' in channel&&!channel.parent_id).length},
          channels: channels.filter(channel => channel.type === ChannelType.GuildText)
            .map(channel => ({ id: channel.id, name: channel.name ?? 'kanal' })) };
      } catch (error) {
        if (object(error) && (error.status === 403 || error.status === 404)) return null;
        throw error;
      }
    },
    async canUseChannel(guildId, channelId) {
      const [guild, channels, bot, roles] = await Promise.all([
        rest.get(Routes.guild(guildId)), rest.get(Routes.guildChannels(guildId)),
        rest.get(Routes.user('@me')), rest.get(Routes.guildRoles(guildId))
      ]);
      if (!object(guild) || !Array.isArray(channels) || !object(bot) || typeof bot.id !== 'string' || !Array.isArray(roles)) return false;
      const member = await rest.get(Routes.guildMember(guildId, bot.id));
      if (!object(member) || !Array.isArray(member.roles)) return false;
      const roleIds = new Set<string>([guildId, ...member.roles.filter((id): id is string => typeof id === 'string')]);
      let permissions = 0n;
      for (const role of roles) {
        if (object(role) && typeof role.id === 'string' && roleIds.has(role.id) && typeof role.permissions === 'string') permissions |= BigInt(role.permissions);
      }
      const channel = channels.find(entry => object(entry) && entry.id === channelId);
      if (!object(channel) || channel.type !== ChannelType.GuildText) return false;
      if (guild.owner_id === bot.id || (permissions & PermissionFlagsBits.Administrator) !== 0n) return true;
      const overwrites = Array.isArray(channel.permission_overwrites) ? channel.permission_overwrites : [];
      const apply = (deny: bigint, allow: bigint) => { permissions = (permissions & ~deny) | allow; };
      for (const overwrite of overwrites) {
        if (object(overwrite) && overwrite.id === guildId && typeof overwrite.deny === 'string' && typeof overwrite.allow === 'string') apply(BigInt(overwrite.deny), BigInt(overwrite.allow));
      }
      let deny = 0n; let allow = 0n;
      for (const overwrite of overwrites) {
        if (object(overwrite) && overwrite.type === 0 && typeof overwrite.id === 'string' && overwrite.id !== guildId
          && roleIds.has(overwrite.id) && typeof overwrite.deny === 'string' && typeof overwrite.allow === 'string') {
          deny |= BigInt(overwrite.deny); allow |= BigInt(overwrite.allow);
        }
      }
      apply(deny, allow);
      for (const overwrite of overwrites) {
        if (object(overwrite) && overwrite.type === 1 && overwrite.id === bot.id && typeof overwrite.deny === 'string' && typeof overwrite.allow === 'string') apply(BigInt(overwrite.deny), BigInt(overwrite.allow));
      }
      const required = PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages | PermissionFlagsBits.EmbedLinks;
      return (permissions & required) === required;
    }
  };
}
