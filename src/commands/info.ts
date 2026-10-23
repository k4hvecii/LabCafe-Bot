import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { createBotEmbed } from '../ui/embeds.js';

export const infoCommand = {
  data: new SlashCommandBuilder().setName('bilgi').setNameLocalizations({'en-US':'info','en-GB':'info'}).setDescription('LabCafe hakkında bilgi verir.').setDescriptionLocalizations({"en-US":"Shows information about LabCafe.","en-GB":"Shows information about LabCafe."}),
  async run(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.reply({
      embeds: [createBotEmbed({ kind:'info', description:'**LabCafe**\nAkıllı Discord Sunucu Yönetim Asistanı\nKapalı beta hazırlığı\n\nPanel: https://labcafe.xyz\nSunucu ayarları: `/ayarlar`\nKomutlar: `/yardım`' })],
      flags: MessageFlags.Ephemeral, allowedMentions:{ parse:[] }
    });
  }
};
