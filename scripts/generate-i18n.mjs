import {readFileSync,writeFileSync} from 'node:fs';
import ts from 'typescript';
const combined=readFileSync(new URL('../src/i18n/legal.ts',import.meta.url),'utf8')+'\n'+readFileSync(new URL('../src/i18n/catalog.ts',import.meta.url),'utf8').replace(/import .*?;\r?\n/,'');
const source=ts.transpileModule(combined,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/^export /gm,'');
const browser=String.raw`
let locale='tr';try{locale=localStorage.getItem('labcafe-language')==='en'?'en':'tr';}catch{}
const requested=new URLSearchParams(location.search).get('lang');if(requested==='en'||requested==='tr'){locale=requested;try{localStorage.setItem('labcafe-language',locale);}catch{}}
const originals=new WeakMap();
const excluded='script,style,code,textarea,input,.avatar,.server-card,.guild-card,.account-button,.founder-author,[data-language],[data-language-current],[data-user-content]';
function renderLanguage(){
 document.documentElement.lang=locale;
 const walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
 while(walk.nextNode()){const node=walk.currentNode;if(node.parentElement?.closest(excluded))continue;
   const prior=originals.get(node);if(prior&&prior.translated===node.nodeValue)continue;
   const original=node.nodeValue;const translated=translate(original,locale);if(translated!==original){node.nodeValue=translated;originals.set(node,{original,translated});}
 }
 document.querySelectorAll('[aria-label],[title],[placeholder]').forEach(element=>{if(element.closest(excluded))return;for(const key of ['aria-label','title','placeholder']){const value=element.getAttribute(key);if(value){const next=translate(value,locale);if(next!==value)element.setAttribute(key,next);}}});
 document.querySelectorAll('[data-current-flag]').forEach(el=>{const hidden=el.dataset.currentFlag!==locale;if(el.hidden!==hidden)el.hidden=hidden;});
 document.querySelectorAll('[data-language]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.language===locale)));
 document.querySelectorAll('[data-language-check]').forEach(el=>{const next=el.dataset.languageCheck===locale?'✓':'';if(el.textContent!==next)el.textContent=next;});
 if(locale==='en')document.title=translate(document.title,locale);
}
window.LabCafeLanguage={refresh:renderLanguage,text(value){return translate(value,locale);},set(value){if(value!=='tr'&&value!=='en')return;try{localStorage.setItem('labcafe-language',value);}catch{}const url=new URL(location.href);url.searchParams.set('lang',value);location.assign(url);}};
document.querySelectorAll('[data-standalone-language]').forEach(button=>button.addEventListener('click',()=>window.LabCafeLanguage.set(button.dataset.standaloneLanguage)));
renderLanguage();
let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;renderLanguage();});}).observe(document.body,{childList:true,subtree:true,characterData:true});
`;
writeFileSync(new URL('../dashboard/i18n.js',import.meta.url),'(()=>{\n'+source+'\n'+browser+'\n})();');
