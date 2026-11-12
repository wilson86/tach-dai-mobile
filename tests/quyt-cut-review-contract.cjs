'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('Review preview banner is prominent and live app remains independent',()=>{
 const index=read('quyt-cut-review/index.html');
 assert.match(index,/<section class="card" id="reviewOnlyBanner" role="alert"/u);
 assert.match(index,/CHƯA DÙNG TIỀN THẬT/u);
 assert.match(index,/KHÔNG gửi cược hoặc số tiền thật/u);
 assert.match(index,/href="\.\.\/quyt-pwa\/\?v=8"/u);
 assert.match(index,/<script src="\.\/quyt-cut-ledger\.js"><\/script>/u);
 assert.match(index,/KIỂM TRA VÀ GỘP/u);
 assert.match(index,/HOLD_CUT_REPLAY/u);
});
test('Review service worker cannot evict live PWA production cache',()=>{
 const preview=read('quyt-cut-review/sw.js');
 const live=read('quyt-pwa/sw.js');
 assert.match(preview,/kts-quyt-standalone-review-only-20261106-v10-storage-isolation/u);
 assert.match(preview,/k\.startsWith\('kts-quyt-standalone-review-only-'\)/u);
 assert.doesNotMatch(preview,/k\.startsWith\('kts-quyt-standalone-pwa-'\)/u);
 assert.match(preview,/HOLD_OFFLINE_ROUTE_UNAVAILABLE/u);
 assert.match(preview,/\.\/quyt-cut-ledger\.js/u);
 assert.match(live,/kts-quyt-standalone-pwa-20261113-v26-factor-cut-clipboard/u);
});
test('Preview PWA install scope is itself, not main',()=>{
 const manifest=JSON.parse(read('quyt-cut-review/manifest.webmanifest'));
 assert.equal(manifest.scope,'./');
 assert.equal(manifest.start_url,'./');
 assert.match(manifest.name,/KHÔNG DÙNG TIỀN THẬT/u);
 const files=['quyt-cut-review/index.html','quyt-cut-review/quyt-cut-ledger.js','quyt-cut-review/sw.js','quyt-cut-review/manifest.webmanifest','quyt-cut-review/icon.svg'];
 files.forEach(p=>assert.ok(fs.statSync(path.join(root,p)).size>0,p));
});

test('Preview has no production Quyt session/local storage key collisions',()=>{
 const live=read('quyt-pwa/index.html'), preview=read('quyt-cut-review/index.html');
 const keys=s=>Object.fromEntries([...s.matchAll(/(?:const |,)(storageKey|ratesKey|cutStorageKey|cutGuardKey)='([^']+)'/gu)].map(x=>[x[1],x[2]]));
 const prod=keys(live),review=keys(preview);
 assert.equal(prod.storageKey,'KTS_QUYT_3_REGION_REVIEW_DRAFT_V1');
 assert.equal(prod.ratesKey,'KTS_QUYT_3_REGION_REVIEW_RATES_V1');
 assert.deepEqual(review,{storageKey:'KTS_QUYT_REVIEW_V10_DRAFT_V1',
  ratesKey:'KTS_QUYT_REVIEW_V10_RATES_V1',
  cutStorageKey:'KTS_QUYT_REVIEW_V10_SCOPED_CUT_V1',
  cutGuardKey:'KTS_QUYT_REVIEW_V10_CUT_REPLAY_GUARD_V1'});
 assert.equal(new Set(Object.values(review)).size,4);
 assert.match(live,/KTS_OFFLINE_QUYT_DRAFT_V1/u); // read-only legacy migration
 for(const key of Object.values(prod))assert.ok(!Object.values(review).includes(key));
});
