import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readMetadata,checkMetadata,parseVersion,parseTag} from './version.mjs';
import {safeText} from './discord.mjs';

export async function prepareVersion(version,root=new URL('../../',import.meta.url)){
 parseVersion(version);
 const pkgURL=new URL('package.json',root),lockURL=new URL('package-lock.json',root);
 const pkg=JSON.parse(await readFile(pkgURL,'utf8')),lock=JSON.parse(await readFile(lockURL,'utf8'));
 checkMetadata(pkg,lock);pkg.version=version;lock.version=version;lock.packages[''].version=version;
 await writeFile(pkgURL,JSON.stringify(pkg,null,2)+'\n');await writeFile(lockURL,JSON.stringify(lock,null,2)+'\n');
 // Intentionally no npm version, git tag, commit, release, push, install or deployment side effects.
 return checkMetadata(pkg,lock);
}
export function notesFromSubjects(subjects){
 const names=['Yeni özellikler','İyileştirmeler','Hata düzeltmeleri','Güvenlik','Bilinen sorunlar'];
 const groups=new Map(names.map(name=>[name,[]]));
 for(const raw of subjects.slice(0,60)){
  const match=/^(feat|fix|perf|refactor|security|docs|chore|test|build|ci)(?:\([^)]+\))?!?:\s*(.+)$/i.exec(raw);
  const kind=match?.[1]?.toLowerCase();const category=kind==='feat'?names[0]:kind==='fix'?names[2]:kind==='security'?names[3]:names[1];
  groups.get(category).push('- '+safeText(match?.[2]??raw,200));
 }
 return '# Sürüm notları taslağı\n\nİncelenmemiş commit başlıklarıdır; tamamlanmış özellik veya yayın kanıtı değildir.\n\n'+[...groups].map(([name,items])=>'## '+name+'\n'+(items.length?items.join('\n'):'- Henüz değerlendirilmedi.')).join('\n\n')+'\n';
}
async function main(){
 const [mode,arg,...rest]=process.argv.slice(2);
 if(mode==='check'){
  const meta=await readMetadata();
  if(arg){if(arg!=='--tag'||!rest[0])throw new Error('invalid_check_arguments');const tag=parseTag(rest[0]);if(tag.version!==meta.version)throw new Error('tag_version_mismatch');const git=command=>execFileSync('git',command,{encoding:'utf8',windowsHide:true}).trim();if(git(['rev-list','-n','1',tag.tag])!==git(['rev-parse','HEAD']))throw new Error('tag_commit_mismatch');}
  console.log(JSON.stringify({version:meta.version,stage:meta.stage,published:false}));return;
 }
 if(mode==='prepare'){console.log(JSON.stringify({...await prepareVersion(arg),published:false}));return;}
 if(mode==='notes'){
  if(arg!=='--from'||rest[1]!=='--to')throw new Error('notes_requires_from_and_to');
  const from=rest[0],to=rest[2];for(const value of [from,to])if(!/^[a-f0-9]{40}$/.test(value)&&value!=='HEAD')parseTag(value);
  const range=from+'..'+to;
  const subjects=execFileSync('git',['log','--no-merges','--max-count=60','--format=%s',range],{encoding:'utf8',windowsHide:true}).trim().split('\n').filter(Boolean);
  console.log(notesFromSubjects(subjects));return;
 }
 throw new Error('invalid_release_mode');
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){main().catch(()=>{console.error('release_operation_failed');process.exitCode=1;});}
