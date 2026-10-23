import 'dotenv/config';
import { REST } from 'discord.js';
import { readConfig } from '../config/env.js';
import { executeStyle, parseStyleArgs, resetBody, styleBody } from '../style/name-style.js';

async function main(): Promise<void> {
  const args = parseStyleArgs(process.argv.slice(2), process.env.STYLE_GUILD_IDS ?? '');
  const payload = args.mode === 'reset' ? resetBody() : styleBody(args.preset);
  console.log('Deneysel Discord Display Name Styles (resmî bot API özelliği değil).');
  console.log('Hedef sunucular:', args.guildIds.join(', '));
  console.log('İşlem:', args.mode, '| Preset:', args.preset);
  console.log('JSON gövdesi:', JSON.stringify(payload));

  if (args.mode === 'preview') {
    console.log('Yalnızca önizleme: Discord API çağrısı yapılmadı.');
    return;
  }
  if (!args.confirmed) {
    throw new Error('API değişebilir veya hesap için kısıtlama oluşturabilir. Kabul ediyorsanız sona --confirm-unsupported-api ekleyin.');
  }
  const config = readConfig(process.env);
  const rest = new REST({ version: '10' }).setToken(config.token);
  const result = await executeStyle(args, (route, body) => rest.patch(route, { body }));
  console.log(`İstek kabul edilen sunucu sayısı: ${result.successful.length}`);
  for (const guildId of result.successful) console.log(`OK ${guildId} (görsel sonucu Discord istemcisinde kontrol edin)`);
  for (const guildId of result.failed) console.error(`HATA ${guildId} (403/400/429 veya desteklenmeyen alan olabilir)`);
  if (result.failed.length) process.exitCode = 1;
  console.log('Bu değişiklik her sunucu için ayrı yapılır; başka sunuculara otomatik yayılmaz.');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Beklenmeyen hata');
  process.exitCode = 1;
});
