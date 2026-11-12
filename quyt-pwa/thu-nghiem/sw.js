/* KTS standalone Quyt, isolated folder only; NO backend access. */
'use strict';
const CACHE='kts-quyt-preview-20261112-v4-mb-dx-pair-two-frames';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icon.svg','./station_calendar.generated.js'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('kts-quyt-preview-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;
 if(req.mode==='navigate'){
  // Offline fallback is allowed ONLY for the verified one-screen MB/MN/MT entry.
  // Do not turn another route or an unvalidated region query into a wager screen.
  // The pinned station calendar is installed atomically alongside the entry.
  const requested=new URL(req.url);
  const root=new URL('./',self.registration.scope).pathname;
  const entry=new URL('./index.html',self.registration.scope).pathname;
  const allowedQuery=[...requested.searchParams].every(([key,value])=>
    (key==='v'&&/^\d{1,12}$/u.test(value))||
    (/^utm_(?:source|medium|campaign|term|content)$/u.test(key)&&value.length<=128));
  const oneScreenEntry=(requested.pathname===root||requested.pathname===entry)&&allowedQuery;
  const hold=()=>new Response('<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KTS — HOLD OFFLINE</title><main style="font-family:system-ui;padding:24px"><h1>HOLD_OFFLINE_ROUTE_UNAVAILABLE</h1><p>Đường dẫn hoặc miền yêu cầu chưa được xác minh khi offline. Kết nối mạng rồi mở lại đúng trang; không dùng kết quả sai miền, ngày hoặc đài và không chuyển tin.</p></main>',{status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
  event.respondWith(fetch(req).catch(()=>oneScreenEntry?caches.match('./index.html').then(cached=>cached||hold()).catch(hold):hold()));
  return;
 }
 event.respondWith(caches.match(req).then(cached=>cached||fetch(req)));
});
