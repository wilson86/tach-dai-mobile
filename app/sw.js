'use strict';
// Pilot UI refresh: bump the cache key whenever checkbox UX or shell changes.
// The new service worker refreshes unified-core.js for existing pilot installs.
const CACHE='kts-tach-unified-v1.0.21-mb-dot-raw-guard-046935-operator-dx-pairs';
const CORE=['./','./index.html','./unified-core.js','./unified-core.js?ux=1.0.21','./manifest.webmanifest','./version.json','../icon-192.png','../icon-512.png',
  // Parent's Da Vong engine is hosted in the Mobile child iframe. Offline
  // navigation must have its root HTML and the two authoritative adapters.
  '../','../index.html','../sw.js','../station_calendar.generated.js','../business_engine.generated.js'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('kts-tach-unified-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const req=event.request, url=new URL(req.url);
  if(req.method!=='GET') return;
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
