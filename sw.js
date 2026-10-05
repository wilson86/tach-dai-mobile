// Bump for every business-rule or shell release. Navigations are network-first
// and cached by exact request URL so /app/ can never poison the root offline page.
const CACHE_NAME = "tach-dai-mobile-v2.0.20-cut-sync";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./station_calendar.generated.js",
  "./business_engine.generated.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith("tach-dai-mobile-") && k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", event => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.pathname.endsWith("/version.json") || url.pathname.endsWith("version.json")) {
    event.respondWith(
      fetch(req, { cache: "no-store" }).catch(() =>
        new Response(JSON.stringify({version:"2.0.20"}), {headers:{"Content-Type":"application/json"}})
      )
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        return res;
      }).catch(() =>
        caches.match(req).then(r => r || caches.match("./index.html").then(root => root || caches.match("./")))
      )
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
      return res;
    }))
  );
});
