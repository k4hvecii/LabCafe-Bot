export interface DashboardConfig {
  installFlowEnabled?:boolean;
  trustLoopbackProxy?: boolean;
  ownerId?: string;
  origin: string;
  host: string;
  port: number;
  clientId: string;
  clientSecret: string | undefined;
  supportGuildId: string | undefined;
  supportInviteUrl: string | undefined;
  redirectUri: string;
}

export function readDashboardConfig(env: NodeJS.ProcessEnv): DashboardConfig {
  const install=env.LABCAFE_INSTALL_FLOW??'false';if(!['true','false'].includes(install))throw new Error('Geçersiz kurulum akışı yapılandırması.');
  const proxy = env.DASHBOARD_TRUST_LOOPBACK_PROXY?.trim() || 'false';
  const ownerId = env.LABCAFE_OWNER_ID?.trim();
  if (ownerId && !/^\d{17,20}$/.test(ownerId)) throw new Error('Geçersiz LABCAFE_OWNER_ID.');
  if (!['true', 'false'].includes(proxy)) throw new Error('DASHBOARD_TRUST_LOOPBACK_PROXY true veya false olmalı.');
  const url = new URL(env.DASHBOARD_ORIGIN?.trim() || 'http://localhost:3000');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((!local && url.protocol !== 'https:') || !['http:', 'https:'].includes(url.protocol)
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('DASHBOARD_ORIGIN geçerli bir HTTPS adresi veya yerel HTTP adresi olmalı.');
  }
  const port = Number(env.DASHBOARD_PORT || url.port || (url.protocol === 'https:' ? 3000 : 80));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Geçersiz dashboard portu.');
  const clientId = env.DISCORD_CLIENT_ID?.trim() ?? '';
  if (!/^\d{17,20}$/.test(clientId)) throw new Error('DISCORD_CLIENT_ID gerekli.');
  const supportGuildId = env.DASHBOARD_SUPPORT_GUILD_ID?.trim() || env.DISCORD_GUILD_ID?.trim() || undefined;
  if (supportGuildId && !/^\d{17,20}$/.test(supportGuildId)) throw new Error('Geçersiz destek sunucusu kimliği.');
  const supportInviteUrl = env.DASHBOARD_SUPPORT_INVITE_URL?.trim() || undefined;
  if (supportInviteUrl) {
    const invite = new URL(supportInviteUrl);
    if (invite.protocol !== 'https:' || invite.username || invite.password || invite.port || invite.search || invite.hash
      || !(invite.hostname === 'discord.gg' && /^\/[\w-]+\/?$/.test(invite.pathname)
        || invite.hostname === 'discord.com' && /^\/invite\/[\w-]+\/?$/.test(invite.pathname))) {
      throw new Error('Destek bağlantısı geçerli bir HTTPS Discord daveti olmalı.');
    }
  }
  return { ...(install==='true'?{installFlowEnabled:true}:{}),...(ownerId ? {ownerId} : {}), trustLoopbackProxy: proxy === 'true', origin: url.origin, host: env.DASHBOARD_HOST?.trim() || '127.0.0.1', port,
    clientId, clientSecret: env.DISCORD_CLIENT_SECRET?.trim() || undefined, supportGuildId, supportInviteUrl,
    redirectUri: `${url.origin}/auth/callback` };
}
