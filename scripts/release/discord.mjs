const COFFEE=0x956b46;
export const REPOSITORY='k4hvecii/LabCafe-Bot';
const SECRET=/(?:https?:\/\/[^\s]+|(?:mfa\.[\w-]{30,})|(?:[\w-]{24,28}\.[\w-]{6}\.[\w-]{25,})|(?:gh[pousr]_[\w]{20,})|(?:github_pat_[\w]{20,})|(?:sk-(?:proj-)?[\w-]{20,})|(?:[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})|(?:\b(?:token|secret|password|authorization|api[_-]?key)\s*[:=]\s*\S+)|(?:\b[A-Za-z0-9_-]{40,}\b))/gi;
export function safeText(value,limit=300){
 return String(value??'').replace(SECRET,'[gizlendi]').replace(/[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,'').replace(/@/g,'@\u200b').replace(/[\\`*_~|>\[\]()#]/g,'\\$&').slice(0,limit);
}
function safePath(path){
 if(typeof path!=='string'||path.length>180||!/^[A-Za-z0-9_./-]+$/.test(path)||path.includes('..'))return null;
 if(/(?:^|\/)(?:\.[^/]+|data|logs?|backups?|private|secrets?|credentials?|users?|uploads?|production)(?:\/|$)|\.(?:env|db|sqlite(?:-wal|-shm)?|log|pem|key|ppk|zip|tgz|bak)$/i.test(path))return null;
 if(path.replace(SECRET,'[gizlendi]')!==path||/(?:^|\/)(?:credentials?|secrets?|production|private)(?:[._-]|\/|$)/i.test(path))return null;
 if(!/^(?:src\/|tests\/|scripts\/|dashboard\/|[A-Z][A-Z0-9_-]*\.md$|package(?:-lock)?\.json$|tsconfig\.json$)/.test(path))return null;
 return path;
}
function count(value){if(!Number.isSafeInteger(value)||value<0)throw new Error('invalid_diff_count');return value;}
export function diffSummary(files,{partial=false}={}){
 if(!Array.isArray(files))throw new Error('invalid_diff');
 let additions=0,deletions=0;const names=[];
 for(const f of files){additions+=count(f.additions);deletions+=count(f.deletions);const name=safePath(f.filename);if(name&&!names.includes(name))names.push(name);}
 // Never propagate patches, previous file names, author identities or file contents.
 return {fileCount:files.length,additions,deletions,names:names.slice(0,4),hiddenNames:files.length-names.slice(0,4).length,partial};
}
const headings={
 'yeni özellikler':'Yeni özellikler','features':'Yeni özellikler',
 'iyileştirmeler':'İyileştirmeler','improvements':'İyileştirmeler',
 'hata düzeltmeleri':'Hata düzeltmeleri','fixes':'Hata düzeltmeleri',
 'güvenlik':'Güvenlik','security':'Güvenlik',
 'bilinen sorunlar':'Bilinen sorunlar','known issues':'Bilinen sorunlar'
};
export function releaseNotes(body){
 const groups=new Map();let active=null;let inCode=false;
 for(const line of String(body??'').slice(0,50000).split(/\r?\n/)){
  if(/^\s*```/.test(line)){inCode=!inCode;continue;}if(inCode)continue;
  const heading=/^#{1,3}\s+(.+?)\s*$/.exec(line);
  if(heading){active=headings[heading[1].toLowerCase().replaceAll('i\u0307','i')];continue;}
  const item=/^\s*[-*]\s+(.+)/.exec(line);
  if(active&&item){const items=groups.get(active)??[];if(items.length<2)items.push(safeText(item[1],180));groups.set(active,items);}
 }
 return [...groups].map(([name,items])=>({name,value:items.map(item=>'• '+item).join('\n'),inline:false}));
}
function githubURL(url){
 const u=new URL(url);
 if(u.protocol!=='https:'||u.hostname!=='github.com'||u.username||u.password||u.search||u.hash||!u.pathname.startsWith('/'+REPOSITORY+'/'))throw new Error('invalid_github_link');
 return u.href;
}
export function notification(input){
 const titles={development:'Geliştirme tamamlandı',beta:'Beta yayımlandı',rc:'Sürüm adayı yayımlandı',stable:'Stable yayımlandı',failure:'Test başarısız',preview:'Değişiklik önizlemesi'};
 if(!titles[input.kind])throw new Error('invalid_notification_kind');
 if(['beta','rc','stable'].includes(input.kind)&&!input.published)throw new Error('release_evidence_required');
 const fields=[];
 if(input.version)fields.push({name:'Sürüm',value:safeText(input.version,90),inline:true});
 if(input.branch)fields.push({name:'Dal',value:safeText(input.branch,90),inline:true});
 if(input.kind==='failure')fields.push({name:'Durum',value:'CI başarısız. Bu çalışma doğrulanmış kabul edilmedi.',inline:false});
 else if(input.ci==='success')fields.push({name:'Testler',value:'Windows ve Ubuntu CI başarılı.',inline:false});
 else if(input.ci)fields.push({name:'Testler',value:input.ci==='pending'?'CI henüz tamamlanmadı.':'CI başarısı doğrulanmadı.',inline:false});
 if(input.notes)fields.push(...releaseNotes(input.notes));
 if(['beta','rc','stable'].includes(input.kind)&&!fields.some(f=>f.name==='Bilinen sorunlar'))fields.push({name:'Bilinen sorunlar',value:'Sürüm notlarında belirtilmedi.',inline:false});
 if(input.diff){
  const d=input.diff;
  fields.push({name:(d.scope==='commit'?'Commit değişiklikleri':'Karşılaştırma')+(d.partial?' · kısmi veri':''),value:`${d.fileCount} dosya${d.partial?' (API kapsamı)':''}\n\`\`\`diff\n+ ${count(d.additions)} satır\n- ${count(d.deletions)} satır\n\`\`\``,inline:false});
  if(d.names.length)fields.push({name:'Dosyalar',value:d.names.map(p=>'`'+p+'`').join('\n')+(d.hiddenNames?'\nDiğer dosya adları gösterilmedi.':''),inline:false});
 }
 if(input.diffURL)fields.push({name:'Ayrıntılı değişiklikler',value:githubURL(input.diffURL),inline:false});
 const embed={title:titles[input.kind],description:input.example?'ÖRNEK · Gönderilmedi':safeText(input.summary??'Gerçek GitHub verilerinden hazırlandı.',240),color:COFFEE,url:githubURL(input.url),fields,footer:{text:'LabCafe'}};
 const payload={allowed_mentions:{parse:[],users:[],roles:[],replied_user:false},embeds:[embed]};
 validatePayload(payload);return payload;
}
export function validatePayload(payload){
 if(payload.embeds?.length!==1||payload.allowed_mentions?.parse?.length!==0||payload.allowed_mentions?.users?.length!==0||payload.allowed_mentions?.roles?.length!==0||payload.allowed_mentions?.replied_user!==false)throw new Error('unsafe_payload');
 const e=payload.embeds[0];const fields=e.fields??[];
 if(e.title.length>256||e.description.length>4096||fields.length>25||fields.some(f=>f.name.length>256||f.value.length>1024)||[e.title,e.description,e.footer?.text??'',...fields.flatMap(f=>[f.name,f.value])].join('').length>6000)throw new Error('payload_limit');
 return true;
}
export function webhookURL(value){
 if(!value)return null;
 try{
  const u=new URL(value);
  if(u.protocol!=='https:'||!['discord.com','canary.discord.com','ptb.discord.com'].includes(u.hostname)||u.port||u.username||u.password||u.search||u.hash||!/^\/api\/(?:v\d+\/)?webhooks\/\d{17,20}\/[A-Za-z0-9_-]{40,150}$/.test(u.pathname))throw new Error();
  u.searchParams.set('wait','true');return u.href;
 }catch{throw new Error('invalid_webhook_configuration');}
}
export async function sendWebhook(value,payload,{fetchFn=fetch,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),attempts=3}={}){
 if(!value)return {status:'skipped',reason:'webhook_not_configured'};
 const url=webhookURL(value);validatePayload(payload);
 for(let attempt=0;attempt<attempts;attempt++){
  let response;
  try{response=await fetchFn(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(10000)});}
  catch{return {status:'delivery_unknown'};}// Never echo an exception containing the secret URL; do not retry an ambiguous POST.
  if(response.status>=200&&response.status<300)return {status:'sent'};
  if(response.status===429){
   let seconds;try{seconds=(await response.json()).retry_after;}catch{seconds=Number(response.headers.get('retry-after'));}
   if(!Number.isFinite(seconds)||seconds<=0||seconds>30||attempt===attempts-1)return {status:'rate_limited'};
   await sleep(Math.ceil(seconds*1000));continue;
  }
  return {status:response.status>=500?'delivery_unknown':'rejected',httpStatus:response.status};
 }
 return {status:'rate_limited'};
}
