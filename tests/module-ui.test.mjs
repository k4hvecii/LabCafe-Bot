import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../dashboard/app.js',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf('function moduleHeading('),source.indexOf('function setWorkspaceView('));
function render(expression,state){return vm.runInNewContext(helpers+'\n'+expression,{state,icon:()=>'<svg></svg>',document:{documentElement:{lang:'tr'}},escape:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')});}
test('command details use saved channel rules, escape data and exempt settings command',()=>{
 const html=render('guildCommandsPage()',{commands:[{name:'ayarlar',description:'Ayarlar'},{name:'ping',description:'<script>private</script>'}],settings:{commandChannelId:'saved'},draft:{commandChannelId:'pending'},guild:{channels:[{id:'saved',name:'saved-channel'},{id:'pending',name:'unapproved-channel'}]}});
 assert.match(html,/Tüm kanallar/);assert.match(html,/# saved-channel/);assert.doesNotMatch(html,/unapproved-channel/);assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);assert.equal((html.match(/class="command-detail"/g)||[]).length,2);
});
test('attention findings are expanded while informational findings remain collapsed',()=>{
 const html=render('guildChecksPage()',{analysis:{checkedAt:'2026-10-22T10:00:00Z',checks:[{label:'Eksik',ok:false,detail:'Review'},{label:'Bilgi',ok:null,status:'info',detail:'Info'}]}});
 assert.match(html,/data-result="warning" open/);assert.doesNotMatch(html,/data-result="info" open/);assert.match(html,/Dikkat gerekiyor/);
});
