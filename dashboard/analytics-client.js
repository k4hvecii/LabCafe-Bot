(() => {
  if(new URLSearchParams(location.search).get('analytics')==='off'||navigator.doNotTrack==='1'||navigator.globalPrivacyControl===true)return;
  const paths=new Set(['/','/dashboard','/features/dashboard','/features/server-checks','/features/commands','/terms-of-service','/privacy-policy','/data-deletion']);
  if(!paths.has(location.pathname))return;
  let allowed=false;const utm={};const query=new URLSearchParams(location.search);
  for(const key of ['source','medium','campaign']){const value=query.get('utm_'+key);if(value&&/^[a-z][a-z0-9_-]{0,63}$/i.test(value)&&! /\d{8,}/.test(value))utm[key]=value;}
  const events=new Set(['invite_click','dashboard_opened','server_selected','analysis_started','analysis_completed','setting_change_started','setting_change_confirmed','setting_change_succeeded','setting_change_failed','docs_click','feature_view']);
  const send=(event,performance)=>{
    if(!allowed||!paths.has(location.pathname))return;
    const payload={path:location.pathname,language:navigator.language,screen:`${Math.round(screen.width/100)*100}x${Math.round(screen.height/100)*100}`,referrer:document.referrer,...(event?{event}:{}),...(Object.keys(utm).length?{utm}:{}),...(performance?{performance}:{})};
    const body=JSON.stringify(payload);
    if(navigator.sendBeacon){navigator.sendBeacon('/metrics/collect',new Blob([body],{type:'application/json'}));return;}
    void fetch('/metrics/collect',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body,keepalive:true}).catch(()=>{});
  };
  window.labcafeTrack=name=>{if(events.has(name))send(name);};
  void fetch('/api/session',{credentials:'same-origin'}).then(r=>r.ok?r.json():null).then(async session=>{
    if(!session||session.isOwner===true)return;allowed=true;send();
    if(location.pathname==='/dashboard'&&session.authenticated)send('dashboard_opened');
    if(location.pathname.startsWith('/features/'))send('feature_view');
    try{
      const vitals=await import('/web-vitals.js');let pending={};let timer;
      const report=metric=>{const key=metric.name.toLowerCase();if(!['lcp','inp','cls','fcp','ttfb'].includes(key))return;const value=Number(metric.value);if(!Number.isFinite(value)||value<0||value>(key==='cls'?100:60000))return;pending[key]=Math.round(value*1000)/1000;clearTimeout(timer);timer=setTimeout(flush,800);};
      const flush=()=>{if(Object.keys(pending).length){send('web_vitals',pending);pending={};}};
      for(const method of ['onLCP','onINP','onCLS','onFCP','onTTFB'])vitals[method]?.(report);
      document.addEventListener('visibilitychange',()=>{if(document.hidden)flush();});
    }catch{/* Performance measurement never blocks the website. */}
  }).catch(()=>{});
  document.addEventListener('click',event=>{
    if(!(event.target instanceof Element))return;const link=event.target.closest('a[href]');if(!link)return;
    try{const url=new URL(link.href);if(url.origin==='https://discord.com'&&url.pathname==='/oauth2/authorize')send('invite_click');if(/gitbook\.(io|com)$/.test(url.hostname))send('docs_click');}catch{}
  });
})();
