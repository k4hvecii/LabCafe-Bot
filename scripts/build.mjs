import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
// Remove generated output so deleted command sources cannot survive a rebuild.
rmSync(new URL('dist/', root), { recursive: true, force: true });
const result = spawnSync(process.execPath, [
  fileURLToPath(new URL('node_modules/typescript/bin/tsc', root)),
  '--project', fileURLToPath(new URL('tsconfig.json', root))
], { cwd: fileURLToPath(root), stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
if(process.exitCode===0)await import('./build-admin.mjs');
