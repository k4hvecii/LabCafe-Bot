import { ApplicationCommandType } from 'discord.js';
import type { ApplicationCommand, ApplicationCommandDataResolvable } from 'discord.js';
import type { APIApplicationCommandOption } from 'discord.js';
import type { BotCommand } from '../commands/index.js';

export interface CommandRegistry {
  fetch(): Promise<ReadonlyMap<string, Pick<ApplicationCommand, 'id' | 'applicationId' | 'guildId' | 'version' | 'name' | 'equals' | 'integrationTypes' | 'contexts'>>>;
  set(commands: ApplicationCommandDataResolvable[]): Promise<unknown>;
}

function localizations(value: Record<string, string | null | undefined> | null | undefined): Record<string, string | null> {
  const result: Record<string, string | null> = {};
  for (const [key, text] of Object.entries(value ?? {})) {
    if (text !== undefined) result[key] = text;
  }
  return result;
}

function comparableOptions(options: APIApplicationCommandOption[]): APIApplicationCommandOption[] {
  const result = structuredClone(options);
  stripEmptyArrays(result);
  return result;
}

function stripEmptyArrays(options: APIApplicationCommandOption[]): void {
  for (const option of options) {
    if ('options' in option && option.options) {
      if (option.options.length === 0) delete option.options;
      else stripEmptyArrays(option.options);
    }
    if ('choices' in option && option.choices?.length === 0) {
      delete option.choices;
    }
  }
}

export async function syncCommands(commands: BotCommand[], registry: CommandRegistry): Promise<boolean> {
  if (!commands.length) throw new Error('Boş komut listesi kaydedilemez.');
  const desired = commands.map(command => command.data.toJSON());
  const existing = [...(await registry.fetch()).values()];
  const unchanged = existing.length === desired.length && desired.every(data => {
    const current = existing.find(command => command.name === data.name);
    return current?.equals({
      name: data.name,
      description: data.description,
      options: comparableOptions(data.options ?? []),
      name_localizations: localizations(data.name_localizations),
      description_localizations: localizations(data.description_localizations),
      default_member_permissions: data.default_member_permissions ?? null,
      nsfw: data.nsfw ?? false,
      // Guild command responses omit the DM permission (a global-only field).
      ...(current.guildId || data.dm_permission === undefined ? {} : { dm_permission: data.dm_permission }),
      id: current.id,
      application_id: current.applicationId,
      version: current.version,
      type: data.type ?? ApplicationCommandType.ChatInput,
      // Discord supplies application defaults when these fields are omitted.
      integration_types: data.integration_types ?? current.integrationTypes ?? [],
      contexts: data.contexts ?? current.contexts ?? []
    }, true);
  });
  if (unchanged) return false;
  await registry.set(desired);
  return true;
}
