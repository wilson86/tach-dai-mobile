'use strict';
const CACHE='kts-tach-unified-v1.0.64-missing-config-ux';
const CORE=[
  './','./index.html','./unified-core.js','./manifest.webmanifest','./version.json',
  './settlement.html','./settlement-store.js','./settlement-engine.js','./settlement-mb-rules.js',
  './settlement-category-map.js','./settlement-research-defaults.js','./settlement-feature-gates.js',
  './settlement-runtime.js','./settlement-evaluator.js','./settlement-parser-provider.js','./settlement-pipeline.js','./settlement-pricing-copy.js',
  './settlement-report.js','./settlement-report-dashboard.js','./settlement-shadow.js','./settlement-shadow-runtime.js','./settlement-regression-cases.js','./settlement-shadow-guard.js','./settlement-shadow-ui.js','./settlement-shadow-batch.js','./settlement-regression-candidates.js','./settlement-regression-review.js','./settlement-repair-workflow.js','./settlement-parser-replay.js','./settlement-repair-readiness.js','./settlement-qualification-dashboard.js','./settlement-build-identity.js','./settlement-qualification-history.js','./settlement-qualification-history-bridge.js','./settlement-preproduction-package.js','./settlement-preproduction-review.js','./settlement-preproduction-review-history.js','./settlement-preproduction-review-bundle.js','./settlement-preproduction-receipt.js','./settlement-preproduction-handoff.js','./settlement-preproduction-offline-verifier.js','./settlement-preproduction-candidate.js','./settlement-preproduction-boundary.js','./settlement-preproduction-audit-pack.js','./settlement-preproduction-audit-offline-verifier.js','./settlement-preproduction-decision-dossier.js','./settlement-preproduction-freeze-manifest.js','./settlement-preproduction-decision-recheck.js','./settlement-preproduction-review-session.js','./settlement-preproduction-orchestrator.js','./settlement-attention-ui.js',
  './settlement-observation.js','./settlement-observation-ui.js','./settlement-backup-ui.js','./settlement-message-history.js','./settlement-scope-sync.js','./settlement-report-simple-ui.js',
  './result-service.js','./result-provider.js','./result-auto.js','./result-simple-ui.js','./result-audit-ui.js','./settlement-ui.js','./settlement-consumer-ui.js',
  '../icon-192.png','../icon-512.png'
];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('kts-tach-unified-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const req=event.request, url=new URL(req.url);
  if(url.pathname.includes('/api/settlement/parse')||url.pathname.includes('/kts-api/settlement/parse')||url.pathname.includes('/api/settlement/parser-identity')||url.pathname.includes('/kts-api/settlement/parser-identity')){
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
