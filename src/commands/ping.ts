import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { createBotEmbed } from '../ui/embeds.js';
import type { CommandContext } from './index.js';

export const pingCommand = {
  data: new SlashCommandBuilder().setName('ping').setNameLocalizations({'en-US':'ping','en-GB':'ping'}).setDescription('Bot ve Discord bağlantısını kontrol eder.').setDescriptionLocalizations({"en-US":"Checks the bot and Discord connection.","en-GB":"Checks the bot and Discord connection."}),
  async run(interaction: ChatInputCommandInteraction, context?: CommandContext): Promise<void> {
    await interaction.reply({
      embeds: [createBotEmbed({
        kind: 'success',
        description: `Gecikme: \`${Math.max(0, Math.round(interaction.client.ws.ping))} ms\``
      })],
      flags: (context?.settings.ephemeralReplies ?? true) ? MessageFlags.Ephemeral : [],
      allowedMentions: { parse: [] }
    });
  }
};
