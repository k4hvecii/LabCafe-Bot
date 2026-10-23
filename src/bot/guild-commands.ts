import type { BotCommand } from '../commands/index.js';
import type { CommandRegistry } from './sync-commands.js';
import { syncCommands } from './sync-commands.js';

export interface GuildCommandTarget { id: string; commands: CommandRegistry }

/** Coalesce repeated gateway events and serialize writes through the Discord registry. */
export function createGuildCommandSync(commands: BotCommand[], allows: (guildId: string) => boolean) {
  const pending = new Map<string, Promise<boolean | null>>();
  let queue: Promise<unknown> = Promise.resolve();
  return (guild: GuildCommandTarget): Promise<boolean | null> => {
    const existing = pending.get(guild.id);
    if (existing) return existing;
    const result = queue.catch(() => undefined).then(async () => {
      if (!allows(guild.id)) return null;
      return syncCommands(commands, guild.commands);
    });
    pending.set(guild.id,result);
    queue = result;
    void result.finally(() => { if (pending.get(guild.id) === result) pending.delete(guild.id); }).catch(() => undefined);
    return result;
  };
}
