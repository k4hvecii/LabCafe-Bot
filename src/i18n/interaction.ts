import type { Interaction } from 'discord.js';
import type { GuildSettingsStore } from '../config/settings.js';
import { translate, type Language } from './catalog.js';
const fields = new Set(['content','description','label','title','placeholder','name']);
export function localizePayload(value:unknown,language:Language,key=''):unknown {
 if(language==='tr')return value;
 if(typeof value==='string')return fields.has(key)?translate(value,language):value;
 if(Array.isArray(value))return value.map(item=>localizePayload(item,language,key));
 if(value && typeof value==='object'){
  if('toJSON' in value && typeof value.toJSON==='function')return localizePayload(value.toJSON(),language,key);
  return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,localizePayload(v,language,k)]));
 }
 return value;
}
// The boundary only translates outgoing display fields, never IDs, URLs, permissions or selections.
export function localizedInteraction<T extends Interaction>(interaction:T,store:GuildSettingsStore):T {
 const outgoing=new Set(['reply','editReply','followUp','update','showModal','respond']);
 return new Proxy(interaction,{get(target,key){
  const value=Reflect.get(target,key,target) as unknown;
  if(typeof value!=='function')return value;
  if(key==='fetchReply')return async (...args:unknown[])=>{
    const message=await Reflect.apply(value,target,args) as object;
    return new Proxy(message,{get(original,property){const method=Reflect.get(original,property,original) as unknown;
      if(typeof method!=='function')return method;
      if(property==='edit')return (payload:unknown)=>Reflect.apply(method,original,[localizePayload(payload,target.guildId?store.get(target.guildId).locale:'tr')]);
      return method.bind(original);
    }});
  };
  if(typeof key==='string'&&outgoing.has(key))return (payload:unknown)=>{
    const language=target.guildId?store.get(target.guildId).locale:target.locale.startsWith('en')?'en':'tr';
    return Reflect.apply(value,target,[typeof payload==='string'?translate(payload,language):localizePayload(payload,language)]);
  };
  return value.bind(target);
 }});
}
