import 'dotenv/config';
import { readConfig } from '../config/env.js';

const [major = '0', minor = '0'] = process.versions.node.split('.');
const compatible = Number(major) > 24 || (Number(major) === 24 && Number(minor) >= 17);
console.log(`Node.js: ${process.version} (${compatible ? 'uyumlu' : '24.17.0 veya yenisi gerekli'})`);
console.log(`Platform: ${process.platform} / ${process.arch}`);
try {
  const config = readConfig(process.env);
  console.log(`.env: uygun; uygulama ID: ${config.clientId}; komut kapsamı: ${config.guildId ?? 'global'}`);
  console.log('Token: yapılandırıldı (gösterilmiyor).');
} catch (error) {
  console.error(`Yapılandırma: ${(error as Error).message}`);
  process.exitCode = 1;
}
if (!compatible) process.exitCode = 1;
