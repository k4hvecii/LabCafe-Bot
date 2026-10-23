import { readdir } from 'node:fs/promises';
import { extname } from 'node:path';
import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { GuildSettings, GuildSettingsStore } from '../config/settings.js';

export interface CommandContext {
  commands?: readonly BotCommand[];
  settings: GuildSettings;
  settingsStore: GuildSettingsStore;
}

export interface BotCommand {
  help?: { category?: 'general' | 'management'; usage?: string; keywords?: readonly string[] };
  data: Pick<SlashCommandBuilder, 'name' | 'toJSON'>;
  run(interaction: ChatInputCommandInteraction, context: CommandContext): Promise<void>;
}

function isCommand(value: unknown): value is BotCommand {
  return typeof value === 'object' && value !== null
    && 'data' in value && value.data instanceof SlashCommandBuilder
    && 'run' in value && typeof value.run === 'function';
}

/** Each command file exports exactly one command (named or default). */
export async function loadCommands(directory = new URL('./', import.meta.url)): Promise<BotCommand[]> {
  const extension = extname(import.meta.url);
  const files = (await readdir(directory, { withFileTypes: true }))
    .filter(file => file.isFile() && file.name.endsWith(extension)
      && !file.name.endsWith('.d.ts') && file.name !== `index${extension}`)
    .map(file => file.name).sort();
  const loaded: BotCommand[] = [];
  const names = new Set<string>();
  for (const file of files) {
    const exports: Record<string, unknown> = await import(new URL(file, directory).href);
    const candidates = Object.values(exports).filter(isCommand);
    if (candidates.length !== 1) throw new Error(`${file}: tam olarak bir komut dışa aktarılmalı.`);
    const command = candidates[0]!;
    command.data.toJSON();
    if (names.has(command.data.name)) throw new Error(`Tekrarlanan komut adı: ${command.data.name}`);
    names.add(command.data.name);
    loaded.push(command);
  }
  if (!loaded.length) throw new Error('Komut bulunamadı; Discord kaydı değiştirilmedi.');
  return loaded;
}
