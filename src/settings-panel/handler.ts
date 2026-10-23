import {randomBytes} from 'node:crypto';
import {ChannelType, MessageFlags, PermissionFlagsBits, type Interaction, type ChatInputCommandInteraction, type ButtonInteraction, type StringSelectMenuInteraction, type ChannelSelectMenuInteraction} from 'discord.js';
import {defaultSettings, type GuildSettings, type GuildSettingsStore} from '../config/settings.js';
import {renderSettingsPanel, sameSettings, words, type PanelState} from './view.js';

type PanelInteraction=ButtonInteraction|StringSelectMenuInteraction|ChannelSelectMenuInteraction;
interface Session extends PanelState {owner:string;guild:string;channel:string;message:string;expires:number;busy:boolean;resetDraft?:GuildSettings}
const TTL=5*60_000;
const CAPACITY=500;
/** Per-client sessions; no interaction tokens or credentials are stored in component IDs. */
export class SettingsPanel {
 private readonly sessions=new Map<string,Session>();
 constructor(private readonly clock:()=>number=Date.now){}
 private prune(){for(const [id,s] of this.sessions)if(s.expires<=this.clock())this.sessions.delete(id);}
 private async authorized(i:ChatInputCommandInteraction|PanelInteraction,store:GuildSettingsStore){
  if(!i.guildId||!i.guild||!store.betaAllows(i.guildId)||!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild))return false;
  // Force a new REST member read: cached membership is not sufficient for writes.
  const member=await i.guild.members.fetch({user:i.user.id,force:true});
  return member.id===i.user.id&&member.permissions.has(PermissionFlagsBits.ManageGuild);
 }
 private async validChannel(i:ChatInputCommandInteraction|PanelInteraction,id:string|null){
  if(id===null)return true;
  if(!/^\d{17,20}$/.test(id)||!i.guild||!i.client.user)return false;
  const channel=await i.guild.channels.fetch(id,{force:true});
  if(!channel||channel.guildId!==i.guildId||channel.type!==ChannelType.GuildText)return false;
  const bot=await i.guild.members.fetch({user:i.client.user.id,force:true});
  return !!channel.permissionsFor(bot)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks]);
 }
 async open(i:ChatInputCommandInteraction,store:GuildSettingsStore):Promise<void>{
  await i.deferReply({flags:MessageFlags.Ephemeral});
  this.prune();
  const en=i.guildId?store.get(i.guildId).locale==='en':i.locale.startsWith('en');
  const t=(tr:string,english:string)=>words(en,tr,english);
  let authorized=false;
  try{authorized=await this.authorized(i,store);}catch{
   await i.editReply({content:t('İzinler doğrulanamadı. /ayarlar ile tekrar dene.','Permissions could not be verified. Open /settings again.'),allowedMentions:{parse:[]}});return;
  }
  if(!authorized){
   await i.editReply({content:t('Sunucuyu Yönet yetkisi gerekli.','Manage Server permission is required.'),allowedMentions:{parse:[]}});return;
  }
  if(this.sessions.size>=CAPACITY){await i.editReply({content:t('Şu an yeni panel açılamıyor. Biraz sonra dene.','Panel capacity reached. Try again shortly.')});return;}
  const baseline=store.get(i.guildId!);const token=randomBytes(12).toString('hex');
  const s:Session={owner:i.user.id,guild:i.guildId!,channel:i.channelId!,message:'',expires:this.clock()+TTL,busy:false,baseline,draft:{...baseline},phase:'edit',revision:0};
  const message=await i.editReply(renderSettingsPanel(token,s));s.message=message.id;
  this.sessions.set(token,s);
 }
 async handle(i:Interaction,store:GuildSettingsStore):Promise<boolean>{
  if(!i.isButton()&&!i.isStringSelectMenu()&&!i.isChannelSelectMenu())return false;
  if(!i.customId.startsWith('lc.settings:'))return false;
  this.prune();
  const match=/^lc\.settings:([a-f0-9]{24}):(\d{1,9}):(locale|visibility|channel|save|reset|confirm|back|cancel|close|refresh)$/.exec(i.customId);
  const token=match?.[1];const s=token?this.sessions.get(token):undefined;
  const en=s?s.baseline.locale==='en':i.locale.startsWith('en');const t=(tr:string,english:string)=>words(en,tr,english);
  const deny=async(text:string)=>{await i.reply({content:text,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});return true;};
  if(!s||!token)return deny(t('Panelin süresi doldu. /ayarlar ile yeniden aç.','This panel expired. Open /settings again.'));
  if(s.owner!==i.user.id||s.guild!==i.guildId||s.channel!==i.channelId||s.message!==i.message.id)return deny(t('Bu panel sana ait değil.','This panel does not belong to you.'));
  if(s.busy)return deny(t('İşlem sürüyor.','An operation is in progress.'));
  if(Number(match![2])!==s.revision)return deny(t('Bu işlem eski. Güncel paneli kullan.','This action is outdated. Use the current panel.'));
  s.busy=true;
  let committed=false;
  try{
   await i.deferUpdate();
   if(!await this.authorized(i,store)){
    this.sessions.delete(token);
    await i.editReply(renderSettingsPanel(token,{...s,phase:'closed'},t('Sunucuyu Yönet yetkisi gerekli.','Manage Server permission is required.')));return true;
   }
   // The session may expire while Discord's REST API is responding.
   if(s.expires<=this.clock()){this.sessions.delete(token);await i.editReply(renderSettingsPanel(token,{...s,phase:'closed'},t('/ayarlar ile yeniden aç.','Open /settings again.')));return true;}
   const action=match![3]!;s.revision++;
   let notice='';
   const invalid=()=>{notice=t('Geçersiz seçim.','Invalid selection.');};
   if(action==='close'&&i.isButton()){s.phase='closed';this.sessions.delete(token);}
   else if(action==='refresh'&&i.isButton()&&s.phase==='conflict'){
    s.baseline=store.get(s.guild);s.draft={...s.baseline};delete s.resetDraft;s.phase='edit';
   }else if(action==='cancel'&&i.isButton()&&s.phase!=='conflict'){
    s.baseline=store.get(s.guild);s.draft={...s.baseline};delete s.resetDraft;s.phase='edit';notice=t('Değişikliklerden vazgeçildi.','Changes discarded.');
   }else if(action==='back'&&i.isButton()&&(s.phase==='save'||s.phase==='reset')){
    // Back restores the draft that existed before opening the reset confirmation.
    if(s.phase==='reset')s.draft=s.resetDraft??{...s.baseline};delete s.resetDraft;s.phase='edit';
   }else if(s.phase==='edit'&&action==='locale'&&i.isStringSelectMenu()&&i.values.length===1&&['tr','en'].includes(i.values[0]!)){
    s.draft.locale=i.values[0] as 'tr'|'en';
   }else if(s.phase==='edit'&&action==='visibility'&&i.isStringSelectMenu()&&i.values.length===1&&['private','public'].includes(i.values[0]!)){
    s.draft.ephemeralReplies=i.values[0]==='private';
   }else if(s.phase==='edit'&&action==='channel'&&i.isChannelSelectMenu()&&i.values.length<=1){
    const selected=i.values[0]??null;
    if(await this.validChannel(i,selected))s.draft.commandChannelId=selected;else notice=t('Botun görebildiği ve mesaj gönderebildiği bir metin kanalı seç.','Choose a text channel where the bot can view and send messages.');
   }else if(s.phase==='edit'&&action==='save'&&i.isButton()){
    if(!sameSettings(s.baseline,s.draft))s.phase='save';
   }else if(s.phase==='edit'&&action==='reset'&&i.isButton()){
    s.resetDraft={...s.draft};s.draft=defaultSettings();s.phase='reset';
   }else if(action==='confirm'&&i.isButton()&&(s.phase==='save'||s.phase==='reset')){
    if(!await this.validChannel(i,s.draft.commandChannelId)){s.phase='edit';notice=t('Seçili kanal veya bot izinleri geçersiz. Kanalı yeniden seç.','The selected channel or bot permissions are invalid. Choose a channel again.');}
    else{
     // Recheck after asynchronous channel validation; the store performs its own atomic comparison.
     if(!await this.authorized(i,store))throw new Error('PANEL_PERMISSION_CHANGED');
     if(s.expires<=this.clock())throw new Error('PANEL_EXPIRED');
     const saved=s.phase==='reset'?store.reset(s.guild,s.owner,s.baseline):store.update(s.guild,s.draft,s.owner,s.baseline);
     committed=true;
     s.baseline=saved;s.draft={...saved};delete s.resetDraft;s.phase='edit';notice=words(saved.locale==='en','Kaydedildi.','Saved.');
    }
   }else invalid();
   await i.editReply(renderSettingsPanel(token,s,notice));
  }catch(error){
   if(error instanceof Error&&error.message==='SETTINGS_CONFLICT'){
    s.phase='conflict';await i.editReply(renderSettingsPanel(token,s));
   }else if(error instanceof Error&&['PANEL_PERMISSION_CHANGED','PANEL_EXPIRED'].includes(error.message)){
    this.sessions.delete(token);await i.editReply(renderSettingsPanel(token,{...s,phase:'closed'},t('Panel artık kullanılamıyor. /ayarlar ile yeniden aç.','This panel is no longer available. Open /settings again.')));
   }else{
    // Consume failed revisions too: retry uses the newly rendered controls, never a replayed confirmation.
    s.revision++;s.phase='edit';
    if(i.deferred||i.replied)await i.editReply(renderSettingsPanel(token,s,committed?t('Kaydedildi.','Saved.'):t('İşlem tamamlanamadı. Tekrar dene.','The operation could not be completed. Try again.')));
    else await i.reply({content:t('İşlem tamamlanamadı. /ayarlar ile yeniden dene.','The operation could not be completed. Open /settings again.'),flags:MessageFlags.Ephemeral});
   }
  }finally{s.busy=false;}
  return true;
 }
}
