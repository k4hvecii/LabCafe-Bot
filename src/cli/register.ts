import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { readConfig } from '../config/env.js';
import { loadCommands } from '../commands/index.js';
import { safeErrorName } from '../core/logger.js';

async function main() {
  const config = readConfig(process.env);
  const commands = await loadCommands();
  const rest = new REST({ version: '10' }).setToken(config.token);
  const route = config.guildId
    ? Routes.applicationGuildCommands(config.clientId, config.guildId)
    : Routes.applicationCommands(config.clientId);

  await rest.put(route, { body: commands.map(command => command.data.toJSON()) });
  console.log(`${commands.length} slash komut ${config.guildId ? 'test sunucusuna' : 'global olarak'} kaydedildi.`);
  console.log('Not: Global komutların görünür olması gecikebilir.');
}
main().catch(error => {
  console.error(`Komut kaydı başarısız: ${safeErrorName(error)}. Token, ID ve bot yetkilerini kontrol edin.`);
  process.exitCode = 1;
});
