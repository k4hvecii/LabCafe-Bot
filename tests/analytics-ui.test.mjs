import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function frontend(){const sandbox={document:{documentElement:{lang:'tr'},querySelector(){return null;},addEventListener(){}},window:{addEventListener(){}},location:{pathname:'/admin',search:''},URL,URLSearchParams,console};vm.createContext(sandbox);vm.runInContext(readFileSync(new URL('../dashboard/app.js',import.meta.url),'utf8').replace('void init();',''),sandbox);return sandbox;}
test('chart zero-fills missing days and renders accessible, escaped aggregate data',()=>{
 const context=frontend();context.report={range:{startDate:'2026-10-19',endDate:'2026-10-21',unit:'day'},pageviews:[{date:'2026-10-19',count:3},{date:'2026-10-21',count:8}],visitors:[{date:'2026-10-21',count:2}]};
 const bins=vm.runInContext('analyticsBins(report)',context);assert.equal(bins.length,3);assert.equal(bins[1].views,0);assert.equal(bins[2].visitors,2);
 const chart=vm.runInContext('analyticsChart(report)',context);assert.match(chart,/<table>/);assert.match(chart,/role="img"/);assert.match(chart,/chart-visitors/);
 context.rows=[{label:'<img src=x onerror=alert(1)>',count:4}];const table=vm.runInContext("analyticsBreakdown('Pages',rows,'path')",context);assert.ok(!table.includes('<img'));assert.ok(table.includes('&lt;img'));
 assert.match(vm.runInContext('analyticsReport({configured:true,available:false})',context),/ulaşılamıyor/);assert.ok(!vm.runInContext('analyticsReport({configured:true,available:false})',context).includes('analytics-summary'));
});

test('today chart stops at the latest measured hour rather than plotting future zeros',()=>{const context=frontend();context.report={range:{startDate:'2026-10-21',endDate:'2026-10-21',unit:'hour',start:Date.parse('2026-10-20T21:00:00Z'),end:Date.parse('2026-10-21T07:30:00Z')},pageviews:[],visitors:[]};assert.equal(vm.runInContext('analyticsBins(report).length',context),11);});
