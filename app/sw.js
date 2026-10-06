'use strict';
const CACHE='kts-tach-unified-v1.0.29-shadow-observation-guard';
const CORE=[
  './','./index.html','./unified-core.js','./manifest.webmanifest','./version.json',
  './settlement.html','./settlement-store.js','./settlement-engine.js','./settlement-mb-rules.js',
  './settlement-category-map.js','./settlement-research-defaults.js','./settlement-feature-gates.js',
  './settlement-runtime.js','./settlement-evaluator.js','./settlement-parser-provider.js','./settlement-pipeline.js',
  './settlement-report.js','./settlement-report-dashboard.js','./settlement-shadow.js','./settlement-shadow-runtime.js','./settlement-shadow-guard.js','./settlement-shadow-ui.js','./settlement-attention-ui.js',
  './settlement-observation.js','./settlement-observation-ui.js','./settlement-backup-ui.js','./settlement-message-history.js','./settlement-scope-sync.js',
  './result-service.js','./result-provider.js','./result-auto.js','./result-audit-ui.js','./settlement-ui.js',
  '../icon-192.png','../icon-512.png'
];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('kts-tach-unified-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const req=event.request, url=new URL(req.url);
  if(url.pathname.includes('/api/settlement/parse')||url.pathname.includes('/kts-api/settlement/parse')){
    event.respondWith(fetch(req,{cache:'no-store'}));return;
  }
  if(req.method!=='GET') return;
  if(url.pathname.includes('/api/kqxs')||url.pathname.includes('/kts-api/kqxs')){
    event.respondWith(fetch(req,{cache:'no-store'}));return;
  }
  if(url.pathname.endsWith('/app/version.json')){
    event.respondWith(fetch(req,{cache:'no-store'}).catch(()=>caches.match('./version.json')));return;
  }
  if(req.mode==='navigate'&&url.pathname.includes('/tach-dai-mobile/app')){
    event.respondWith(fetch(req).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy));return res}).catch(()=>caches.match(req).then(r=>r||caches.match('./index.html'))));return;
  }
  if(url.pathname.includes('/tach-dai-mobile/app/')||url.pathname.endsWith('/tach-dai-mobile/icon-192.png')||url.pathname.endsWith('/tach-dai-mobile/icon-512.png')){
    event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy));return res})));
  }
});