/* KTS standalone Quyt, isolated folder only; NO backend access. */
'use strict';
const CACHE='kts-quyt-standalone-pwa-20261105-v8-mbmnmt-money-safe-source';
const ASSETS=['./','./index.html','./mn-mt-review.html','../station_calendar.generated.js','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('kts-quyt-standalone-pwa-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;
 if(req.mode==='navigate'){
  event.respondWith(fetch(req).catch(async()=>{const cached=await caches.match(req,{ignoreSearch:true});return cached||new Response('HOLD: Trang chưa được lưu ngoại tuyến hoặc không thể kết nối. Không chuyển sang màn hình miền khác.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});}));return;
 }
 event.respondWith(caches.match(req).then(cached=>cached||fetch(req)));
});
