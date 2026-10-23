import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../dashboard/app.js',import.meta.url),'utf8');
test('language-only settings change opens approval with a readable diff',()=>{
 const start=source.indexOf("document.querySelector('#save')?.addEventListener('click',()=>{");
 const end=source.indexOf("document.querySelector('#confirm-save')",start);
 const diff={innerHTML:''};let opened=false;let handler;
 const document={querySelector(selector){return selector==='#save'?{addEventListener(event,fn){handler=fn;}}:selector==='#save-diff'?diff:{showModal(){opened=true;}};}};
 vm.runInNewContext(source.slice(start,end),{document,state:{saving:false,settings:{locale:'tr'},draft:{locale:'en'},guild:{channels:[]}},dirty:()=>true,escape:value=>value});
 handler();assert.equal(opened,true);assert.match(diff.innerHTML,/Türkçe → English/);
});
test('workspace navigation preserves drafts and writes an English view URL',()=>{
 const start=source.indexOf('function setWorkspaceView(');const end=source.indexOf('function renderContent()',start);
 const state={view:'overview',guild:{id:'123456789012345678'},draft:{locale:'en'}};let url;let rendered=0;
 const context={state,URLSearchParams,location:{search:'?guild=123456789012345678'},history:{replaceState(a,b,value){url=value;}},renderContent(){rendered++;},focusContent(){}};
 vm.runInNewContext(source.slice(start,end),context);vm.runInNewContext("setWorkspaceView('history')",context);
 assert.equal(state.view,'history');assert.equal(state.draft.locale,'en');assert.equal(url,'/dashboard?guild=123456789012345678&view=history');assert.equal(rendered,1);
 vm.runInNewContext("setWorkspaceView('invalid')",context);assert.equal(rendered,1);
});
