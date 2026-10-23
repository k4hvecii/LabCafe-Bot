import { EmbedBuilder } from 'discord.js';

export type EmbedKind = 'success' | 'error' | 'info';
export type EmbedEmojis = Partial<Record<EmbedKind, string>>;

const emojiKeys = {
  success: 'EMBED_EMOJI_SUCCESS',
  error: 'EMBED_EMOJI_ERROR',
  info: 'EMBED_EMOJI_INFO'
} as const;

/** Only Discord custom emoji mentions are accepted; no Unicode fallback. */
export function readEmbedEmojis(env: NodeJS.ProcessEnv): EmbedEmojis {
  const emojis: EmbedEmojis = {};
  for (const kind of ['success', 'error', 'info'] as const) {
    const key = emojiKeys[kind];
    const value = env[key]?.trim();
    if (!value) continue;
    if (!/^<a?:[A-Za-z0-9_]{2,32}:\d{17,20}>$/.test(value)) {
      throw new Error(`${key}: özel Discord emojisi girin (<:isim:ID> veya <a:isim:ID>).`);
    }
    emojis[kind] = value;
  }
  return emojis;
}

export interface BotEmbedOptions {
  kind: EmbedKind;
  title?: string;
  description: string;
  emojis?: EmbedEmojis;
}

/** Compact neutral card. Custom emoji mentions render in the description. */
export function createBotEmbed(options: BotEmbedOptions): EmbedBuilder {
  const emojis = options.emojis ?? readEmbedEmojis(process.env);
  const emoji = emojis[options.kind];
  const content = options.title
    ? `**${options.title}**\n${options.description}`
    : options.description;
  return new EmbedBuilder().setDescription(`${emoji ? `${emoji} ` : ''}${content}`);
}
