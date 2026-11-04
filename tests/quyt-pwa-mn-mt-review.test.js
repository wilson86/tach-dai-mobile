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
 assert.equal(a.sections.find(x=>x.kind==='b').text,'dn 21 b11n.\nct 21 b11n.');
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
 assert.equal(a.total,'11');assert.equal(a.pretty,'dn 21 b11n.');
 assert.equal(a.sections.find(x=>x.kind==='b').total,'11');
 reject('mn','mt dn 21 b10n',/Miền trong tin khác miền/u);
});
test('the calendar and region must be explicit; wrong station, 2d, and missing station HOLD',()=>{
 reject('mn','mn tn 21 b10n',/phải ghi tên\/mã đài/u);
 reject('mn','21 b10n',/phải ghi tên\/mã đài/u);
 assert.equal(input('mn','2d 21 b10n').total,'20');
 reject('mn','mn dn 21 b10n',/phải chọn ngày/u,{businessDate:''});
 reject('mn','hn 21 b10n',/HN không phải/u);
 reject('mt','mt ct 21 b10n',/phải ghi tên\/mã đài/u);
});
test('unapproved XC and cross-station DA are full HOLD and never partially summed',()=>{
 reject('mn','mn dn 21 xc10n',/XC chưa có quy tắc/u);
 reject('mt','mt dn 21 22 da5n',/ĐÁ liên đài/u);
 reject('mn','mn dn 21 b10n\nmn ct 21 xc5n',/XC chưa có quy tắc/u);
 assert.equal(input('mn','mn dn 21 b10n\n2d 21 b10n').total,'30');
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
test('selected region alone resolves stations without MN/MT labels in Copy',()=>{
 const mn=input('mn','dn 21 b10n\nct 21 b10n',{tick:true});
 assert.equal(mn.pretty,'dn 21 b11n.\nct 21 b11n.');
 assert.equal(mn.total,'22');
 assert.equal(mn.sections.find(x=>x.kind==='b').text,mn.pretty);
 const mt=input('mt','dn 21 b10n',{tick:true});
 assert.equal(mt.pretty,'dn 21 b11n.');
 assert.equal(mt.total,'11');
 reject('mn','21 b10n',/phải ghi tên\/mã đài/u);
 reject('mn','mt dn 21 b10n',/Miền trong tin khác/u);
});
test('2d/3d/2đ/3đ first weekday stations get FULL amount with no implicit division',()=>{
 const a=input('mn','2d 52 b10n',{tick:true});
 assert.equal(a.pretty,'dn 52 b11n.\nct 52 b11n.');
 assert.equal(a.total,'22');assert.equal(a.rows.length,2);
 const b=input('mn','3đ 52 b10n',{tick:true});
 assert.equal(b.total,'33');assert.equal(b.rows.length,3);
 assert.match(b.pretty,/st 52 b11n/u);
 const mt=input('mt','2đ 52 dd10n');
 assert.equal(mt.total,'20');assert.equal(mt.rows.length,2);
 reject('mt','3d 52 b10n',/không đủ 3 đài/u);
});
test('approved Router P001/P002 shorthand: compact periods and 3-digit numbers',()=>{
 const a=input('mn','2d. 52. 852. B10n.\n3d. 43. 83.b 10n');
 assert.equal(a.total,'100');
 assert.equal(a.rows.length,10);
 const b=input('mn','2d 52 b10n\n3d 43 b10n');
 assert.equal(b.total,'50');
});
test('numeric topology never overrides ambiguous or invalid money-bearing clauses',()=>{
 reject('mn','2d',/Thiếu số, loại cược/u);
 reject('mn','2d 52',/(?:Thiếu tiền|Có số chưa ghi)/u);
 reject('mn','3d 43 83 b',/(?:Thiếu tiền|Cú pháp)/u);
 reject('mn','2d 52 52 b10n',/số lặp/u);
 reject('mn','2d 52 b10n\ninvalid',/HOLD/u);
 reject('mn','2d 52 dx5n',/Cú pháp chưa rõ/u);
 reject('mn','3d 52 xc5n',/XC/u);
 reject('mn','2d 52 53 da5n',/ĐÁ liên đài/u);
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

test('user selected MN/MT defines the filtered station, not copied region text',()=>{
 const mn=input('mn','dn 52 b10n',{tick:true});
 const mt=input('mt','dn 52 b10n',{tick:true});
 assert.equal(mn.pretty,'dn 52 b11n.');
 assert.equal(mt.pretty,'dn 52 b11n.');
 assert.equal(mn.total,'11');assert.equal(mt.total,'11');
 assert.equal(mn.rows[0].station,'dn');assert.equal(mt.rows[0].station,'dn');
 assert.equal(mn.pretty.includes('MN'),false);assert.equal(mt.pretty.includes('MT'),false);
 reject('mt','ct 52 b10n',/phải ghi tên\/mã đài/u);
});

test('three separate monetary figures: source stake, expanded exposure, post-Quyt rounded total',()=>{
 const unscaled=input('mn','2d 52 b10n',{tick:false});
 assert.equal(unscaled.sourceTotal,'10');
 assert.equal(unscaled.original,'20');
 assert.equal(unscaled.total,'20');
 assert.equal(unscaled.roundingDiffRows,0);
 const scaled=input('mn','2d 52 b10n',{tick:true});
 assert.equal(scaled.sourceTotal,'10');assert.equal(scaled.original,'20');assert.equal(scaled.total,'22');
 assert.equal(scaled.ceilReference,'22');
 assert.equal(scaled.roundingDiffRows,0);
 const three=input('mn','3d 52 b10n',{tick:true});
 assert.equal(three.sourceTotal,'10');assert.equal(three.original,'30');assert.equal(three.total,'33');
});
test('CEIL monetary reference differs for Quyt BAO/LO, never changes user-approved HALF_UP or DD',()=>{
 const half=input('mn','2d 52 b15n',{tick:true});
 assert.equal(half.sourceTotal,'15');assert.equal(half.original,'30');
 assert.equal(half.total,'32');assert.equal(half.ceilReference,'34');
 assert.equal(half.roundingDiffRows,2);
 const other=input('mn','2d 52 b15n dd5.2n',{tick:true});
 assert.equal(other.sourceTotal,'20.2');assert.equal(other.original,'40.4');
 assert.equal(other.total,'42');assert.equal(other.ceilReference,'44');
 assert.equal(other.roundingDiffRows,2);
 const plain=input('mn','dn 52 b15n',{tick:false});
 assert.equal(plain.total,'15');assert.equal(plain.ceilReference,'15');
});
test('money-risk and manual acknowledgment controls exist on the review page',()=>{
 assert.match(html,/id="ackMoney"[^>]*disabled/u);
 assert.match(html,/id="sourceTotal"/u);
 assert.match(html,/id="roundingAudit"/u);
 assert.match(html,/id="factorReceipt"/u);
 assert.match(html,/function syncCopyGate/u);
 assert.match(html,/KHÔNG nhân hệ số lần nữa/u);
 assert.match(html,/CHƯA DUYỆT GỬI TIỀN THẬT/u);
});

test('3d 5n reveals why HALF_UP and CEILING are different downstream money contracts',()=>{
 const r=input('mn','3d 52 b5n',{tick:true});
 assert.equal(r.sourceTotal,'5');
 assert.equal(r.original,'15');
 assert.equal(r.total,'15');        // 5.335 rounds to 5n at each of 3 stations.
 assert.equal(r.ceilReference,'18'); // CEIL comparison 6n at each station.
 assert.equal(r.roundingDiffRows,3);
 assert.equal(r.rows.length,3);
});


test('unresolved HALF_UP vs CEILING money differences cannot be bypassed by a checkbox',()=>{
 // Expected money receipt stays visible for a HUMAN RECEIVER oracle, but no
 // materialized ticket or clipboard is allowed until the authority agrees.
 const s=html;
 assert.match(s,/if\(res\.roundingDiffRows>0\)/u);
 assert.match(s,/HOLD_CHENH_LECH_LAM_TRON/u);
 assert.match(s,/Copy chỉ xuất số cuối cùng/u);
 assert.match(s,/function copyTicketValid\(ticket\)/u);
 assert.match(s,/staleCopyWarning/u);
 assert.match(s,/Không cho Copy cho đến khi phía nhận duyệt quy tắc/u);
 // The core fixture is intentionally divergent; rejecting is a UI RELEASE gate.
 const r=input('mn','2d 52 b15n',{tick:true});
 assert.equal(r.roundingDiffRows,2);
 assert.equal(r.total,'32');
 assert.equal(r.ceilReference,'34');
});
