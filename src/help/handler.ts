import {randomBytes} from 'node:crypto';
import {ActionRowBuilder,MessageFlags,ModalBuilder,TextInputBuilder,TextInputStyle,type Interaction,type ChatInputCommandInteraction} from 'discord.js';
import type {BotCommand,CommandContext} from '../commands/index.js';
import type {GuildSettingsStore} from '../config/settings.js';
import type {CommandAccessSettings} from './access-store.js';
import {availableCommands,canManage,languageFor,searchCommands,words,type HelpLanguage} from './catalog.js';
import {freshState,renderHelp,type HelpState} from './view.js';

const TTL=5*60_000;
const LIMIT=500;
interface Session {owner:string;guild:string|null;channel:string|null;until:number;state:HelpState;pending?:{command:string;baseline:string}}
const sessions=new Map<string,Session>();
function allocate(interaction:Interaction):string {
  for(const [key,value] of sessions)if(value.until<=Date.now())sessions.delete(key);
  while(sessions.size>=LIMIT)sessions.delete(sessions.keys().next().value!);
  const token=randomBytes(12).toString('hex');
  sessions.set(token,{owner:interaction.user.id,guild:interaction.guildId,channel:interaction.channelId,until:Date.now()+TTL,state:freshState()});
  return token;
}
const input=(id:string,label:string,value='',max=1000)=>new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(max).setValue(value));
const keys=['allowedRoleIds','deniedRoleIds','allowedChannelIds','deniedChannelIds'] as const;
export function parseAccessForm(fields:{getTextInputValue(id:string):string}):CommandAccessSettings {
  const disabled=fields.getTextInputValue('disabled').trim().toLowerCase();
  if(!['true','false'].includes(disabled))throw new Error('INVALID_FORM');
  const result:CommandAccessSettings={disabled:disabled==='true',allowedRoleIds:[],deniedRoleIds:[],allowedChannelIds:[],deniedChannelIds:[]};
  for(const key of keys){const value=fields.getTextInputValue(key).trim();const ids=value?value.split(/[\s,]+/):[];
    if(ids.length>25||!ids.every(id=>/^\d{17,20}$/.test(id)))throw new Error('INVALID_FORM');result[key]=[...new Set(ids)];}
  return result;
}
function searchForm(token:string,language:HelpLanguage){return new ModalBuilder().setCustomId(`lc.help:${token}:query`).setTitle(words(language,'Komut bul','Find a command')).addComponents(input('query',words(language,'Aranacak sözcük','Search term'),'',50));}
export async function openHelp(interaction:ChatInputCommandInteraction,context:CommandContext):Promise<void>{
  const token=allocate(interaction);const session=sessions.get(token)!;
  session.state.query=(interaction.options.getString('komut')??'').trim().slice(0,50);
  const commands=searchCommands(availableCommands(context.commands??[],interaction,context.settingsStore),session.state.query);
  const exact=commands.find(command=>command.data.name===session.state.query.replace(/^\//,''));session.state.command=exact?.data.name??null;
  await interaction.reply(renderHelp(token,session.state,commands,languageFor(interaction,context.settingsStore),canManage(interaction)));
}
export async function handleHelp(interaction:Interaction,commands:readonly BotCommand[],store:GuildSettingsStore):Promise<boolean>{
  if(interaction.isAutocomplete()){
    if(interaction.commandName!=='yardım')return false;
    const choices=searchCommands(availableCommands(commands,interaction,store),String(interaction.options.getFocused())).slice(0,25);
    await interaction.respond(choices.map(command=>({name:'/'+command.data.name,value:command.data.name})));return true;
  }
  if(!interaction.isButton()&&!interaction.isStringSelectMenu()&&!interaction.isModalSubmit())return false;
  if(!interaction.customId.startsWith('lc.help:')&&!interaction.customId.startsWith('help:'))return false;
  const language=languageFor(interaction,store);const t=(tr:string,en:string)=>words(language,tr,en);
  const deny=async(tr:string,en:string)=>{await interaction.reply({content:t(tr,en),flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});return true;};
  const match=/^lc\.help:([a-f0-9]{24}):(category|command|back|next|search|home|edit|query|save)$/.exec(interaction.customId);
  const token=match?.[1];const session=token?sessions.get(token):undefined;
  if(!session||session.until<=Date.now()){if(token)sessions.delete(token);return deny('Bu rehber kapandı. /yardım ile yenisini aç.','This guide has closed. Open a new one with /help.');}
  if(session.owner!==interaction.user.id||session.guild!==interaction.guildId||session.channel!==interaction.channelId)return deny('Bu kontroller başka bir oturuma ait.','These controls belong to another session.');
  if(interaction.guildId&&!store.betaAllows(interaction.guildId))return deny('Bu sunucuya erişim kapalı.','Access to this server is closed.');
  const action=match![2]!;const state=session.state;const visible=availableCommands(commands,interaction,store);const current=visible.find(command=>command.data.name===state.command);
  if(action==='search'&&interaction.isButton()){await interaction.showModal(searchForm(token!,language));return true;}
  if(action==='edit'&&interaction.isButton()){
    if(!canManage(interaction)||!current||!interaction.guildId)return deny('Sunucuyu Yönet yetkisi gerekiyor.','Manage Server permission is required.');
    const access=store.getCommandAccess(interaction.guildId,current.data.name);session.pending={command:current.data.name,baseline:JSON.stringify(access)};
    const labels=language==='en'?['Allowed role IDs','Denied role IDs','Allowed channel IDs','Denied channel IDs']:['İzinli rol kimlikleri','Engelli rol kimlikleri','İzinli kanal kimlikleri','Engelli kanal kimlikleri'];
    const modal=new ModalBuilder().setCustomId(`lc.help:${token}:save`).setTitle(t('Komut erişimi','Command access')).addComponents(input('disabled',t('Devre dışı: true / false','Disabled: true / false'),String(access.disabled),5));
    keys.forEach((key,index)=>modal.addComponents(input(key,labels[index]!,access[key].join(', '))));await interaction.showModal(modal);return true;
  }
  if(action==='save'&&interaction.isModalSubmit()){
    const pending=session.pending;delete session.pending;
    if(!canManage(interaction)||!interaction.guildId||!pending||!visible.some(command=>command.data.name===pending.command))return deny('Kaydetme izni doğrulanamadı.','Save permission could not be verified.');
    if(JSON.stringify(store.getCommandAccess(interaction.guildId,pending.command))!==pending.baseline)return deny('Ayar değişti. Düzenleme penceresini yeniden aç.','Settings changed. Reopen the editor.');
    let value:CommandAccessSettings;try{value=parseAccessForm(interaction.fields);}catch{return deny('Kimlikleri ve true / false değerini kontrol et.','Check the IDs and the true / false value.');}
    store.setCommandAccess(interaction.guildId,pending.command,value,interaction.user.id);return deny('Komut erişimi kaydedildi.','Command access saved.');
  }
  if(action==='query'&&interaction.isModalSubmit()){
    state.query=interaction.fields.getTextInputValue('query').trim().slice(0,50);state.page=0;state.command=null;
    await interaction.reply({...renderHelp(token!,state,searchCommands(visible,state.query),language,canManage(interaction)),flags:MessageFlags.Ephemeral});return true;
  }
  if(interaction.isModalSubmit())return deny('Geçersiz işlem.','Invalid action.');
  if(action==='category'&&interaction.isStringSelectMenu()){
    const category=interaction.values[0];if(!['all','general','management'].includes(category??''))return deny('Geçersiz kategori.','Invalid category.');
    state.category=category as HelpState['category'];state.page=0;state.command=null;
  }else if(action==='command'&&interaction.isStringSelectMenu()){
    if(!searchCommands(visible,state.query).some(command=>command.data.name===interaction.values[0]))return deny('Komut bu oturumda kullanılamıyor.','This command is unavailable in this session.');state.command=interaction.values[0]!;
  }else if(action==='back'&&interaction.isButton()){state.page--;state.command=null;}
  else if(action==='next'&&interaction.isButton()){state.page++;state.command=null;}
  else if(action==='home'&&interaction.isButton())Object.assign(state,freshState());
  else return deny('Geçersiz işlem.','Invalid action.');
  await interaction.update(renderHelp(token!,state,searchCommands(visible,state.query),language,canManage(interaction)));return true;
}
