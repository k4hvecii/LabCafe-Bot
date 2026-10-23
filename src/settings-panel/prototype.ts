import {SlashCommandBuilder,PermissionFlagsBits} from 'discord.js';
import type {BotCommand} from '../commands/index.js';
import type {BotConfig} from '../config/env.js';
import {isSnowflake} from '../config/env.js';
import {SettingsPanel} from './handler.js';

/** Never selects the prototype for normal/global/joined-guild registration. */
export function settingsPanelCommands(commands:BotCommand[],config:BotConfig,panel=new SettingsPanel()):BotCommand[]{
 if(!config.settingsPanelPrototype)return commands;
 if(!config.guildId||!isSnowflake(config.guildId)||config.registerJoinedGuilds||config.settingsPanelTestApplicationId!==config.clientId)throw new Error('Settings prototype requires a dedicated test application and guild.');
 const guild=config.guildId;
 return commands.map(command=>command.data.name!=='ayarlar'?command:{
  data:new SlashCommandBuilder().setName('ayarlar').setNameLocalizations({'en-US':'settings','en-GB':'settings'}).setDescription('Sunucu ayarlarını yönet.').setDescriptionLocalizations({'en-US':'Manage server settings.','en-GB':'Manage server settings.'}).setDMPermission(false).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async run(interaction,context){
   if(interaction.guildId!==guild)throw new Error('Settings prototype is restricted to its test guild.');
   await panel.open(interaction,context.settingsStore);
  }
 });
}
