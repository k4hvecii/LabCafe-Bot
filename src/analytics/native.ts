import type { IncomingMessage, ServerResponse } from 'node:http';
import {randomBytes} from 'node:crypto';
import type { AnalyticsConfig } from './service.js';

export const nativePrefix='/admin/analytics';
const uuid='[a-f0-9-]{36}';
export function nativeApiAllowed(path:string,method:string,websiteId:string):boolean {
 if(path.includes('..')||/%|\\/.test(path)||/\/(shares?|api-keys|password|2fa|reset|transfer)(\/|$)/.test(path))return false;
 if(path==='/api/auth/verify')return method==='POST';
 if(path==='/api/realtime/'+websiteId)return method==='GET';
 if(['/api/config','/api/me','/api/me/websites','/api/me/teams','/api/websites'].includes(path))return method==='GET';
 if(path==='/api/dashboard')return ['GET','POST'].includes(method);
 if(new RegExp('^/api/boards(?:/'+uuid+'(?:/clone)?)?$','i').test(path))return ['GET','POST','PUT','DELETE'].includes(method);
 // A normal service account owns only this website. Website settings and deletion stay unavailable.
 const base='/api/websites/'+websiteId;
 if(path===base)return method==='GET';
 if(!path.startsWith(base+'/'))return false;
 const report=path.slice(base.length+1);
 if(method==='GET')return !/^(shares|replays|heatmaps)(\/|$)/.test(report);
 return ['POST','PUT','DELETE'].includes(method)&&new RegExp('^(goals|funnels|segments|cohorts|annotations)(/'+uuid+')?(?:/stats)?$','i').test(report);
}
export function nativeBootstrap(locale:'tr'|'en',forceLocale=false):string {
 return `(()=>{
 localStorage.setItem('umami.auth',JSON.stringify('labcafe-owner-session'));
 localStorage.setItem('umami.theme',JSON.stringify('dark'));
 if(${forceLocale}||!localStorage.getItem('umami.locale'))localStorage.setItem('umami.locale',JSON.stringify('${locale==='en'?'en-US':'tr-TR'}'));
 localStorage.setItem('umami.timezone',JSON.stringify('Europe/Istanbul'));
 let activityAt=0;for(const name of ['pointerdown','keydown'])document.addEventListener(name,()=>{if(Date.now()-activityAt<30000)return;activityAt=Date.now();void fetch('/api/session').then(r=>r.json()).then(s=>fetch('/api/admin/activity',{method:'POST',headers:{'x-csrf-token':s.csrf}})).then(r=>{if(r.status===401)location.assign('/auth/login');}).catch(()=>{});},{passive:true});
 const en=JSON.parse(localStorage.getItem('umami.locale')||'""').startsWith('en');
 const tidy=()=>{for(const item of document.querySelectorAll('[role=button],[role=menuitem],button,a')){const label=item.textContent.trim();const href=item.getAttribute('href')||'';if(['Bağlantılar','Pikseller','Links','Pixels','Ayarlar','Settings','Tema','Theme'].includes(label)||href.split('/').some(part=>['replays','heatmaps','revenue'].includes(part.split('?')[0]))){if(!item.hidden){item.hidden=true;item.style.display='none';}}}};
 const mount=()=>{if(!document.querySelector('h2'))return;observer.disconnect();const setTitle=()=>{const title=en?'LabCafe — Analytics':'LabCafe — Site Analizi';if(document.title!==title)document.title=title;};setTitle();new MutationObserver(setTitle).observe(document.head,{childList:true,subtree:true,characterData:true});if(document.querySelector('#labcafe-return'))return;const link=document.createElement('a');link.id='labcafe-return';link.href='/admin';link.textContent=en?'← LabCafe management':'← LabCafe Yönetimi';link.style.cssText='position:fixed;bottom:16px;right:20px;z-index:90;padding:10px 16px;border:1px solid #7d6242;border-radius:10px;background:#30271e;color:#f0dec2;font:13px system-ui;text-decoration:none';document.body.append(link);tidy();new MutationObserver(tidy).observe(document.body,{childList:true,subtree:true});};
 const observer=new MutationObserver(mount);document.addEventListener('DOMContentLoaded',()=>{observer.observe(document.body,{childList:true,subtree:true});mount();});
 document.addEventListener('click',event=>{const item=event.target instanceof Element?event.target.closest('[role="menuitem"],button,a'):null;if(!item||! /^(çıkış(?: yap)?|log ?out|sign out)$/i.test(item.textContent.trim()))return;event.preventDefault();event.stopImmediatePropagation();void fetch('/api/session').then(r=>r.json()).then(s=>fetch('/api/logout',{method:'POST',headers:{'x-csrf-token':s.csrf}})).then(r=>{if(r.ok)location.assign('/');});},true);
})();`;
}

export class NativeAnalytics {
 private token='';private until=0;private pending:Promise<void>|undefined;private active=0;
 constructor(private config:AnalyticsConfig,private frontend:string,private request:typeof fetch=fetch,private boardId?:string){
  const url=new URL(frontend);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.pathname!=='/'||url.username||url.password||url.search||url.hash)throw new Error('Native analytics must use loopback');
  this.frontend=url.origin;
  if(boardId&&!new RegExp('^'+uuid+'$','i').test(boardId))throw new Error('Invalid analytics board');
 }
 private async login(){
  if(Date.now()<this.until)return;
  this.pending??=(async()=>{
   const res=await this.request(this.config.url+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:this.config.username,password:this.config.password}),signal:AbortSignal.timeout(4000)});
   if(!res.ok)throw new Error('Analytics unavailable');
   const data:unknown=await res.json();if(!data||typeof data!=='object'||!('token'in data)||typeof data.token!=='string')throw new Error('Analytics unavailable');
   this.token=data.token;this.until=Date.now()+10*60_000;
  })();try{await this.pending;}finally{this.pending=undefined;}
 }
 async serve(req:IncomingMessage,res:ServerResponse,url:URL,origin:string,locale:'tr'|'en'){
  const method=req.method??'GET';const suffix=url.pathname.slice(nativePrefix.length);
  if(this.active>=40){res.writeHead(503);res.end('Analytics busy');return;}
  if(!suffix||suffix==='/login'||suffix==='/'){
   res.writeHead(302,{Location:nativePrefix+(this.boardId?'/boards/'+this.boardId:'/websites/'+this.config.websiteId)+url.search});res.end();return;
  }
  if(suffix==='/_bridge.js'){
   res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});res.end(nativeBootstrap(locale,url.searchParams.get('force')==='1'));return;
  }
  if(/%|\\/.test(url.pathname)||suffix.includes('..')){res.writeHead(400);res.end();return;}
  const api=suffix.startsWith('/api/');
  if(api&&!nativeApiAllowed(suffix,method,this.config.websiteId)){res.writeHead(403);res.end('This operation is not available in LabCafe analytics.');return;}
  if(!api&&!['GET','HEAD'].includes(method)){res.writeHead(405);res.end();return;}
  if(!['GET','HEAD'].includes(method)&&req.headers.origin!==origin){res.writeHead(403);res.end();return;}
  let body:Buffer|undefined;
  if(!['GET','HEAD'].includes(method)){let size=0;const chunks:Buffer[]=[];for await(const chunk of req){const part=Buffer.from(chunk);size+=part.length;if(size>262144){res.writeHead(413);res.end();return;}chunks.push(part);}body=Buffer.concat(chunks);}
  this.active++;
  try{
   const headers:Record<string,string>={'Accept':String(req.headers.accept??'*/*')};
   // Only Next navigation metadata is forwarded; never cookies, client Authorization or proxy IP headers.
   for(const key of ['content-type','rsc','next-router-state-tree','next-router-prefetch','next-url']){const value=req.headers[key];if(typeof value==='string')headers[key]=value;}
   // The native UI reports on the public site only; loopback QA records stay outside production reports.
   const search=new URLSearchParams(url.search);
   if(api&&(suffix.startsWith('/api/websites/'+this.config.websiteId+'/')||suffix==='/api/realtime/'+this.config.websiteId)){search.set('hostname','eq.labcafe.xyz');search.set('match','all');}
   const target=api?this.config.url+suffix+(search.size?'?'+search:''):this.frontend+url.pathname+url.search;
   const execute=async()=>{if(api){await this.login();headers.Authorization='Bearer '+this.token;}return this.request(target,{method,headers,...(body?.length?{body:new Uint8Array(body)}:{}),redirect:'manual',signal:AbortSignal.timeout(15000)});};
   let upstream=await execute();if(api&&upstream.status===401){this.until=0;upstream=await execute();}
   if(upstream.status>=300&&upstream.status<400){const location=upstream.headers.get('location')??'';if(!location.startsWith(nativePrefix+'/'))throw new Error('Unexpected redirect');res.writeHead(upstream.status,{Location:location});res.end();return;}
   const type=upstream.headers.get('content-type')??'application/octet-stream';
   const bytes=Buffer.from(await upstream.arrayBuffer());if(bytes.length>16*1024*1024)throw new Error('Oversized analytics response');
   res.setHeader('Content-Type',type);
   const nonce=randomBytes(24).toString('base64');
   if(type.includes('text/html'))res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`);
   res.writeHead(upstream.status);
   res.end(type.includes('text/html')?bytes.toString().replace('<head>',`<head><script src="${nativePrefix}/_bridge.js?lang=${locale}&amp;force=${url.searchParams.has('lang')?'1':'0'}"></script>`).replace(/<script(?=[ >])/g,`<script nonce="${nonce}"`):bytes);
  }catch{if(!res.headersSent)res.writeHead(503,{'Content-Type':'text/plain; charset=utf-8'});res.end(locale==='en'?'Analytics temporarily unavailable.':'Analiz servisine şu anda erişilemiyor.');}
  finally{this.active--;}
 }
}

