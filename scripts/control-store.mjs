// Offline maintenance only. Stop the corresponding application before restore.
import {DatabaseSync,backup} from 'node:sqlite';
import {stat,open} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
const [mode,source,target]=process.argv.slice(2);
if(!['backup','restore'].includes(mode)||!source||!target||!isAbsolute(source)||!isAbsolute(target)||source===target)throw new Error('Usage: node scripts/control-store.mjs backup|restore ABSOLUTE_SOURCE ABSOLUTE_NEW_TARGET');
if(await stat(target).then(()=>true,()=>false))throw new Error('Target already exists; overwrite is forbidden.');
const check=new DatabaseSync(source,{readOnly:true});try{const row=check.prepare('PRAGMA integrity_check').get();if(row?.integrity_check!=='ok')throw new Error('Source integrity check failed.');const reserved=await open(target,'wx',0o600);await reserved.close();await backup(check,target);}finally{check.close();}
const verified=new DatabaseSync(target,{readOnly:true});try{if(verified.prepare('PRAGMA integrity_check').get()?.integrity_check!=='ok')throw new Error('Target integrity check failed.');}finally{verified.close();}
console.log(JSON.stringify({operation:mode,status:'verified',target}));
