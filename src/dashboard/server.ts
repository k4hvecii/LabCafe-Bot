import {errorPage} from './error-page.js';
import { AnalyticsService, analyticsRange, ignoreTraffic, parseTrafficEvent } from '../analytics/service.js';
import { NativeAnalytics, nativePrefix } from '../analytics/native.js';
import type { ConversionStore } from '../analytics/conversions.js';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { DashboardConfig } from './config.js';
import type { DashboardUser, DiscordService, PublicGuilds, GuildDetails } from './discord.js';
import { canManageGuild, DiscordUserRequestError } from './discord.js';
import type { GuildSettings, GuildSettingsStore } from '../config/settings.js';
import { clientIp } from './client-ip.js';
import { safeErrorName } from '../core/logger.js';
import { parseBetaPolicy } from '../config/settings.js';
import { isRestWindow, type DiscordRestMetrics } from '../observability/discord-metrics.js';
import type { StartupTracker } from '../observability/startup.js';
import type { ControlCenter } from '../observability/center.js';
import { parseAlertSettings } from '../observability/alerts.js';
import { publicComponentPreview } from '../ui/cards.js';
import {performance} from 'node:perf_hooks';

interface Session { user: DashboardUser; accessToken: string; csrf: string; expires: number;adminIssuedAt:number;adminActiveAt:number }
interface Options {
  observability?:{rest:DiscordRestMetrics;startup?:StartupTracker;center?:ControlCenter};
  nativeAnalytics?: NativeAnalytics;
  analytics?: AnalyticsService;
  conversions?: ConversionStore;
  preloadPublicGuilds?: boolean;
  config: DashboardConfig;
  store: GuildSettingsStore;
  discord: DiscordService;
  commands: { name: string; description: string }[];
}
class HttpError extends Error { constructor(readonly status: number, message: string) { super(message); } }
const nonce = () => randomBytes(32).toString('base64url');
const same = (a: string, b: string) => {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
function cookies(req: IncomingMessage): Map<string, string> {
  return new Map((req.headers.cookie ?? '').split(';').map(part => {
    const index = part.indexOf('='); return [part.slice(0, index).trim(), part.slice(index + 1)];
  }));
}
async function readBody(req: IncomingMessage): Promise<unknown> {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, 'JSON gerekli.');
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 4096) throw new HttpError(413, 'İstek çok büyük.');
    chunks.push(buffer);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
  catch { throw new HttpError(400, 'Geçersiz JSON.'); }
}
function parseSettings(value: unknown): GuildSettings {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || !('ephemeralReplies' in value) || typeof value.ephemeralReplies !== 'boolean'
    || !('commandChannelId' in value) || (value.commandChannelId !== null && (typeof value.commandChannelId !== 'string' || !/^\d{17,20}$/.test(value.commandChannelId)))
    || Object.keys(value).some(key => !['ephemeralReplies', 'commandChannelId','locale'].includes(key))) {
    throw new HttpError(400, 'Ayar değerleri geçersiz.');
  }
  if ('locale' in value && value.locale !== 'tr' && value.locale !== 'en') throw new HttpError(400,'Geçersiz dil.');
  return { locale: 'locale' in value && value.locale === 'en' ? 'en':'tr', ephemeralReplies: value.ephemeralReplies, commandChannelId: value.commandChannelId };
}

export function analyze(guild: GuildDetails, settings: GuildSettings, commandCount: number, canSend: boolean | null) {
  const channelValid = !settings.commandChannelId || guild.channels.some(channel=>channel.id===settings.commandChannelId);
  const checks: {label:string;ok:boolean|null;detail:string;status?:'info'|'warning'}[] = [
    {label:'Komut kanalı',ok:channelValid,detail:settings.commandChannelId ? (channelValid?'Seçili kanal mevcut.':'Seçili kanal silinmiş veya erişilemiyor.') : 'Kanal kısıtlaması yok.'},
    {label:'Mesaj izinleri',ok:canSend,detail:canSend===null?'Belirli bir komut kanalı seçilmediği için bu kontrol yapılmadı.':canSend?'Seçili kanalda görüntüleme, mesaj ve embed izinleri var.':'Seçili kanalda botun mesaj izinleri eksik.'}
  ];
  if(guild.audit){
    const audit=guild.audit;
    checks.push({label:'@everyone yetkileri',ok:audit.everyoneRiskyPermissions.length===0,
      detail:audit.everyoneRiskyPermissions.length?`Tüm üyelere açık yüksek etkili yetkiler: ${audit.everyoneRiskyPermissions.join(', ')}. Sunucunun ihtiyacına göre gözden geçir.`:'@everyone rolünde denetlenen yüksek etkili yetkiler bulunmadı. Bu kontrol diğer rollerin izinlerini kapsamaz.'});
    const admins=audit.administratorRoles.filter(role=>!role.managed);
    checks.push({label:'Yönetici rolleri',ok:null,status:'info',detail:admins.length?`${admins.length} normal rol Yönetici yetkisine sahip: ${admins.slice(0,10).map(role=>role.name).join(', ')}. Bu yetki kanal izin kısıtlarını aşar; gerçekten gerekli rollerde tut.`:'Normal rollerde Yönetici yetkisi bulunmadı. Entegrasyon rolleri bu sayıdan ayrıdır.'});
    checks.push({label:'Kanal düzeni',ok:null,status:'info',detail:`${audit.emptyCategoryCount} boş kategori, ${audit.uncategorizedChannelCount} kategori dışı kanal var. Bunlar tek başına hata değildir; düzenleme ihtiyacına göre değerlendir.`});
  }
  return { checkedAt:new Date().toISOString(), textChannelCount:guild.channels.length,commandCount,
    ...(guild.audit?{roleCount:guild.audit.roleCount,channelCount:guild.audit.channelCount}:{}),checks };
}

function sendAsset(req: IncomingMessage, res: ServerResponse, data: Buffer, type: string): void {
  const etag = `"${createHash('sha256').update(data).digest('hex')}"`;
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.setHeader('ETag', etag);
  res.setHeader('Content-Type', type);
  const candidates = req.headers['if-none-match']?.split(',').map(value => value.trim().replace(/^W\//, ''));
  if (candidates?.includes(etag) || candidates?.includes('*')) {
    res.writeHead(304); res.end(); return;
  }
  res.writeHead(200); res.end(data);
}

export function createDashboardServer({ config, store, discord, commands, preloadPublicGuilds = false, analytics=new AnalyticsService(undefined), conversions, nativeAnalytics,observability }: Options) {
  const sessions = new Map<string, Session>();
  const pending = new Map<string, number>();
  const installations=new Map<string,{before:ReadonlySet<string>;campaign:Record<string,string>}>();
  const rates = new Map<string, { count: number; expires: number }>();
  const streams=new Set<ServerResponse>();
  const owner=(session:Session|undefined)=>{
    if(!session||session.expires<=Date.now())throw new HttpError(401,'Discord ile giriş yapın.');
    if(!config.ownerId||session.user.id!==config.ownerId){observability?.center?.store.record({at:Date.now(),service:'dashboard',level:'warning',code:'admin_access_denied'});throw new HttpError(403,'Bu alan yalnızca bot sahibine açık.');}
    if(Date.now()-session.adminIssuedAt>3600000||Date.now()-session.adminActiveAt>900000)throw new HttpError(401,'Yönetici oturumu sona erdi. Tekrar giriş yapın.');
    return session;
  };
  let publicGuilds: PublicGuilds | null = null;
  let publicGuildsExpires = 0;
  let publicGuildsRequest: Promise<PublicGuilds> | undefined;
  async function getPublicGuilds(): Promise<PublicGuilds | null> {
    if (Date.now() < publicGuildsExpires) return publicGuilds;
    publicGuildsRequest ??= discord.getPublicGuilds();
    try {
      publicGuilds = await publicGuildsRequest;
      publicGuildsExpires = Date.now() + 60_000;
    } catch {
      publicGuildsExpires = Date.now() + 30_000;
    } finally { publicGuildsRequest = undefined; }
    return publicGuilds;
  }
  const secure = config.origin.startsWith('https:');
  const cookie = (key: string, value: string, age: number) =>
    `${key}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure ? '; Secure' : ''}`;
  function json(res: ServerResponse, status: number, data: unknown) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data));
  }
  function redirect(res: ServerResponse, location: string) { res.writeHead(302, { Location: location }); res.end(); }
  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://cdn.discordapp.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const url = new URL(req.url ?? '/', config.origin);
    // HEAD uses the same routing/status/headers as GET, without sending a body.
    if (req.method === 'HEAD') { req.method = 'GET'; const end = res.end.bind(res); res.end = (() => end()) as typeof res.end; }
    if (secure) res.setHeader('Strict-Transport-Security', 'max-age=86400');
    if (['/preview','/onizleme'].includes(url.pathname)) { res.writeHead(301,{Location:'/'}); res.end(); return; }
    if(req.method==='GET'&&url.pathname==='/third-party-notices.txt'){const file=await readFile(new URL('../../dashboard/THIRD_PARTY_NOTICES.txt',import.meta.url));res.setHeader('Content-Type','text/plain; charset=utf-8');res.end(file);return;}
    if(req.method==='GET'&&url.pathname==='/discord-preview.json'){json(res,200,publicComponentPreview(config.origin,config.clientId));return;}
    if (url.pathname === '/robots.txt') { res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'}); res.end(`User-agent: *\nAllow: /\nDisallow: /dashboard\nDisallow: /admin\nDisallow: /api/\nDisallow: /auth/\nSitemap: ${config.origin}/sitemap.xml\n`); return; }
    if (url.pathname === '/sitemap.xml') { res.writeHead(200,{'Content-Type':'application/xml; charset=utf-8'}); res.end('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+['/','/features/dashboard','/features/server-checks','/features/commands','/terms-of-service','/privacy-policy','/data-deletion'].map(path=>`<url><loc>${config.origin}${path}</loc></url>`).join('')+'</urlset>'); return; }
    if (req.method === 'GET' && url.pathname === '/healthz') {
      let ready = false;
      try { ready = store.healthy(); } catch { /* Database unavailable. */ }
      json(res, ready ? 200 : 503, { ready }); return;
    }
    const legacyPages = new Map([
      ['/yonetim','/admin'],
      ['/hizmet-kosullari','/terms-of-service'],['/gizlilik-politikasi','/privacy-policy'],['/veri-silme','/data-deletion']
    ]);
    const canonical = legacyPages.get(url.pathname);
    if (req.method === 'GET' && canonical) {
      res.writeHead(301,{Location:canonical+url.search}); res.end(); return;
    }
    const now = Date.now();
    for (const [key, value] of sessions) if (value.expires <= now) {sessions.delete(key);observability?.center?.store.record({at:now,service:'dashboard',level:'info',code:'session_expired'});}
    for (const [key, expires] of pending) if (expires <= now) {pending.delete(key);installations.delete(key);}
    for (const [key, value] of rates) if (value.expires <= now) rates.delete(key);
    const ip = clientIp(req, config.trustLoopbackProxy);
    const authRequest = url.pathname.startsWith('/auth/');
    if (authRequest || url.pathname.startsWith('/api/')) {
      const rateKey = `${authRequest ? 'auth' : 'api'}:${ip}`;
      if (!rates.has(rateKey) && rates.size >= 5000) {
        res.setHeader('Retry-After', '60'); throw new HttpError(503, 'Biraz sonra tekrar deneyin.');
      }
      const rate = rates.get(rateKey) ?? { count: 0, expires: now + 60_000 };
      rate.count++; rates.set(rateKey, rate);
      if (rate.count > (authRequest ? 20 : 180)) {
        res.setHeader('Retry-After', '60'); throw new HttpError(429, 'Biraz sonra tekrar deneyin.');
      }
    }
    const fonts = ['manrope-regular.ttf', 'manrope-semibold.ttf', 'manrope-bold.ttf'];
    if(url.pathname==='/admin'||url.pathname.startsWith('/admin/assets/')){
      const current=sessions.get(cookies(req).get('lc_session')??'');
      if(!current&&url.pathname==='/admin'){redirect(res,'/auth/login');return;}owner(current);
      if(req.method!=='GET')throw new HttpError(405,'Bu yöntem desteklenmiyor.');
      const files:Record<string,string>={'/admin':'../../dashboard/admin/index.html','/admin/assets/control.js':'../../dashboard/admin/control.js','/admin/assets/control.css':'../../dashboard/admin/control.css','/admin/assets/charts.js':'../../dashboard/admin/charts.js'};
      const file=files[url.pathname];if(!file)throw new HttpError(404,'Sayfa bulunamadı.');
      const data=await readFile(new URL(file,import.meta.url));res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8');res.end(data);return;
    }
    const font = fonts.find(name => url.pathname === `/${name}`);
    if(req.method==='GET'&&url.pathname==='/web-vitals.js'){const file=await readFile(new URL('../../node_modules/web-vitals/dist/web-vitals.js',import.meta.url));sendAsset(req,res,file,'text/javascript; charset=utf-8');return;}
    const legalPages = new Map([['/terms-of-service','hizmet-kosullari'],['/privacy-policy','gizlilik-politikasi'],['/data-deletion','veri-silme']]);
    if (req.method === 'GET' && legalPages.has(url.pathname)) {
      const data = await readFile(new URL(`../../dashboard/legal/${legalPages.get(url.pathname)}.html`, import.meta.url));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(data); return;
    }
    const featureKey = new Map([['/features/dashboard','dashboard'],['/features/server-checks','server-checks'],['/features/commands','commands']]).get(url.pathname);
    if (req.method === 'GET' && featureKey) {
      const data = await readFile(new URL(`../../dashboard/features/${featureKey}.html`, import.meta.url));
      res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8' });res.end(data);return;
    }
    if (req.method === 'GET' && url.pathname === '/logo.svg') {
      const data = await readFile(new URL('../../dashboard/logo.svg', import.meta.url));
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      sendAsset(req, res, data, 'image/svg+xml'); return;
    }
    if (req.method === 'GET' && (font || ['/','/dashboard','/admin','/app.js','/analytics-client.js','/i18n.js','/styles.css'].includes(url.pathname))) {
      const name = font ?? (url.pathname === '/app.js' ? 'app.js' : url.pathname === '/analytics-client.js' ? 'analytics-client.js' : url.pathname === '/i18n.js' ? 'i18n.js' : url.pathname === '/styles.css' ? 'styles.css' : 'index.html');
      const data = await readFile(new URL(`../../dashboard/${name}`, import.meta.url));
      if (name !== 'index.html') {
        sendAsset(req, res, data, font ? 'font/ttf' : name.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8');
        return;
      }
      res.writeHead(200, { 'Content-Type': font ? 'font/ttf' : name.endsWith('.js') ? 'text/javascript; charset=utf-8' : name.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8' });
      res.end(url.pathname==='/' ? data.toString('utf8').replace('</head>',`<link rel="discord:component-embed" type="application/json" href="${config.origin}/discord-preview.json"></head>`) : data.toString('utf8').replace(/<!--PUBLIC-HOME-->[\s\S]*?<!--\/PUBLIC-HOME-->/,'')); return;
    }
    if (req.method === 'GET' && url.pathname === '/api/public') {
      json(res, 200, { loginConfigured: Boolean(config.clientSecret), clientId: config.clientId, installFlowEnabled:Boolean(config.installFlowEnabled&&observability?.center), supportGuildId: config.supportGuildId ?? null, supportInviteUrl: config.supportInviteUrl ?? null, publicGuilds }); return;
    }
    if (req.method === 'GET' && url.pathname === '/api/public/guilds') {
      const data = await getPublicGuilds();
      if (!data) throw new HttpError(503, 'Sunucu bilgileri şu anda alınamıyor.');
      json(res, 200, data); return;
    }
    const jar = cookies(req);
    if(url.pathname===nativePrefix||url.pathname.startsWith(nativePrefix+'/')){
      const session=sessions.get(jar.get('lc_session')??'');
      if(!session){if(req.method==='GET'&&!url.pathname.includes('/api/')&&!url.pathname.includes('/_next/')&&!/\.[a-z0-9]+$/i.test(url.pathname)){redirect(res,'/auth/login');return;}throw new HttpError(401,'Discord ile giriş yapın.');}
      owner(session);
      if(!nativeAnalytics)throw new HttpError(503,'Analiz servisi henüz hazır değil.');
      await nativeAnalytics.serve(req,res,url,config.origin,url.searchParams.get('lang')==='en'?'en':'tr');return;
    }
    if(url.pathname==='/metrics/collect'){
      if(req.method!=='POST')throw new HttpError(405,'Bu yöntem desteklenmiyor.');
      if(req.headers.origin!==config.origin)throw new HttpError(403,'İstek doğrulanamadı.');
      const key='metrics:'+ip;const rate=rates.get(key)??{count:0,expires:now+60_000};rate.count++;
      if(rate.count>90||(!rates.has(key)&&rates.size>=5000))throw new HttpError(429,'Biraz sonra tekrar dene.');rates.set(key,rate);
      const owner=Boolean(config.ownerId&&sessions.get(jar.get('lc_session')??'')?.user.id===config.ownerId);
      if(!owner&&!ignoreTraffic(req)){
        let event;try{event=parseTrafficEvent(await readBody(req),config.origin);}catch{throw new HttpError(400,'Geçersiz ölçüm.');}
        void analytics.collect(event,ip,req.headers['user-agent']??'',config.origin);
        observability?.center?.store.record({at:now,service:'dashboard',level:'info',code:'product_'+(event.event??'page_view')});
      }
      res.writeHead(204);res.end();return;
    }
    if(req.method==='GET'&&url.pathname==='/auth/install'){
      if(!config.installFlowEnabled||!observability?.center)throw new HttpError(404,'Sayfa bulunamadı.');
      if(!config.clientSecret)throw new HttpError(503,'Kurulum şu anda kullanılamıyor.');
      if(pending.size>=1000||installations.size>=64)throw new HttpError(503,'Biraz sonra tekrar deneyin.');
      const before=new Set(await discord.getBotGuildIds());
      const campaign:Record<string,string>={};for(const key of ['source','medium','campaign']){const value=url.searchParams.get('utm_'+key);if(value&&/^[a-z][a-z0-9_-]{0,63}$/i.test(value)&&! /\d{8,}/.test(value))campaign[key]=value;}
      const state=nonce();pending.set(state,now+600000);installations.set(state,{before,campaign});res.setHeader('Set-Cookie',cookie('lc_oauth',state,600));
      const target=new URL('https://discord.com/oauth2/authorize');target.search=new URLSearchParams({client_id:config.clientId,redirect_uri:config.redirectUri,response_type:'code',scope:'bot applications.commands identify guilds',permissions:'19456',state}).toString();
      const guild=url.searchParams.get('guild');if(guild&&/^\d{17,20}$/.test(guild))target.searchParams.set('guild_id',guild);
      redirect(res,target.href);return;
    }
    if (req.method === 'GET' && url.pathname === '/auth/login') {
      observability?.center?.store.record({at:now,service:'dashboard',level:'info',code:'oauth_started'});
      if (!config.clientSecret) { redirect(res, '/?error=oauth-not-configured'); return; }
      if (pending.size >= 1000) throw new HttpError(503, 'Biraz sonra tekrar deneyin.');
      const state = nonce(); pending.set(state, now + 600_000);
      res.setHeader('Set-Cookie', cookie('lc_oauth', state, 600));
      const target = new URL('https://discord.com/oauth2/authorize');
      target.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri,
        response_type: 'code', scope: 'identify guilds', state }).toString();
      redirect(res, target.href); return;
    }
    if (req.method === 'GET' && url.pathname === '/auth/callback') {
      const state = url.searchParams.get('state') ?? '';
      const browserState = jar.get('lc_oauth') ?? '';
      const expires = pending.get(browserState) ?? 0;
      pending.delete(browserState);const installation=installations.get(browserState);installations.delete(browserState);
      res.setHeader('Set-Cookie', cookie('lc_oauth', '', 0));
      if (!browserState || !same(state, browserState) || expires <= now){observability?.center?.store.record({at:now,service:'dashboard',level:'warning',code:'oauth_state_rejected'});throw new HttpError(400, 'Giriş süresi doldu. Tekrar giriş yapın.');}
      const code = url.searchParams.get('code');
      if (!code || url.searchParams.has('error')) {observability?.center?.store.record({at:now,service:'dashboard',level:'info',code:'oauth_cancelled'});redirect(res, '/?error=login-cancelled'); return; }
      if (sessions.size >= 1000) throw new HttpError(503, 'Biraz sonra tekrar deneyin.');
      const token = await discord.exchangeCode(code);
      const user = await discord.getUser(token.accessToken);
      if(installation){try{const guild=token.installationGuildId;const allowed=guild?(await discord.getGuilds(token.accessToken)).some(item=>item.id===guild&&canManageGuild(item)):false;
       if(guild&&allowed&&!installation.before.has(guild))observability?.center?.store.queueInstall(guild,installation.campaign);
       else observability?.center?.store.record({at:now,service:'dashboard',level:'info',code:'installation_unverified'});
      }catch{observability?.center?.store.record({at:now,service:'dashboard',level:'warning',code:'installation_verification_failed'});}}

      observability?.center?.store.record({at:now,service:'dashboard',level:'info',code:'oauth_completed'});
      if(user.id!==config.ownerId){try{conversions?.record('login_success');}catch{/* Measurement never blocks authentication. */}}
      const id = nonce();
      const age = Math.min(8 * 3600, Math.floor(token.expiresIn));
      sessions.delete(jar.get('lc_session') ?? '');
      sessions.set(id, { user, accessToken: token.accessToken, csrf: nonce(), expires: now + age * 1000,adminIssuedAt:now,adminActiveAt:now });
      res.setHeader('Set-Cookie', [cookie('lc_session', id, age), cookie('lc_oauth', '', 0)]);
      redirect(res, '/dashboard'); return;
    }
    const sessionId = jar.get('lc_session') ?? '';
    const session = sessions.get(sessionId);
    if (req.method === 'GET' && url.pathname === '/api/session') {
      json(res, 200, session ? { authenticated: true, user: session.user, csrf: session.csrf, isOwner: Boolean(config.ownerId && session.user.id === config.ownerId) } : { authenticated: false }); return;
    }
    if (!url.pathname.startsWith('/api/')) throw new HttpError(404, 'Sayfa bulunamadı.');
    if (!session) throw new HttpError(401, 'Discord ile giriş yapın.');
    if(url.pathname.startsWith('/api/admin/'))owner(session);
    if (req.method !== 'GET') {
      const csrf = req.headers['x-csrf-token'];
      if (req.headers.origin !== config.origin || typeof csrf !== 'string' || !same(csrf, session.csrf)) {
        throw new HttpError(403, 'İstek doğrulanamadı. Sayfayı yenileyin.');
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/logout') {
      sessions.delete(sessionId); res.setHeader('Set-Cookie', cookie('lc_session', '', 0)); json(res, 200, { ok: true }); return;
    }
    if(url.pathname==='/api/admin/activity'){
      if(req.method!=='POST')throw new HttpError(405,'Bu yöntem desteklenmiyor.');session.adminActiveAt=Date.now();json(res,200,{ok:true});return;
    }
    if(url.pathname.startsWith('/api/admin/control/')){
      const center=observability?.center;if(!center)throw new HttpError(503,'Control Center yapılandırılmadı.');
      const range=url.searchParams.get('range')??'1h';if(!isRestWindow(range))throw new HttpError(400,'Geçersiz metrik aralığı.');
      const action=url.pathname.slice('/api/admin/control/'.length);
      if(action==='overview'&&req.method==='GET'){json(res,200,await center.snapshot(range));return;}
      if(action==='events'&&req.method==='GET'){
        const before=Number(url.searchParams.get('before')??Number.MAX_SAFE_INTEGER);if(!Number.isSafeInteger(before)||before<0)throw new HttpError(400,'Geçersiz cursor.');
        const service=url.searchParams.get('service')??'';const level=url.searchParams.get('level')??'';
        if(service&&!['bot','dashboard','observer'].includes(service)||level&&!['info','warning','error','critical'].includes(level))throw new HttpError(400,'Geçersiz filtre.');
        const code=url.searchParams.get('code')??'';const traceId=url.searchParams.get('traceId')??'';
        if(code&&!/^\w{1,64}$/.test(code)||traceId&&!/^[\w-]{1,64}$/.test(traceId))throw new HttpError(400,'Geçersiz arama.');
        json(res,200,{events:center.store.events({before,...(service?{service}:{}),...(level?{level}:{}),...(code?{code}:{}),...(traceId?{traceId}:{})}),groups:center.store.groups()});return;
      }
      if(action==='history'&&req.method==='GET'){
        const service=url.searchParams.get('service')??'dashboard';const kind=url.searchParams.get('kind')??'rest';
        if(!['dashboard','bot','observer'].includes(service)||!['rest','host','runtime','api'].includes(kind))throw new HttpError(400,'Geçersiz geçmiş.');
        json(res,200,{history:center.store.history(service as 'dashboard'|'bot'|'observer',kind,Date.now()-({'15m':900000,'1h':3600000,'24h':86400000,'7d':604800000,'30d':2592000000}[range]),Date.now())});return;
      }
      if(action==='daily'&&req.method==='GET'){const now=Date.now();const days=range==='30d'?30:range==='7d'?7:1;json(res,200,{timezone:'UTC',days,counts:center.store.counts(new Date(now-(days-1)*86400000).toISOString().slice(0,10),new Date(now).toISOString().slice(0,10)),coverageStart:center.store.startedAt});return;}
      if(action==='settings'&&req.method==='GET'){json(res,200,{alerts:center.store.getConfig('alerts',{cpuPercent:85,memoryPercent:90,diskPercent:85,holdSeconds:120,cooldownSeconds:900}),retention:{detailDays:30,errorDays:30,auditDays:90,aggregateDays:366},operations:'read-only'});return;}
      if(action==='thresholds'&&req.method==='PUT'){
        let settings;try{settings=parseAlertSettings(await readBody(req));}catch{throw new HttpError(400,'Geçersiz eşik.');}
        center.store.setConfig('alerts',settings,session.user.id);center.invalidate();json(res,200,{ok:true});return;
      }
      if(action==='review'&&req.method==='POST'){
        const body=await readBody(req);if(!body||typeof body!=='object'||!('id'in body)||typeof body.id!=='number'||!Number.isSafeInteger(body.id)||body.id<1)throw new HttpError(400,'Geçersiz kayıt.');
        if(!center.store.review(body.id,session.user.id))throw new HttpError(404,'Kayıt bulunamadı.');center.invalidate();json(res,200,{ok:true});return;
      }
      if(action==='mute'&&req.method==='POST'){
        const body=await readBody(req);try{if(!body||typeof body!=='object'||!('code'in body)||typeof body.code!=='string')throw new Error();center.alarms.mute(body.code,Date.now()+3600000,session.user.id);}catch{throw new HttpError(400,'Geçersiz alarm.');}center.invalidate();json(res,200,{ok:true});return;
      }
      if(action==='stream'&&req.method==='GET'){
        if(req.headers.origin&&req.headers.origin!==config.origin)throw new HttpError(403,'İstek doğrulanamadı.');
        if(streams.size>=2)throw new HttpError(429,'En fazla iki canlı panel açılabilir.');
        res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','X-Accel-Buffering':'no'});res.write('retry: 5000\n\n');streams.add(res);
        let busy=false;let timer:ReturnType<typeof setInterval>;let closed=false;
        const close=()=>{if(closed)return;closed=true;clearInterval(timer);streams.delete(res);res.end();};
        const tick=async()=>{if(busy||closed||res.writableEnded||res.destroyed)return;try{owner(sessions.get(sessionId));if(res.writableLength>128000){close();return;}busy=true;const data=await center.snapshot(range);if(!closed&&!res.writableEnded&&!res.destroyed){owner(sessions.get(sessionId));res.write(`event: snapshot\ndata: ${JSON.stringify(data)}\n\n`);}}catch{close();}finally{busy=false;}};
        timer=setInterval(()=>{void tick();},5000);timer.unref();req.once('close',close);void tick();return;
      }
      throw new HttpError(405,'Bu yöntem desteklenmiyor.');
    }
    if(url.pathname==='/api/admin/analytics'){
      if(!config.ownerId||session.user.id!==config.ownerId)throw new HttpError(403,'Bu alan yalnızca bot sahibine açık.');
      if(req.method!=='GET')throw new HttpError(405,'Bu yöntem desteklenmiyor.');
      let range;try{range=analyticsRange(url.searchParams);}catch{throw new HttpError(400,'Geçersiz tarih aralığı. En fazla 366 gün seç.');}
      const report=await analytics.report(range);
      let events;try{events=conversions?.stats(range.startDate,range.endDate);}catch{/* Independent analytics failure. */}
      json(res,200,{...report,...(events?{conversions:events}:{})});return;
    }
    if(url.pathname==='/api/admin/operations'){
      if(!config.ownerId||session.user.id!==config.ownerId)throw new HttpError(403,'Bu alan yalnızca bot sahibine açık.');
      if(req.method!=='GET')throw new HttpError(405,'Bu yöntem desteklenmiyor.');
      const range=url.searchParams.get('range')??'1h';
      if(!isRestWindow(range))throw new HttpError(400,'Geçersiz metrik aralığı.');
      const observation=observability;
      json(res,200,{schemaVersion:1,scope:'dashboard-process',sampledAt:Date.now(),
        discordRest:observation?.rest.snapshot(range)??null,startup:observation?.startup?.snapshot()??null,
        bot:null,botStatus:'not-connected'});return;
    }
    if (url.pathname === '/api/admin/beta') {
      if (!config.ownerId || session.user.id !== config.ownerId) throw new HttpError(403, 'Bu alan yalnızca bot sahibine açık.');
      if (req.method === 'GET') { json(res,200,store.getBetaPolicy()); return; }
      if (req.method === 'PUT') {
        const body = await readBody(req);
        let policy;
        try { policy = parseBetaPolicy(body); } catch { throw new HttpError(400,'Geçersiz beta ayarları. En fazla 100 geçerli sunucu ID gir.'); }
        let updated;try{updated=store.setBetaPolicy(policy,session.user.id);}catch(error){observability?.center?.store.audit(session.user.id,'beta_policy_change','failed');throw error;}
        observability?.center?.store.audit(session.user.id,'beta_policy_change');
        json(res,200,updated); return;
      }
      throw new HttpError(405,'Bu yöntem desteklenmiyor.');
    }
    if (req.method === 'GET' && url.pathname === '/api/guilds') {
      const [botIds, userGuilds] = await Promise.all([
        discord.getBotGuildIds(), discord.getGuilds(session.accessToken)
      ]);
      const botGuilds = new Set(botIds);
      const policy = store.getBetaPolicy();
      const allowedGuilds = new Set(policy.guildIds);
      const guilds = userGuilds.filter(canManageGuild)
        .map(({ id, name, icon }) => ({ id, name, icon, botPresent: botGuilds.has(id), betaAllowed: !policy.enabled || allowedGuilds.has(id) }));
      json(res, 200, { guilds }); return;
    }
    const match = /^\/api\/guilds\/(\d{17,20})(\/settings|\/reset)?$/.exec(url.pathname);
    const id = match?.[1];
    if (!id) throw new HttpError(404, 'İşlem bulunamadı.');
    // Re-check Discord permissions on every read and write, including revoked access.
    const guilds = await discord.getGuilds(session.accessToken);
    if (!guilds.some(guild => guild.id === id && canManageGuild(guild))) throw new HttpError(403, 'Bu sunucuyu yönetme yetkin yok.');
    if (!store.betaAllows(id)) throw new HttpError(403,'Bu sunucu kapalı beta listesinde değil.');
    const guild = await discord.getGuild(id);
    if (!guild) throw new HttpError(409, 'LabCafe bu sunucuda bulunmuyor. Önce botu sunucuya ekle.');
    if (req.method === 'GET' && !match?.[2]) {
      const settings = store.get(id);
      const channelValid = !settings.commandChannelId || guild.channels.some(channel => channel.id === settings.commandChannelId);
      const canSend = settings.commandChannelId && channelValid ? await discord.canUseChannel(id, settings.commandChannelId) : null;
      json(res, 200, { guild, settings, commands, history:store.history(id), analysis: analyze(guild,settings,commands.length,canSend) }); return;
    }
    if (req.method === 'PATCH' && match?.[2] === '/settings') {
      const settings = parseSettings(await readBody(req));
      if (settings.commandChannelId && (!guild.channels.some(channel => channel.id === settings.commandChannelId)
        || !await discord.canUseChannel(id, settings.commandChannelId))) {
        throw new HttpError(400, 'Botun görebildiği ve embed gönderebildiği bir metin kanalı seç.');
      }
      let expected: GuildSettings | undefined;
      if (req.headers['x-settings-base']) {
        try { expected=parseSettings(JSON.parse(String(req.headers['x-settings-base'])) as unknown); } catch { throw new HttpError(400,'Geçersiz ayar sürümü.'); }
      }
      try { json(res, 200, { settings: store.update(id, settings, session.user.id, expected), history:store.history(id), analysis:analyze(guild,settings,commands.length,settings.commandChannelId?true:null) }); }
      catch (error) { if (error instanceof Error && error.message==='SETTINGS_CONFLICT') throw new HttpError(409,'Ayarlar başka bir yönetici tarafından değiştirildi. Güncel ayarları açıp tekrar dene.'); throw error; }
      return;
    }
    if (req.method === 'POST' && match?.[2] === '/reset') {
      json(res, 200, { settings: store.reset(id, session.user.id), history:store.history(id), analysis:analyze(guild,store.get(id),commands.length,null) }); return;
    }
    throw new HttpError(405, 'Bu yöntem desteklenmiyor.');
  }
  const server = createServer((req, res) => {
    const requestStarted=performance.now();
    if((req.url??'').startsWith('/api/')&&!(req.url??'').startsWith('/api/admin/control/stream'))res.once('finish',()=>{try{observability?.center?.http?.attempt('other',performance.now()-requestStarted,res.statusCode);}catch{}});
    void handle(req, res).catch(error => {
      if (res.headersSent) { res.end(); return; }
      const known=error instanceof HttpError || error instanceof DiscordUserRequestError;
      const status=known ? error.status : 502;
      const errorId=randomBytes(6).toString('hex');
      observability?.center?.store.record({at:Date.now(),service:'dashboard',level:status>=500?'error':'warning',code:(req.url??'').startsWith('/auth/callback')?'oauth_failed':status>=500?'request_failed':'request_rejected',traceId:errorId});
      const message=known ? error.message : 'İşlem tamamlanamadı. Biraz sonra tekrar dene.';
      if (!(error instanceof HttpError)) console.error(JSON.stringify({event:'dashboard_request_failed',errorId,error:safeErrorName(error),status,source:error instanceof DiscordUserRequestError?'discord-user-api':'dashboard'}));
      if(status===429)res.setHeader('Retry-After','10');
      if (!(req.url ?? '').startsWith('/api/')) {
        res.writeHead(status,{'Content-Type':'text/html; charset=utf-8'});
        res.end(errorPage(status,message,status>=500?errorId:undefined));
      } else json(res,status,{error:message,...(status>=500?{errorId}:{})});
    });
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.once('close',()=>{for(const stream of streams)stream.end();streams.clear();});
  if (preloadPublicGuilds) server.once('listening', () => { void getPublicGuilds(); });
  return Object.assign(server,{stopStreams(){for(const stream of streams)stream.end();streams.clear();}});
}

