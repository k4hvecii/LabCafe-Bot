import {SlashCommandBuilder,type ChatInputCommandInteraction} from 'discord.js';
import type {CommandContext} from './index.js';
import {openHelp} from '../help/handler.js';
export const helpCommand={
 data:new SlashCommandBuilder().setName('yardım').setNameLocalizations({'en-US':'help','en-GB':'help'}).setDescription('Kullanabileceğin komutları bul.').setDescriptionLocalizations({'en-US':'Find commands available to you.','en-GB':'Find commands available to you.'})
 .addStringOption(option=>option.setName('komut').setNameLocalizations({'en-US':'command','en-GB':'command'}).setDescription('Ad veya anahtar sözcük.').setDescriptionLocalizations({'en-US':'Name or keyword.','en-GB':'Name or keyword.'}).setMaxLength(50).setAutocomplete(true)),
 help:{category:'general' as const,usage:'/yardım [komut]',keywords:['help','search']},
 async run(interaction:ChatInputCommandInteraction,context:CommandContext):Promise<void>{await openHelp(interaction,context);}
};
