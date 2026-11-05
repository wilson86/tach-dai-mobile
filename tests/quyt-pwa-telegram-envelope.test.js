'use strict';
// Synthetic fixtures only; the public repository contains no real customer ticket.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'../quyt-pwa');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const source=html.match(/const OfflineKTS=\(\(\)=>\{[\s\S]*?\}\)\(\);/u);
assert.ok(source,'offline core must exist');
const app=vm.runInNewContext(source[0]+';OfflineKTS;');
const args={market:'mb',customer:'quyt',tick:false,rate:'1.067'};
const a='hn 21 b10n dd2n', b='hn 21 b5n';
const wrapped=s=>'[11/4/2026 6:06 PM] Cô Quýt: '+s;
test('Telegram headers for two distinct messages with same timestamp are accepted',()=>{
 const t=app.merge(wrapped(a)+'\n'+wrapped(b),args), bare=app.merge(a+'\n'+b,args);
 assert.equal(t.total,'17');assert.equal(t.sourceCount,2);assert.equal(t.pretty,bare.pretty);
 assert.match(t.pretty,/21 b15n/u);assert.match(t.pretty,/21 dd2n/u);
});
test('Only Quýt BAO/LO is multiplied once, including decimal amount',()=>{
 const r=app.merge(wrapped(a)+'\n'+wrapped(b),{...args,tick:true});
 assert.equal(r.total,'18');assert.match(r.pretty,/21 b16n/u);assert.match(r.pretty,/21 dd2n/u);
 assert.equal(app.merge(wrapped(a)+'\n'+wrapped(b),{...args,rate:'invalid',tick:false}).total,'17');
});
test('Wrong sender, invalid timestamp, malformed header and missing HN HOLD',()=>{
 assert.throws(()=>app.merge('[11/4/2026 6:06 PM] Cô Hiền: '+a,args),/Tên khách Telegram/u);
 assert.throws(()=>app.merge('[11/4/2026 6:06 PM] Người lạ: '+a,args),/Tên khách Telegram/u);
 assert.throws(()=>app.merge('[11/4/2026 6:06 PM] Cô Quýt '+a,args),/Header Telegram/u);
 assert.throws(()=>app.merge('[99/4/2026 6:06 PM] Cô Quýt: '+a,args),/Thời gian Telegram/u);
 assert.throws(()=>app.merge('[11/4/2026 6:06 PM] Cô Quýt: 21 b10n',args),/phải bắt đầu bằng HN/u);
});
test('Wager-bearing unknown and money without n HOLD without dropping tokens',()=>{
 assert.throws(()=>app.merge(wrapped('hn 21 b10n 99'),args),/chưa ghi loại cược/u);
 assert.throws(()=>app.merge(wrapped('hn 21 xc10n'),args),/XC chưa có quy tắc/u);
 assert.throws(()=>app.merge(wrapped('hn 21 b10'),args),/THIEU_N_CAN_XAC_NHAN/u);
});
test('Duplicated pasted message contents require independent confirmation',()=>{
 const duplicate=wrapped(a)+'\n'+wrapped(a);
 assert.throws(()=>app.merge(duplicate,args),/TIN_TRÙNG_CHƯA_XÁC_NHẬN/u);
 const r=app.merge(duplicate,{...args,duplicateConfirmed:true});
 assert.equal(r.total,'24');assert.equal(r.sourceCount,2);
});
test('Offline release cache marker is updated and UI explains Telegram source',()=>{
 assert.match(html,/Dán <b>nguyên văn Telegram<\/b>/u);
 const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
 assert.match(sw,/kts-quyt-standalone-pwa-20261105-v8-route-boundary/u);
 assert.doesNotMatch(html,/\b(?:fetch|XMLHttpRequest)\s*\(/u);
});
