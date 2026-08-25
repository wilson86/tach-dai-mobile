// Tách cache theo version để CUT source-sync mới không bị che bởi bundle cũ.
const CACHE_NAME = "tach-dai-mobile-v2.0.3";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS))
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", event => {
  const req = event.request;
  const url = new URL(req.url);

  // version.json luôn ưu tiên mạng để phát hiện bản mới.
  if (url.pathname.endsWith("/version.json") || url.pathname.endsWith("version.json")) {
    event.respondWith(
      fetch(req, { cache: "no-store" }).catch(() =>
        new Response(JSON.stringify({version:"2.0.3"}), {
          headers: { "Content-Type": "application/json" }
        })
      )
    );
    return;
  }

  // Trang chính: network-first để có bản mới ngay khi có mạng.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put("./index.html", copy));
        return res;
      }).catch(() =>
        caches.match("./index.html").then(r => r || caches.match("./"))
      )
    );
    return;
  }

  // Asset: cache-first, fallback network.
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
      return res;
    }))
  );
});
