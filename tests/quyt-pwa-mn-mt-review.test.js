'use strict';
// Standalone synthetic-only preview tests. No production customer source committed.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'../quyt-pwa');
const html=fs.readFileSync(path.join(root,'mn-mt-review.html'),'utf8');
const calendar=fs.readFileSync(path.join(root,'../station_calendar.generated.js'),'utf8');
const match=html.match(/const OfflineKTS=\(\(\)=>\{[\s\S]*?\}\)\(\);/u);
assert.ok(match,'Expected review-only money engine');
const app=vm.runInNewContext(calendar+'\n'+match[0]+';OfflineKTS;');
const date='2026-11-04';
const input=(region,text,opts={})=>app.merge(text,{customer:'quyt',market:region,businessDate:date,rate:'1.067',tick:false,...opts});
function reject(region,text,re,opts={}){
 assert.throws(()=>input(region,text,opts),re);
}
test('only exact canonical weekday stations MN/MT are eligible',()=>{
 assert.deepEqual(Array.from(app.schedule('mn',date),x=>x[0]),['dn','ct','st']);
 assert.deepEqual(Array.from(app.schedule('mt',date),x=>x[0]),['dn','kh']);
 assert.deepEqual(Array.from(app.schedule('mn','2026-11-05'),x=>x[0]),['tn','ag','bt']);
});
test('source retains two stations as independent money exposures, including same number',()=>{
 const a=input('mn','mn dn 21 b10n\nmn ct 21 b10n',{tick:true});
 assert.equal(a.total,'22');assert.equal(a.rows.length,2);
 assert.equal(a.sections.find(x=>x.kind==='b').text,'MN '+date+'\ndn 21 b11n.\nct 21 b11n.');
 assert.equal(a.sourceCount,2);
 assert.equal(a.sections.reduce((n,s)=>n+BigInt(s.total),0n),22n);
});
test('same station repeated identical text requires order confirmation; never silently dedups',()=>{
 const src='mn dn 21 b10n\nmn dn 21 b10n';
 reject('mn',src,/TIN_TRÙNG_CHƯA_XÁC_NHẬN/u);
 const a=input('mn',src,{tick:true,duplicateConfirmed:true});
 assert.equal(a.total,'21');assert.equal(a.rows.length,1);
 assert.match(a.pretty,/dn 21 b21n/u);
});
test('one named station supports approved selectors B/LO, DD, DAU, DUI',()=>{
 const a=input('mn','mn Cần Thơ 21 b20n dd5n dau2n dui3n');
 assert.equal(a.total,'30');
 assert.equal(a.rows.length,4);
 assert.match(a.pretty,/ct 21 b20n/u);
 assert.match(a.pretty,/ct 21 dd5n/u);
 assert.match(a.pretty,/ct 21 dau2n dui3n/u);
});
test('MT DN disambiguates to Da Nang not MN Dong Nai; date is authoritative',()=>{
 const a=input('mt','mt dn 21 b10n',{tick:true});
 assert.equal(a.total,'11');assert.equal(a.pretty,'MT '+date+'\ndn 21 b11n.');
 assert.equal(a.sections.find(x=>x.kind==='b').total,'11');
 reject('mn','mt dn 21 b10n',/Miền trong tin khác miền/u);
});
test('the calendar and region must be explicit; wrong station, 2d, and missing station HOLD',()=>{
 reject('mn','mn tn 21 b10n',/cần mã hoặc tên đài/u);
 reject('mn','mn 21 b10n',/cần mã hoặc tên đài/u);
 reject('mn','mn 2d 21 b10n',/không tự suy ra/u);
 reject('mn','mn dn 21 b10n',/phải chọn ngày/u,{businessDate:''});
 reject('mn','hn 21 b10n',/HN không phải/u);
 reject('mt','mt ct 21 b10n',/cần mã hoặc tên đài/u);
});
test('unapproved XC and cross-station DA are full HOLD and never partially summed',()=>{
 reject('mn','mn dn 21 xc10n',/XC chưa có quy tắc/u);
 reject('mt','mt dn 21 22 da5n',/ĐÁ liên đài/u);
 reject('mn','mn dn 21 b10n\nmn ct 21 xc5n',/XC chưa có quy tắc/u);
 reject('mn','mn dn 21 b10n\nmn 2d 21 b10n',/không tự suy ra/u);
});
test('Telegram metadata binds to selected business date and customer',()=>{
 const valid='[11/4/2026 6:06 PM] Cô Quýt: mn dn 21 b10n';
 const a=input('mn',valid);
 assert.equal(a.total,'10');
 reject('mn','[11/3/2026 6:06 PM] Cô Quýt: mn dn 21 b10n',/Ngày Telegram khác ngày/u);
 reject('mn','[11/4/2026 6:06 PM] Cô Hiền: mn dn 21 b10n',/Tên khách Telegram không khớp/u);
 assert.equal(input('mn','[4/11/2026 6:06 PM] Cô Quýt: mn dn 21 b10n').total,'10');
 reject('mn','[11/15/2026 6:06 PM] Cô Quýt: mn dn 21 b10n',/Ngày Telegram khác ngày/u);
 assert.equal(input('mt','[11/15/2026 6:06 PM] Cô Quýt: mt kh 21 b10n',
   {businessDate:'2026-11-15'}).total,'10');
});
test('HOLD references the actual physical source line after blank lines',()=>{
 const raw='mn dn 21 b10n\n\nmn ct 21 b10n\n\nmn ct 21 xx10n';
 reject('mn',raw,/tin 5, vị trí/u);
 reject('mn','mn dn 21 b10n\n\nmn tn 21 b10n',/tin 3/u);
 reject('mn','mn dn 21 b10n\n\n[11\/1\/2026 6:06 PM] Cô Quýt: mn ct 21 b10n',/tin 3/u);
});
test('MN and MT never accept a hidden HN marker after a valid station prefix',()=>{
 reject('mn','mn dn hn 21 b10n',/tin HN nằm sau mã đài/u);
 reject('mt','mt dn hn 21 b10n',/tin HN nằm sau mã đài/u);
 assert.equal(input('mn','mn dn 21 b10n').total,'10');
});
test('repeated numbers inside one clause HOLD instead of doubling an ambiguous stake',()=>{
 reject('mn','mn dn 21 21 b10n',/số lặp trong cùng một nhóm cược/u);
 reject('mt','mt dn 45 45 dd5n',/số lặp trong cùng một nhóm cược/u);
 const separate=input('mn','mn dn 21 b10n. 21 b10n',{tick:true});
 assert.equal(separate.total,'21');
 assert.equal(separate.rows.length,1);
 const two=input('mn','mn dn 21 b10n\nmn dn 21 b10n',{tick:true,duplicateConfirmed:true});
 assert.equal(two.total,'21');
});
test('preview HTML remains online-only and cannot change live MB draft or offline SW',()=>{
 assert.match(html,/XEM TRƯỚC ONLINE/u);
 assert.match(html,/BẢN THỬ ONLINE MN\/MT/u);
 assert.match(html,/KTS_MNMT_REVIEW_DRAFT_V1/u);
 assert.doesNotMatch(html,/serviceWorker\.register/u);
 assert.match(html,/src="\.\.\/station_calendar\.generated\.js"/u);
 assert.match(html,/id="businessDate"/u);
 assert.match(html,/id="betSections"/u);
});
