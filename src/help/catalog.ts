import { PermissionFlagsBits, type Interaction } from 'discord.js';
import type { BotCommand } from '../commands/index.js';
import type { GuildSettingsStore } from '../config/settings.js';
import { accessAllows } from './access-store.js';

export type HelpLanguage = 'tr' | 'en';
export const words = (language:HelpLanguage,tr:string,en:string) => language==='en'?en:tr;
export const PAGE_SIZE = 8;
export function languageFor(interaction:Interaction,store:GuildSettingsStore):HelpLanguage {
  return interaction.guildId?store.get(interaction.guildId).locale:interaction.locale.startsWith('en')?'en':'tr';
}
export function canManage(interaction:Interaction):boolean {
  return Boolean(interaction.guildId && interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild));
}
export function availableCommands(commands:readonly BotCommand[],interaction:Interaction,store:GuildSettingsStore):BotCommand[] {
  if(interaction.guildId && !store.betaAllows(interaction.guildId))return [];
  const member=interaction.member;
  const roles=interaction.guildId?[interaction.guildId,...(member?(Array.isArray(member.roles)?member.roles:[...member.roles.cache.keys()]):[])]:[];
  return commands.filter(command=>{
    const data=command.data.toJSON();
    if(data.default_member_permissions==='0')return Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.Administrator));
    if(data.default_member_permissions && !interaction.memberPermissions?.has(BigInt(data.default_member_permissions)))return false;
    if(!interaction.guildId || canManage(interaction) || command.data.name==='ayarlar')return true;
    return accessAllows(store.getCommandAccess(interaction.guildId,command.data.name),roles,interaction.channelId,interaction.channel?.isThread()?interaction.channel.parentId:null);
  }).sort((a,b)=>a.data.name.localeCompare(b.data.name));
}
export function searchCommands(commands:readonly BotCommand[],query:string):BotCommand[] {
  const normalize=(value:string)=>value.normalize('NFKC').toLocaleLowerCase('tr').replaceAll('ı','i').replace(/^\//,'').trim();
  const term=normalize(query.slice(0,50));
  return commands.filter(command=>!term || normalize([command.data.name,command.data.toJSON().description,...command.help?.keywords??[]].join(' ')).includes(term));
}
