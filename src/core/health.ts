import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { isRestWindow, type RestWindow } from '../observability/discord-metrics.js';

/** Internal loopback endpoint: no identifiers, tokens or configuration. */
export function createHealthServer(ready: () => boolean,observability?:{token:string;snapshot:(range:RestWindow)=>unknown}) {
  if(observability&&!/^[A-Za-z0-9_-]{32,128}$/.test(observability.token))throw new Error('Geçersiz observability erişim anahtarı.');
  return createServer((req, res) => {
    if(req.method==='GET'&&req.url?.startsWith('/metrics')&&observability){
      res.setHeader('Cache-Control','no-store');
      const expected=Buffer.from(`Bearer ${observability.token}`);
      const received=Buffer.from(req.headers.authorization??'');
      if(received.length!==expected.length||!timingSafeEqual(received,expected)){res.writeHead(401);res.end();return;}
      const url=new URL(req.url,'http://127.0.0.1');
      if(url.pathname!=='/metrics'){res.writeHead(404);res.end();return;}
      const range=url.searchParams.get('range')??'1h';
      if(!isRestWindow(range)){res.writeHead(400);res.end();return;}
      try{const payload=JSON.stringify(observability.snapshot(range));res.writeHead(200,{'Content-Type':'application/json'});res.end(payload);}
      catch{res.writeHead(503);res.end();}
      return;
    }
    if (req.method !== 'GET' || req.url !== '/healthz') {
      res.writeHead(404); res.end(); return;
    }
    let healthy = false;
    try { healthy = ready(); } catch { /* A failed dependency is not ready. */ }
    res.writeHead(healthy ? 200 : 503, {
      'Content-Type': 'application/json', 'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify({ ready: healthy }));
  });
}
