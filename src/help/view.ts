import {ActionRowBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder,StringSelectMenuBuilder,escapeMarkdown} from 'discord.js';
import type {BotCommand} from '../commands/index.js';
import {PAGE_SIZE,words,type HelpLanguage} from './catalog.js';

export interface HelpState { query:string; category:'all'|'general'|'management'; page:number; command:string|null }
export const freshState=():HelpState=>({query:'',category:'all',page:0,command:null});
export function renderHelp(token:string,state:HelpState,commands:readonly BotCommand[],language:HelpLanguage,manager:boolean){
  const text=(tr:string,en:string)=>words(language,tr,en);
  const safe=(value:string,max:number)=>escapeMarkdown(value.slice(0,max));
  const filtered=commands.filter(command=>state.category==='all'||(command.help?.category??'general')===state.category);
  const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  state.page=Math.max(0,Math.min(pages-1,Number.isSafeInteger(state.page)?state.page:0));
  const selection=commands.find(command=>command.data.name===state.command);
  if(!selection)state.command=null;
  const entries=filtered.slice(state.page*PAGE_SIZE,(state.page+1)*PAGE_SIZE);
  const embed=new EmbedBuilder().setColor(0x956b46).setTitle(text('Komut rehberi','Command guide'));
  if(selection){
    const data=selection.data.toJSON();
    const description=language==='en'?(data.description_localizations?.['en-US']??data.description):data.description;
    embed.setTitle('/'+selection.data.name).setDescription(safe(description,1500));
    embed.addFields({name:text('Kullanım','Usage'),value:safe(selection.help?.usage??'/'+selection.data.name,500)});
    const options=data.options?.slice(0,10).map(option=>`${safe(option.name,32)} — ${safe(option.description,100)}`).join('\n');
    if(options)embed.addFields({name:text('Parametreler','Parameters'),value:options.slice(0,1024)});
  }else{
    embed.setDescription(entries.map(command=>{
      const data=command.data.toJSON();const description=language==='en'?(data.description_localizations?.['en-US']??data.description):data.description;
      return `**/${safe(command.data.name,32)}**\n${safe(description,180)}`;
    }).join('\n\n')||text('Bu görünümde komut bulunamadı.','No commands match this view.'));
  }
  embed.setFooter({text:`${state.page+1} / ${pages}`});
  const category=new StringSelectMenuBuilder().setCustomId(`lc.help:${token}:category`).setPlaceholder(text('Kategori','Category')).addOptions(
    {label:text('Tümü','All'),value:'all',default:state.category==='all'},
    {label:text('Genel','General'),value:'general',default:state.category==='general'},
    {label:text('Yönetim','Management'),value:'management',default:state.category==='management'});
  const components:Array<ActionRowBuilder<StringSelectMenuBuilder>|ActionRowBuilder<ButtonBuilder>>=[new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(category)];
  if(entries.length)components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(`lc.help:${token}:command`).setPlaceholder(text('Komut ayrıntısı','Command details')).addOptions(entries.map(command=>({label:'/'+command.data.name,value:command.data.name})))));
  const button=(action:string,label:string,disabled=false)=>new ButtonBuilder().setCustomId(`lc.help:${token}:${action}`).setLabel(label).setStyle(ButtonStyle.Secondary).setDisabled(disabled);
  const buttons=[button('back',text('Önceki','Previous'),state.page===0),button('next',text('Sonraki','Next'),state.page===pages-1),button('search',text('Ara','Search')),button('home',text('Liste','List'))];
  if(manager&&selection)buttons.push(button('edit',text('Erişimi düzenle','Edit access')));
  components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons));
  return {embeds:[embed],components,allowedMentions:{parse:[] as []}};
}
