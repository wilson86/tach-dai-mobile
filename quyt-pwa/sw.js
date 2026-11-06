/* KTS standalone Quyt, isolated folder only; NO backend access. */
'use strict';
const CACHE='kts-quyt-standalone-pwa-20261105-v8-route-boundary';
const ASSETS=['./','./index.html','./quyt-cut-ledger.js','./manifest.webmanifest','./icon.svg'];
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
  // The MB index cache is NOT a valid fallback for a one-screen MN/MT or unknown page.
  // Serving another market's form offline can mislead the operator about the ticket scope.
  const path=new URL(req.url).pathname;
  const root=new URL('./',self.registration.scope).pathname;
  const entry=new URL('./index.html',self.registration.scope).pathname;
  const isMbEntry=path===root||path===entry;
  const hold=()=>new Response('<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KTS — Không có bản offline</title><main style="font-family:system-ui;padding:24px"><h1>HOLD_OFFLINE_ROUTE_UNAVAILABLE</h1><p>Trang đã yêu cầu không có bản offline được xác minh. Kết nối lại để mở đúng trang. Không sử dụng trang MB thay cho MN/MT và không chuyển tin khi chưa đối soát.</p></main>',{status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
  event.respondWith(fetch(req).catch(()=>isMbEntry?caches.match('./index.html').then(cached=>cached||hold()).catch(hold):hold()));
  return;
 }
 event.respondWith(caches.match(req).then(cached=>cached||fetch(req)));
});
