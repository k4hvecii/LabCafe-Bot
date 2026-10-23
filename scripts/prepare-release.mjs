// Allowlist export: never reads .env, private keys, databases or node_modules.
import {readdir,readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));const output=process.argv[2];
if(!output||!isAbsolute(output))throw new Error('Provide a new absolute release directory.');
const destination=resolve(output);if(destination===resolve(root)||destination.startsWith(resolve(root)+'\\')||destination.startsWith(resolve(root)+'/'))throw new Error('Release output must be outside source tree.');
await mkdir(destination);const stage=join(destination,'source');await mkdir(stage);const files=[];
const allowed=name=>!/(?:^|[/\\])\.[^/\\]+|\.(?:env|sqlite(?:-wal|-shm)?|db|ppk|pem|key|log|zip|tgz)$/i.test(name);
async function exportDirectory(name){for(const entry of await readdir(join(root,name),{withFileTypes:true})){const path=join(name,entry.name);if(!allowed(path))continue;if(entry.isSymbolicLink())throw new Error('Symlink export forbidden');if(entry.isDirectory())await exportDirectory(path);else if(entry.isFile())files.push(path);}}
for(const directory of ['src','dist','dashboard','scripts','deployment','tests'])await exportDirectory(directory);
for(const name of ['package.json','package-lock.json','tsconfig.json','README.md'])files.push(name);
const manifest=[];for(const name of files.sort()){const bytes=await readFile(join(root,name));const target=join(stage,name);await mkdir(resolve(target,'..'),{recursive:true});await copyFile(join(root,name),target);manifest.push({path:relative(root,join(root,name)).replaceAll('\\','/'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
await writeFile(join(stage,'RELEASE-MANIFEST.json'),JSON.stringify({createdAt:new Date().toISOString(),source:'local-working-copy-no-git-history',files:manifest},null,2));
const archive=join(destination,'labcafe-control-center.tgz');execFileSync('tar',['-czf',archive,'-C',stage,'.'],{windowsHide:true});
const bytes=await readFile(archive);await writeFile(join(destination,'SHA256SUMS'),createHash('sha256').update(bytes).digest('hex')+'  labcafe-control-center.tgz\n');
console.log(JSON.stringify({archive,files:files.length,bytes:bytes.length,provenance:'local-source-manifest; not a Git commit'}));
