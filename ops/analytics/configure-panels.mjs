import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
process.loadEnvFile('/etc/labcafe/dashboard.env');
const base=process.env.ANALYTICS_URL;
const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:process.env.ANALYTICS_USERNAME,password:process.env.ANALYTICS_PASSWORD})});
if(!login.ok)throw Error('Provider login failed');
const {token}=await login.json();const headers={'Content-Type':'application/json',Authorization:'Bearer '+token};
async function api(path,method='GET',body){const res=await fetch(base+'/api'+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})});if(!res.ok)throw Error(path+' status '+res.status);return res.json();}
const website=process.env.ANALYTICS_WEBSITE_ID;
const list=v=>Array.isArray(v)?v:v.data??[];
const knownGoals=list(await api('/websites/'+website+'/goals'));
const goal=knownGoals.find(x=>x.name==='LabCafe — Bot Ekle Tıklaması')??await api('/websites/'+website+'/goals','POST',{name:'LabCafe — Bot Ekle Tıklaması',parameters:{type:'event',value:'bot_add_click'}});
const knownFunnels=list(await api('/websites/'+website+'/funnels'));
const funnel=knownFunnels.find(x=>x.name==='LabCafe — Ana Sayfa → Bot Ekle')??await api('/websites/'+website+'/funnels','POST',{name:'LabCafe — Ana Sayfa → Bot Ekle',description:'Anonim ziyaretin ana sayfa ve bot ekleme tıklaması adımları. Gerçek Discord kurulum başarısı değildir.',parameters:{window:60,steps:[{type:'path',value:'/'},{type:'event',value:'bot_add_click'}]}});
const component=(type,title,props={})=>({id:randomUUID(),size:1,component:{type,title,props}});
const row=(size,...columns)=>({id:randomUUID(),size,columns});
const rows=[
 row(100,component('WebsiteMetricsBar','Trafik özeti')),
 row(310,component('WorldMap','Ziyaretçi haritası'),component('WeeklyTraffic','Gün ve saat yoğunluğu')),
 row(310,component('WebsiteChart','Ziyaret eğilimi'),component('EventsChart','Web etkileşimleri')),
 row(300,component('MetricsTable','Trafik kaynakları',{type:'referrer',limit:20}),component('MetricsTable','Sayfalar',{type:'path',limit:20})),
 row(290,component('MetricsTable','Cihazlar',{type:'device',limit:10}),component('MetricsTable','Ülkeler',{type:'country',limit:20})),
 row(290,component('Goal','Bot ekleme ilgisi',{reportId:goal.id}),component('Funnel','Ana sayfa → tıklama',{reportId:funnel.id})),
 row(120,component('TextBlock','Ölçüm kapsamı',{text:'Veriler 21 Ekim 2026 itibarıyla birikir. Bot ekleme tıklaması, Discord kurulumu değildir. Doğrulanmış giriş/katılım toplamları LabCafe Yönetimi sayfasındadır. Kampanya, replay ve performans ölçümü etkin değildir.'}))
];
const known=list(await api('/boards'));
async function board(name,description,rows){return known.find(x=>x.name===name)??api('/boards','POST',{type:'website',name,description,parameters:{websiteId:website,rows}});}
const overview=await board('LabCafe — Trafik Merkezi','Trafik, davranış, coğrafya ve dönüşüm ilgisi.',rows);
const live=await board('LabCafe — Canlı Trafik','Son dakikalardaki anonim ziyaret hareketleri.',[
 row(100,component('RealtimeHeader','Canlı özet')),
 row(300,component('RealtimeChart','Dakikalık trafik'),component('RealtimeActiveUsers','Aktif ziyaretçiler')),
 row(310,component('WorldMap','Ülkeler'),component('MetricsTable','Sayfalar',{type:'path',limit:20}))
]);
if(!await api('/dashboard')){
 const dashboardRows=rows.map(r=>({...r,columns:r.columns.map(c=>({...c,component:{...c.component,entityType:'website',entityId:website,websiteId:website}}))}));
 await api('/dashboard','POST',{name:'LabCafe — Genel Bakış',description:'Site trafiği ve davranış raporları.',parameters:{websiteId:website,rows:dashboardRows}});
}
const file='/opt/labcafe-analytics/credentials.json';const stored=JSON.parse(readFileSync(file,'utf8'));stored.nativeBoardId=overview.id;stored.liveBoardId=live.id;stored.clickGoalId=goal.id;stored.clickFunnelId=funnel.id;writeFileSync(file,JSON.stringify(stored),{mode:0o600});
console.log('Configured two private native boards, click goal and ordered page-to-click funnel. No traffic seeded.');
