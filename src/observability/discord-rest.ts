import { performance } from 'node:perf_hooks';
import { DefaultRestOptions, RESTEvents, type REST, type RESTOptions } from 'discord.js';
import { DiscordRestMetrics, type RestCategory, type NetworkFailure } from './discord-metrics.js';

/** Classification discards all IDs, credentials and query strings immediately. */
export function restCategory(url:string,auth:'bot'|'oauth'='bot'):RestCategory {
  let path:string;try{path=new URL(url).pathname.replace(/^\/api(?:\/v\d+)?/,'');}catch{return 'other';}
  if(/^\/oauth2\/token\/?$/.test(path))return 'oauth_token';
  if(/^\/users\/@me(?:\/guilds)?\/?$/.test(path))return auth==='oauth'?'oauth_user':'identity_read';
  if(/^\/applications\/[^/]+\/(?:guilds\/[^/]+\/)?commands(?:\/|$)/.test(path))return 'command_sync';
  if(/^\/(?:interactions|webhooks)\//.test(path))return 'interaction_response';
  if(/^\/channels\//.test(path)||/^\/guilds\/[^/]+\/channels(?:\/|$)/.test(path))return 'channel_read';
  if(/^\/guilds\//.test(path))return 'guild_read';
  return 'other';
}
function failureKind(error:unknown):NetworkFailure {
  const name=error instanceof Error?error.name:'';
  return name==='TimeoutError'?'timeout':name==='AbortError'?'aborted':'network';
}
/** Uses the SDK's public transport hook without replacing its queue, timeout or retry policy. */
export function measuredRestTransport(metrics:DiscordRestMetrics,transport:RESTOptions['makeRequest']=DefaultRestOptions.makeRequest,clock:()=>number=()=>performance.now()):RESTOptions['makeRequest'] {
  return async(url,init)=>{
    const started=clock();const category=restCategory(url);
    try{
      const response=await transport(url,init);
      try{metrics.attempt(category,clock()-started,response.status);}catch{/* Telemetry must not change the response. */}
      return response;
    }catch(error){
      try{metrics.attempt(category,clock()-started,null,failureKind(error));}catch{/* Preserve original error identity. */}
      throw error;
    }
  };
}
const attached=new WeakMap<REST,()=>void>();
export function observeRateLimits(rest:REST,metrics:DiscordRestMetrics):()=>void {
  const existing=attached.get(rest);if(existing)return existing;
  const listener=(data:{global:boolean;retryAfter:number})=>{
    try{metrics.rateLimited(data.global,data.retryAfter);}catch{/* Never interfere with the SDK limiter. */}
  };
  rest.on(RESTEvents.RateLimited,listener);
  let disposed=false;
  const dispose=()=>{if(disposed)return;disposed=true;rest.off(RESTEvents.RateLimited,listener);attached.delete(rest);};
  attached.set(rest,dispose);return dispose;
}
/** OAuth fetch is a separate authentication/traffic domain from bot-token REST. */
export function measuredFetch(metrics:DiscordRestMetrics,transport:typeof fetch=fetch):typeof fetch {
  return async(input,init)=>{
    const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
    const started=performance.now();const category=restCategory(url,'oauth');
    try{
      const response=await transport(input,init);
      try{metrics.attempt(category,performance.now()-started,response.status);}catch{}
      return response;
    }catch(error){
      try{metrics.attempt(category,performance.now()-started,null,failureKind(error));}catch{}
      throw error;
    }
  };
}
