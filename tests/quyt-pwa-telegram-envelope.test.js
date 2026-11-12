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
test('Quýt BAO/LO plus DD are multiplied once after aggregation',()=>{
 const r=app.merge(wrapped(a)+'\n'+wrapped(b),{...args,tick:true});
 assert.equal(r.total,'18');assert.match(r.pretty,/21 b16n/u);assert.match(r.pretty,/21 dd2n/u);
 assert.equal(app.merge(wrapped(a)+'\n'+wrapped(b),{...args,rate:'invalid',tick:false}).total,'17');
});
test('Wrong sender, invalid timestamp and malformed Telegram headers HOLD',()=>{
 assert.throws(()=>app.merge('[11/4/2026 6:06 PM] Cô Hiền: '+a,args),/Tên khách Telegram/u);
 assert.throws(()=>app.merge('[11/4/2026 6:06 PM] Người lạ: '+a,args),/Tên khách Telegram/u);
 assert.throws(()=>app.merge('[11/4/2026 6:06 PM] Cô Quýt '+a,args),/Header Telegram/u);
 assert.throws(()=>app.merge('[99/4/2026 6:06 PM] Cô Quýt: '+a,args),/Thời gian Telegram/u);
 assert.equal(app.merge('[11/4/2026 6:06 PM] Cô Quýt: 21 b10n',args).total,'10'); // MB HN optional even in Telegram
});
test('Wager-bearing unknown and money without n HOLD without dropping tokens',()=>{
 assert.throws(()=>app.merge(wrapped('hn 21 b10n 99'),args),/chưa ghi loại cược/u);
 assert.throws(()=>app.merge(wrapped('hn 21 xc10n'),args),/XC chưa có quy tắc/u);
 assert.equal(app.merge(wrapped('hn 21 b10'),args).total,'10');
});
test('Duplicated pasted message contents require independent confirmation',()=>{
 const duplicate=wrapped(a)+'\n'+wrapped(a);
 assert.throws(()=>app.merge(duplicate,args),/TIN_TRÙNG_CHƯA_XÁC_NHẬN/u);
 const r=app.merge(duplicate,{...args,duplicateConfirmed:true});
 assert.equal(r.total,'24');assert.equal(r.sourceCount,2);
});
test('Offline release cache marker is updated and UI explains Telegram source',()=>{
 assert.match(html,/Tin nguồn \(không bị sửa\)/u);
 const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
 assert.match(sw,/kts-quyt-standalone-pwa-20261113-v26-factor-cut-clipboard/u);
 assert.doesNotMatch(html,/\b(?:fetch|XMLHttpRequest)\s*\(/u);
});

test('MB accepts bare number first with no HN/station, keeping original text and source total',()=>{
 const raw='21 b10n dd5n';
 const r=app.merge(raw,args);
 assert.equal(r.total,'15');assert.equal(r.sourceCount,1);
 assert.equal(r.rows.length,2);assert.equal(r.sourceTotal,'15');
 assert.doesNotMatch(r.pretty,/^HN\b/u);
 assert.equal(raw,'21 b10n dd5n');
 const scaled=app.merge(raw,{...args,tick:true});
 assert.equal(scaled.total,'16');
 assert.equal(scaled.rows.filter(x=>x.factorApplied).length,2);
});
test('MB pasted multiline and Telegram multiple bodies need no station before each independent line',()=>{
 const raw='21 b10n\n31 dd15n';
 const r=app.merge(raw,args);
 assert.equal(r.sourceCount,2);assert.equal(r.total,'25');
 assert.equal(r.original,'25');assert.doesNotMatch(r.pretty,/^HN\b/u);
 const wrappedBare=wrapped('21 b10n')+'\n'+wrapped('31 dd15n');
 const w=app.merge(wrappedBare,args);
 assert.equal(w.total,'25');assert.equal(w.pretty,r.pretty);
 const mixed=app.merge('HN 21 b10n\n31 dd15n',args);
 assert.equal(mixed.total,'25');assert.equal(mixed.sourceCount,2);
});
test('MB incomplete bare line and invalid region tokens fail atomically, never reusing prior ticket',()=>{
 assert.throws(()=>app.merge('21 b10n\n31',args),/chưa ghi loại cược|chưa rõ|HOLD/u);
 assert.throws(()=>app.merge('21 b10n\nMN 31 dd15n',args),/Cú pháp|HOLD/u);
 assert.throws(()=>app.merge('21 b10n\n531 dd15n',args),/HOLD_3_CHU_SO_KHONG_HOP_LE/u);
});
