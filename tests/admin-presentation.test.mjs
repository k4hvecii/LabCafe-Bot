import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../dashboard/admin/control.js',import.meta.url),'utf8');
function helpers(){
 const context={localStorage:{getItem:()=>null},location:{hash:''},document:{querySelector:()=>null},console};
 vm.createContext(context);
 vm.runInContext(source.slice(0,source.indexOf('const getBot='))+'globalThis.helpers={when,bytes,icon,iconPaths};})();',context);
 return context.helpers;
}
test('admin missing and invalid measurement dates stay neutral',()=>{
 const {when,bytes}=helpers();
 for(const input of [NaN,Infinity,-Infinity,null,undefined,'2026-01-01',8.64e15+1])assert.equal(when(input),'—');
 assert.notEqual(when(0),'—');
 for(const input of [NaN,Infinity,null])assert.equal(bytes(input),'—');
});
test('admin icons are local, labelled by surrounding controls, and keyboard inert',()=>{
 const {icon,iconPaths}=helpers();
 for(const key of Object.keys(iconPaths)){
  const svg=icon(key);
  assert.match(svg,/viewBox="0 0 24 24"/);
  assert.match(svg,/aria-hidden="true" focusable="false"/);
  assert.match(svg,/stroke="currentColor"/);
  assert.doesNotMatch(svg,/https?:|<script|onload|<text/);
 }
 assert.equal(icon('unknown'),icon('overview'));
});
