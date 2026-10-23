import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
await build({entryPoints:[fileURLToPath(new URL('./chart-entry.mjs',import.meta.url))],outfile:fileURLToPath(new URL('../dashboard/admin/charts.js',import.meta.url)),bundle:true,minify:true,format:'iife',globalName:'echarts',target:'es2022',legalComments:'inline'});
const names=['echarts','zrender','web-vitals'];let notice='LabCafe third-party software notices\n\n';
for(const name of names){const pkg=JSON.parse(await readFile(new URL('../node_modules/'+name+'/package.json',import.meta.url),'utf8'));let license='';for(const candidate of ['LICENSE','LICENSE.txt']){try{license=await readFile(new URL('../node_modules/'+name+'/'+candidate,import.meta.url),'utf8');break;}catch{}}
 notice+=`${name} ${pkg.version}\nLicense: ${pkg.license}\n${license}\n\n`;
}
await writeFile(new URL('../dashboard/THIRD_PARTY_NOTICES.txt',import.meta.url),notice);
