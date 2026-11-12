'use strict';
const t=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..','quyt-pwa');
const source=(folder,name)=>fs.readFileSync(path.join(root,folder,name));
const main=source('.','index.html').toString('utf8'),preview=source('thu-nghiem','index.html').toString('utf8');
const officialSW=source('.','sw.js').toString('utf8'),previewSW=source('thu-nghiem','sw.js').toString('utf8');
t('Official Quýt is EXACTLY the new two-box review app, not old Bao-only app',()=>{
 assert.equal(main,preview);
 assert.match(main,/Kết quả gộp — CHỈ 2 KHUNG/u);
 assert.match(main,/ĐÃ NHÂN HỆ SỐ QUÝT/u);
 assert.match(main,/KHÔNG NHÂN HỆ SỐ — GIỮ NGUYÊN/u);
 assert.doesNotMatch(main,/MỞ GỘP CHUNG MB \/ MN \/ MT \(BẢN THỬ\)/u);
 assert.doesNotMatch(main,/TỔNG GỐC \(CHƯA LÀM TRÒN\)/u);
 assert.match(main,/normalizeApprovedBareStakes\(raw\)/u);
 assert.match(main,/<option value="mb">MB<\/option>/u);
 assert.doesNotMatch(main,/MB \/ HN/u);
 for(const id of ['scaledTicket','unscaledTicket','copyScaled','copyUnscaled'])
   assert.match(main,new RegExp('id="'+id+'"','u'));
 assert.match(main,/id="moneyAcknowledgment" hidden/u);
 assert.match(main,/copyUnscaled'\).addEventListener\('click'/u);
 assert.match(main,/copyScaled'\).disabled=true/u);
 assert.match(main,/HOLD_QUYT_V2_MONEY_CONTRACT/u);
});
t('Exactly two visible result frames; old grouped and Copy cards never visible or focusable',()=>{
 assert.equal([...main.matchAll(/class="total"/gu)].length,2);
 assert.match(main,/#groupedResultsCard,#combinedResultsCard\{display:none!important\}/u);
 assert.match(main,/id="groupedResultsCard" hidden inert aria-hidden="true"/u);
 assert.match(main,/id="combinedResultsCard" hidden inert aria-hidden="true"/u);
 assert.match(main,/function receiverMarketApproved\(\)\{return market.value==='mb'&&!\(customer.value==='quyt'&&tick.checked\)\}/u);
});
t('Distinct official vs preview PWA cache namespaces and byte-identical generated station calendar',()=>{
 assert.match(officialSW,/kts-quyt-standalone-pwa-20261112-v21-source-cut-ledger/u);
 assert.match(officialSW,/k\.startsWith\('kts-quyt-standalone-pwa-'\)/u);
 assert.match(previewSW,/kts-quyt-preview-20261112-v5-source-cut-ledger/u);
 assert.match(previewSW,/k\.startsWith\('kts-quyt-preview-'\)/u);
 assert.doesNotMatch(previewSW,/k\.startsWith\('kts-quyt-standalone-pwa-'\)/u);
 assert.deepEqual(source('.','station_calendar.generated.js'),source('thu-nghiem','station_calendar.generated.js'));
 const a='https://wilson86.github.io/tach-dai-mobile/quyt-pwa/';
 assert.notEqual(new URL('./sw.js',a).pathname,new URL('./sw.js',a+'thu-nghiem/').pathname);
});
