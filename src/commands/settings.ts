import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { CommandContext } from './index.js';
import { createBotEmbed } from '../ui/embeds.js';

export const settingsCommand = {
  data: new SlashCommandBuilder()
    .setName('ayarlar').setNameLocalizations({'en-US':'settings','en-GB':'settings'}).setDescription('Sunucuya özel bot ayarları.').setDescriptionLocalizations({"en-US":"Server-specific bot settings.","en-GB":"Server-specific bot settings."})
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub => sub.setName('goster').setNameLocalizations({'en-US':'show','en-GB':'show'}).setDescription('Mevcut ayarları göster.').setDescriptionLocalizations({"en-US":"Show current settings.","en-GB":"Show current settings."}))
    .addSubcommand(sub => sub.setName('yanit').setNameLocalizations({'en-US':'replies','en-GB':'replies'}).setDescription('Komut yanıtlarının görünürlüğünü ayarla.').setDescriptionLocalizations({"en-US":"Set command reply visibility.","en-GB":"Set command reply visibility."})
      .addStringOption(option => option.setName('gorunum').setNameLocalizations({'en-US':'visibility','en-GB':'visibility'}).setDescription('Yanıt görünürlüğü.').setDescriptionLocalizations({"en-US":"Reply visibility.","en-GB":"Reply visibility."}).setRequired(true)
        .addChoices({ name: 'Yalnızca komutu kullanan kişi', name_localizations:{'en-US':'Only the command user','en-GB':'Only the command user'},value: 'gizli' }, { name: 'Herkese açık',name_localizations:{'en-US':'Public','en-GB':'Public'}, value: 'acik' })))
    .addSubcommand(sub => sub.setName('kanal').setNameLocalizations({'en-US':'channel','en-GB':'channel'}).setDescription('Komut kanalını seç; boş bırakırsan tüm kanallar.').setDescriptionLocalizations({"en-US":"Choose a command channel; leave empty for all channels.","en-GB":"Choose a command channel; leave empty for all channels."})
      .addChannelOption(option => option.setName('kanal').setNameLocalizations({'en-US':'channel','en-GB':'channel'}).setDescription('Komutların kullanılacağı kanal.').setDescriptionLocalizations({"en-US":"Channel where commands can be used.","en-GB":"Channel where commands can be used."})
        .addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(sub => sub.setName('dil').setNameLocalizations({'en-US':'language','en-GB':'language'}).setDescription('Bot dilini seç.').setDescriptionLocalizations({"en-US":"Choose the bot language.","en-GB":"Choose the bot language."})
      .addStringOption(option=>option.setName('dil').setNameLocalizations({'en-US':'language','en-GB':'language'}).setDescription('Sunucudaki bot yanıtlarının dili.').setDescriptionLocalizations({"en-US":"Language of bot responses in this server.","en-GB":"Language of bot responses in this server."}).setRequired(true)
        .addChoices({name:'Türkçe',value:'tr'},{name:'English',value:'en'})))
    .addSubcommand(sub => sub.setName('sifirla').setNameLocalizations({'en-US':'reset','en-GB':'reset'}).setDescription('Bu sunucunun ayarlarını varsayılana döndür.').setDescriptionLocalizations({"en-US":"Reset this server to default settings.","en-GB":"Reset this server to default settings."})),

  async run(interaction: ChatInputCommandInteraction, context: CommandContext): Promise<void> {
    const reply = async (description: string) => {
      await interaction.reply({ embeds: [createBotEmbed({ kind: 'info', description })],
        flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    };
    if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await reply('Bu komut için Sunucuyu Yönet yetkisi gerekli.');
      return;
    }
    const guildId = interaction.guildId;
    switch (interaction.options.getSubcommand()) {
      case 'dil': {
        const locale=interaction.options.getString('dil',true);
        if(locale!=='tr'&&locale!=='en')throw new Error('Geçersiz dil.');
        context.settingsStore.update(guildId,{locale},interaction.user.id);
        await reply(locale==='en'?'Bot language: English':'Bot dili: Türkçe');return;
      }
      case 'goster': {
        const settings = context.settingsStore.get(guildId);
        await reply(`Dil: ${settings.locale==='en'?'English':'Türkçe'}\nYanıtlar: ${settings.ephemeralReplies ? 'Gizli' : 'Herkese açık'}\nKomut kanalı: ${settings.commandChannelId ? `<#${settings.commandChannelId}>` : 'Tüm kanallar'}`);
        return;
      }
      case 'yanit': {
        const value = interaction.options.getString('gorunum', true);
        if (value !== 'gizli' && value !== 'acik') throw new Error('Geçersiz yanıt görünürlüğü.');
        context.settingsStore.update(guildId, { ephemeralReplies: value === 'gizli' }, interaction.user.id);
        await reply(`Yanıtlar: ${value === 'gizli' ? 'Gizli' : 'Herkese açık'}`);
        return;
      }
      case 'kanal': {
        const channel = interaction.options.getChannel('kanal');
        if (channel) {
          const resolved = await interaction.guild?.channels.fetch(channel.id);
          if (!resolved || resolved.type !== ChannelType.GuildText
            || !resolved.permissionsFor(interaction.client.user)?.has([
              PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks
            ])) {
            await reply('Botun görebildiği ve embed gönderebildiği bir metin kanalı seç.');
            return;
          }
        }
        context.settingsStore.update(guildId, { commandChannelId: channel?.id ?? null }, interaction.user.id);
        await reply(`Komut kanalı: ${channel ? `<#${channel.id}>` : 'Tüm kanallar'}`);
        return;
      }
      case 'sifirla':
        context.settingsStore.reset(guildId, interaction.user.id);
        await reply('Ayarlar sıfırlandı.');
        return;
      default: throw new Error('Bilinmeyen ayar işlemi.');
    }
  }
};
