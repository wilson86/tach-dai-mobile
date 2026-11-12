'use strict';
// WILSON86 synthetic navigation release gate: protect original Quýt app source.
const t=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.join(__dirname,'..','quyt-pwa');
const main=fs.readFileSync(path.join(root,'index.html'),'utf8');
const preview=fs.readFileSync(path.join(root,'thu-nghiem','index.html'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'));
const gitBlob=source=>{const b=Buffer.from(source);return crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex')};
const start='<!-- KTS_QUYT_LINK_ENTRY_REVIEW_START -->',end='<!-- KTS_QUYT_LINK_ENTRY_REVIEW_END -->';
const originalBlob='f486295ede0f99cc941ecebbe1730c89a1d1277d';
const originalSWBlob='b21e620b5a97a05a16ac369b81a6990e84123918';
t('main Quýt source differs ONLY by isolated navigation section; all legacy business code identical',()=>{
 assert.equal(main.split(start).length,2);assert.equal(main.split(end).length,2);
 const clean=main.slice(0,main.indexOf(start))+main.slice(main.indexOf(end)+end.length+1);
 assert.equal(gitBlob(clean),originalBlob);
 assert.equal(gitBlob(sw),originalSWBlob);
});
t('original Quýt URL offers prominent one-click same-origin entry to 3-market review without changing app money',()=>{
 const fragment=main.slice(main.indexOf(start),main.indexOf(end)+end.length);
 assert.match(fragment,/id="quyt-three-region-open" href="\.\/thu-nghiem\/"/u);
 assert.match(fragment,/MỞ GỘP CHUNG MB \/ MN \/ MT \(BẢN THỬ\)/u);
 assert.match(fragment,/KHÓA COPY cược đã nhân hệ số/u);
 assert.match(fragment,/Không gửi tiền cược thật/u);
 assert.match(fragment,/phần cũ/u);
 assert.ok(main.indexOf(start)<main.indexOf('id="customer"'));
 assert.doesNotMatch(fragment,/<script|<iframe|<form|onclick=|fetch\(/iu);
 const url=new URL('./thu-nghiem/','https://wilson86.github.io/tach-dai-mobile/quyt-pwa/index.html');
 assert.equal(url.href,'https://wilson86.github.io/tach-dai-mobile/quyt-pwa/thu-nghiem/');
 assert.match(preview,/HOLD_QUYT_V2_MONEY_CONTRACT/u);
 assert.match(preview,/HOLD_RECEIVER_MARKET_UNAPPROVED/u);
});
