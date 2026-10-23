import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { createBotEmbed } from '../ui/embeds.js';

export const setupCommand = {
  data: new SlashCommandBuilder().setName('kurulum').setNameLocalizations({'en-US':'setup','en-GB':'setup'}).setDescription('Başlangıç adımlarını ve kanal izinlerini gösterir.').setDescriptionLocalizations({"en-US":"Shows setup steps and channel permissions.","en-GB":"Shows setup steps and channel permissions."})
    .setDMPermission(false).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async run(interaction: ChatInputCommandInteraction): Promise<void> {
    let description: string;
    if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      description = 'Bu komut için Sunucuyu Yönet yetkisi gerekli.';
    } else {
      const required = [
        [PermissionFlagsBits.ViewChannel, 'Kanalı Görüntüle'],
        [PermissionFlagsBits.SendMessages, 'Mesaj Gönder'],
        [PermissionFlagsBits.EmbedLinks, 'Bağlantı Yerleştir']
      ] as const;
      const permissions = interaction.appPermissions;
      const missing = permissions
        ? required.filter(([permission]) => !permissions.has(permission)).map(([,label]) => label)
        : null;
      description = '**Başlangıç**\n`/ayarlar yanit` · Yanıt görünürlüğü\n`/ayarlar kanal` · Komut kanalı\n`/ayarlar goster` · Mevcut ayarlar\n\n'
        + (missing === null ? 'Bu kanaldaki bot izinleri doğrulanamadı.' : missing.length
          ? `Bu kanalda eksik izinler: ${missing.join(', ')}.` : 'Bu kanaldaki temel bot izinleri uygun.')
        + '\n\nPanel: https://labcafe.xyz\nBu kontrol yalnızca mevcut kanalın temel izinlerini kapsar.';
    }
    await interaction.reply({ embeds:[createBotEmbed({kind:'info',description})],
      flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]} });
  }
};
