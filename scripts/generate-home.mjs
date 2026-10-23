import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
const app={innerHTML:''};
const sandbox={document:{querySelector:selector=>selector==='#app'?app:null,addEventListener(){}},window:{addEventListener(){}},location:{pathname:'/',search:''},URLSearchParams,URL,console};
vm.createContext(sandbox);
vm.runInContext(readFileSync(new URL('../dashboard/app.js',import.meta.url),'utf8').replace('void init();',''),sandbox);
vm.runInContext(`bindShell=()=>{};renderPublicGuilds=()=>{};loadPublicGuilds=async()=>{};state.clientId='100000000000000002';state.supportInviteUrl='https://discord.gg/YOUR_SUPPORT_INVITE';landing();`,sandbox);
const file=new URL('../dashboard/index.html',import.meta.url);
let html=readFileSync(file,'utf8');
html=html.replace(/<div id="app">[\s\S]*?<\/div>\s*<div id="toast"/,`<div id="app"><!--PUBLIC-HOME-->${app.innerHTML}<!--/PUBLIC-HOME--></div>\n  <div id="toast"`);
writeFileSync(file,html);

// Public feature pages share the real shell and are readable without JavaScript.
const { mkdirSync } = await import('node:fs');
mkdirSync(new URL('../dashboard/features/',import.meta.url),{recursive:true});
for(const key of ['dashboard','server-checks','commands']){
 vm.runInContext(`featurePage('${key}');`,sandbox);
 let page=html.replace(/<!--PUBLIC-HOME-->[\s\S]*?<!--\/PUBLIC-HOME-->/,app.innerHTML);
 page=page.replace(/<title>.*?<\/title>/,`<title>${sandbox.document.title}</title>`).replaceAll('https://labcafe.xyz/"',`https://labcafe.xyz/features/${key}"`);
 const description=vm.runInContext(`featurePages['${key}'].description`,sandbox);
 page=page.replace(/<meta name="description" content="[^"]*">/,`<meta name="description" content="${description}">`).replace(/<meta property="og:title" content="[^"]*">/,`<meta property="og:title" content="${sandbox.document.title}">`).replace(/<meta property="og:description" content="[^"]*">/,`<meta property="og:description" content="${description}">`);
 writeFileSync(new URL(`../dashboard/features/${key}.html`,import.meta.url),page);
}
