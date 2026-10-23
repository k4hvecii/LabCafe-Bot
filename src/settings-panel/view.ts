import {ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, MessageFlags, StringSelectMenuBuilder, StringSelectMenuOptionBuilder} from 'discord.js';
import type {GuildSettings} from '../config/settings.js';
import {labCafeCard} from '../ui/cards.js';

export type Phase = 'edit' | 'save' | 'reset' | 'conflict' | 'closed';
export interface PanelState {baseline:GuildSettings; draft:GuildSettings; phase:Phase; revision:number}
export const words=(en:boolean,tr:string,english:string)=>en?english:tr;
export const sameSettings=(a:GuildSettings,b:GuildSettings)=>a.locale===b.locale&&a.ephemeralReplies===b.ephemeralReplies&&a.commandChannelId===b.commandChannelId;
function values(s:GuildSettings,en:boolean){
 return [s.locale==='en'?'English':'Türkçe',s.ephemeralReplies?words(en,'Gizli','Private'):words(en,'Herkese açık','Public'),s.commandChannelId?`<#${s.commandChannelId}>`:words(en,'Tüm kanallar','All channels')];
}
export function renderSettingsPanel(token:string,state:PanelState,notice=''){
 const en=state.baseline.locale==='en';const t=(tr:string,english:string)=>words(en,tr,english);
 const id=(action:string)=>`lc.settings:${token}:${state.revision}:${action}`;
 const current=values(state.draft,en);
 let body=`${t('Dil','Language')}: **${current[0]}**\n${t('Komut yanıtları','Command replies')}: **${current[1]}**\n${t('Komut kanalı','Command channel')}: ${current[2]}`;
 if(state.phase==='save'||state.phase==='reset'){
  const before=values(state.baseline,en);
  const labels=[t('Dil','Language'),t('Yanıtlar','Replies'),t('Kanal','Channel')];
  body=t('Değişiklikleri onayla','Confirm changes')+'\n\n'+current.map((v,i)=>v===before[i]?null:`${labels[i]}: ${before[i]} → **${v}**`).filter(Boolean).join('\n');
  if(sameSettings(state.baseline,state.draft))body=t('Ayarlar zaten varsayılan.','Settings are already at defaults.');
  if(state.phase==='reset')body=t('Varsayılan ayarlara dönülsün mü?','Restore default settings?')+'\n\n'+body;
 }
 if(state.phase==='conflict')body=t('Ayarlar başka bir yerde değiştirildi. Güncel değerleri yükle.','Settings changed elsewhere. Reload the latest values.');
 if(state.phase==='closed')body=t('Panel kapatıldı.','Panel closed.');
 if(state.phase==='edit'&&!sameSettings(state.baseline,state.draft))body+='\n\n'+t('Kaydedilmemiş değişiklikler','Unsaved changes');
 if(notice)body+='\n\n'+notice;
 const card=labCafeCard('primary',t('Ayarlar','Settings'),body);
 const button=(action:string,label:string)=>new ButtonBuilder().setCustomId(id(action)).setStyle(ButtonStyle.Secondary).setLabel(label);
 if(state.phase==='edit'){
  const language=new StringSelectMenuBuilder().setCustomId(id('locale')).setPlaceholder(t('Dil','Language')).addOptions(
   new StringSelectMenuOptionBuilder().setLabel('Türkçe').setValue('tr').setDefault(state.draft.locale==='tr'),
   new StringSelectMenuOptionBuilder().setLabel('English').setValue('en').setDefault(state.draft.locale==='en'));
  const visibility=new StringSelectMenuBuilder().setCustomId(id('visibility')).setPlaceholder(t('Yanıt görünürlüğü','Reply visibility')).addOptions(
   new StringSelectMenuOptionBuilder().setLabel(t('Gizli','Private')).setValue('private').setDefault(state.draft.ephemeralReplies),
   new StringSelectMenuOptionBuilder().setLabel(t('Herkese açık','Public')).setValue('public').setDefault(!state.draft.ephemeralReplies));
  const channel=new ChannelSelectMenuBuilder().setCustomId(id('channel')).setPlaceholder(t('Komut kanalı · boş seçim: tüm kanallar','Command channel · clear selection: all channels')).setChannelTypes(ChannelType.GuildText).setMinValues(0).setMaxValues(1);
  if(state.draft.commandChannelId)channel.setDefaultChannels(state.draft.commandChannelId);
  card.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(language));
  card.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(visibility));
  card.addActionRowComponents(new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(channel));
  card.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
   button('save',t('Kaydet','Save')).setDisabled(sameSettings(state.baseline,state.draft)),button('reset',t('Sıfırla','Reset')),button('cancel',t('Vazgeç','Discard')),button('close',t('Kapat','Close'))));
 }else if(state.phase==='save'||state.phase==='reset'){
  card.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(button('confirm',t('Onayla','Confirm')),button('back',t('Geri','Back')),button('cancel',t('Vazgeç','Discard')),button('close',t('Kapat','Close'))));
 }else if(state.phase==='conflict'){
  card.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(button('refresh',t('Yenile','Reload')),button('close',t('Kapat','Close'))));
 }
 return {components:[card],flags:MessageFlags.IsComponentsV2 as const,allowedMentions:{parse:[] as []}};
}
