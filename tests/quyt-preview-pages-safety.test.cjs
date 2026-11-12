'use strict';
// WILSON86: public preview path safety and source provenance. No customer data.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..','quyt-pwa'),preview=path.join(root,'thu-nghiem');
const read=(dir,name)=>fs.readFileSync(path.join(dir,name));
const html=read(preview,'index.html').toString('utf8');
const sw=read(preview,'sw.js').toString('utf8');
const manifest=JSON.parse(read(preview,'manifest.webmanifest').toString('utf8'));
test('PREVIEW HTML/calendar/icon byte-for-byte match exact PR Quýt one-screen candidate',()=>{
 for(const name of ['index.html','station_calendar.generated.js','icon.svg'])
  assert.deepEqual(read(root,name),read(preview,name),'source mismatch '+name);
 assert.match(html,/HOLD_QUYT_V2_MONEY_CONTRACT/u);
 assert.match(html,/HOLD_RECEIVER_MARKET_UNAPPROVED/u);
 assert.match(html,/HOLD_3_CHU_SO_KHONG_HOP_LE/u);
 assert.match(html,/const quytFactorEligible=row/u);
 assert.match(html,/function receiverMarketApproved\(\)\{return market.value==='mb'&&!\(customer.value==='quyt'&&tick.checked\)\}/u);
 assert.doesNotMatch(html,/navigator\.sendBeacon|Telegram\.send|XMLHttpRequest/u);
});
test('PREVIEW service worker can never purge official Quýt PWA caches',()=>{
 assert.match(sw,/const CACHE='kts-quyt-preview-20261113-v8-assets-version-pin'/u);
 assert.match(sw,/k\.startsWith\('kts-quyt-preview-'\)/u);
 assert.doesNotMatch(sw,/k\.startsWith\('kts-quyt-standalone-pwa-'\)/u);
 assert.match(sw,/const ASSETS=\['\.\/','\.\/index\.html','\.\/manifest\.webmanifest','\.\/icon\.svg','\.\/station_calendar\.generated\.js','\.\/quyt-source-cut-ledger\.js','\.\/quyt-live-cut-ui\.js'\]/u);
 assert.match(html,/navigator\.serviceWorker\.register\('\.\/sw\.js',\{scope:'\.\/'\}\)/u);
 const scope=new URL('https://wilson86.github.io/tach-dai-mobile/quyt-pwa/thu-nghiem/');
 for(const relative of ['./sw.js','./index.html','./station_calendar.generated.js','./manifest.webmanifest'])
  assert.ok(new URL(relative,scope).pathname.startsWith(scope.pathname));
 assert.ok(!scope.pathname.startsWith('/tach-dai-mobile/quyt-pwa/index.html'));
});
test('PREVIEW install label is conspicuously TEST ONLY and same-folder scoped',()=>{
 assert.match(manifest.name,/THỬ NGHIỆM/u);
 assert.match(manifest.short_name,/TEST/u);
 assert.match(manifest.description,/không được Copy/u);
 assert.equal(manifest.start_url,'./');assert.equal(manifest.scope,'./');
 assert.match(html,/BẢN ĐỐI CHIẾU QUÝT V4/u);
 assert.match(html,/KHÔNG COPY/u);
});
