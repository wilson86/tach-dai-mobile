'use strict';
// WILSON86: one-link three-region review guard; all tickets synthetic.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'quyt-pwa/index.html'),'utf8');
const source=html.match(/const OfflineKTS=\(\(\)=>\{[\s\S]*?\}\)\(\);/u);
assert.ok(source,'three-region engine not found in SAME index.html');
const calendar=fs.readFileSync(path.join(root,'station_calendar.generated.js'),'utf8');
const app=vm.runInNewContext(calendar+'\n'+source[0]+';OfflineKTS;');
const opts={market:'mn',businessDate:'2026-11-12',customer:'quyt',tick:true,rate:'1.067'};
test('one existing URL genuinely supports MB and MN/MT with generated station calendar',()=>{
 assert.match(html,/<option value="mb">MB \/ HN<\/option>/u);
 assert.match(html,/<option value="mn">MN<\/option>/u);
 assert.match(html,/<option value="mt">MT<\/option>/u);
 assert.match(html,/id="businessDate"/u);
 assert.match(html,/id="checkMerge"/u);
 assert.equal(app.merge('hn 21 b10n',{...opts,market:'mb'}).total,'11');
 assert.ok(app.schedule('mn','2026-11-12').some(x=>x[0]==='tn'));
});
test('TN correct date gives 320n Bao and 0n others, but Router CEIL is 322n so Copy must HOLD',()=>{
 const input='Tn 42 43 bl 150n';
 const out=app.merge(input,opts);
 assert.equal(out.total,'320');assert.equal(out.roundingDiffRows,2);
 assert.equal(out.ceilReference,'322');
 assert.equal(out.sections.find(x=>x.kind==='b').total,'320');
 assert.equal(out.rows.length,2); // synthetic two-number source, case and spaces preserved
 assert.equal(out.sections.filter(x=>x.kind!=='b').reduce((n,s)=>n+BigInt(s.total),0n),0n);
 assert.equal(input,'Tn 42 43 bl 150n');
 assert.match(html,/if\(res\.roundingDiffRows>0\)/u);
 assert.match(html,/HOLD_CHENH_LECH_LAM_TRON/u);
 assert.match(html,/ack\.disabled=true/u);
});
test('wrong TN weekday or missing date and unclear station HOLD and do not emit a money result',()=>{
 assert.throws(()=>app.merge('tn 42 43 bl150n',{...opts,businessDate:'2026-11-13'}),/HOLD|đài/u);
 assert.throws(()=>app.merge('tn 42 43 bl150n',{...opts,businessDate:''}),/chọn ngày/u);
 assert.throws(()=>app.merge('42 43 bl150n',opts),/HOLD|đài/u);
 assert.throws(()=>app.merge('hn 42 bl10n',{...opts,market:'mn'}),/HN/u);
});
test('UI exposes only two canonical summary amounts, keeps audits and receipt acceptance',()=>{
 assert.equal([...html.matchAll(/class="total"/gu)].length,2);
 for(const name of ['baoTotal','otherTotal','baoLabel','factorReceipt','roundingAudit','ackMoney','result'])assert.match(html,new RegExp('id="'+name+'"','u'));
 assert.doesNotMatch(html,/id="sourceTotal"|id="before"|id="after"/u);
 assert.match(html,/function showTwoTotals\(result\)/u);
 assert.match(html,/HOLD_SUMMARY_MONEY_MISMATCH/u);
 assert.match(html,/KTS_OFFLINE_QUYT_DRAFT_V1/u);
 assert.match(html,/KTS_OFFLINE_QUYT_RATES_V1/u);
 assert.doesNotMatch(html,/navigator\.sendBeacon|XMLHttpRequest|Telegram\.send/u);
});
test('receiver market scope HOLD runs before materializing MN/MT ticket or receipt',()=>{
 const guard=html.indexOf('if(!receiverMarketApproved()){');
 const start=html.indexOf('const res=OfflineKTS.merge(');
 const materialize=html.indexOf('current={...res');
 assert.ok(start>=0&&guard>start&&materialize>guard);
 const branch=html.slice(guard,materialize);
 assert.match(branch,/showTwoTotals\(res\)/u);
 assert.match(branch,/HOLD_RECEIVER_MARKET_UNAPPROVED/u);
 assert.match(branch,/message\(/u);
 assert.match(branch,/return;/u);
 assert.doesNotMatch(branch,/out\.value=res\.pretty/u);
 assert.match(html,/const can=Boolean\(receiverMarketApproved\(\)&&currentValid\(\)/u);
 assert.match(html,/function copyTicketValid\(ticket\)\{return Boolean\(receiverMarketApproved\(\)/u);
});
test('Quýt V2 performs per-customer per-type aggregate BEFORE one multiplier, never per message',()=>{
 const optsMB={...opts,market:'mb'};
 const raw='hn 21 dd5n dau5n dui5n\nhn 21 dd5n dau5n dui5n';
 const out=app.merge(raw,{...optsMB,duplicateConfirmed:true});
 for(const k of ['dd','dau','dui'])assert.equal(out.sections.find(s=>s.kind===k).total,'11');
 assert.equal(out.total,'33'); // 3 canonical groups: (5+5)*1.067 -> 11 each
 const plain=app.merge(raw,{...optsMB,tick:false,duplicateConfirmed:true});
 assert.equal(plain.total,'30');
 assert.equal(raw,'hn 21 dd5n dau5n dui5n\nhn 21 dd5n dau5n dui5n');
});
test('Quýt v2 Đui/Đuôi aliases are equivalent and DA remains not multiplied',()=>{
 const base={...opts,market:'mb'};
 const x=app.merge('hn 21 đui10n. 22 đuôi10n. 23 dui10n. 24 duoi10n. 25 26 da10n.',base);
 assert.equal(x.sections.find(s=>s.kind==='dui').total,'44');
 assert.equal(x.sections.find(s=>s.kind==='da').total,'10');
 assert.equal(x.total,'54');
 const y=app.merge('hn 21 dd15n.',base);
 assert.equal(y.total,'16');assert.equal(y.roundingDiffRows,1);
 assert.match(html,/HOLD_QUYT_V2_MONEY_CONTRACT/u);
 assert.match(html,/giả định làm tròn lên CEIL/u);
 assert.match(html,/KHÔNG phải oracle bên nhận/u);
 assert.match(html,/receiverMarketApproved\(\)\{return market\.value==='mb'&&!\(customer\.value==='quyt'&&tick\.checked\)\}/u);
});
test('Quýt V2 applies factor to Bao/Lô, DD, Đầu, Đuôi while leaving Đá unscaled',()=>{
 const out=app.merge('tn 42 bl10n dd15n dau10n dui10n',opts);
 assert.equal(out.total,'49');
 assert.equal(out.sections.find(x=>x.kind==='b').total,'11');
 assert.equal(out.sections.find(x=>x.kind==='dd').total,'16');
 assert.equal(out.sections.find(x=>x.kind==='dau').total,'11');
 assert.equal(out.sections.find(x=>x.kind==='dui').total,'11');
 assert.equal(out.sections.find(x=>x.kind==='da').total,'0');
 assert.equal(out.sections.reduce((sum,s)=>sum+BigInt(s.total),0n),BigInt(out.total));
 const original=app.merge('tn 42 bl10n dd15n dau10n dui10n',{...opts,tick:false});
 assert.equal(original.total,'45');
 assert.equal(original.sections.find(x=>x.kind==='dd').total,'15');
});

test('V4 two distinct accounting buckets: scaled eligibility vs unchanged raw, never bet-type bucketing',()=>{
 const input='hn 21 b10n. 321 b10n. 31 dd15n. 41 dau15n. 51 dui15n. 61 62 da10n.';
 const r=app.merge(input,{...opts,market:'mb'});
 assert.equal(r.total,'79');assert.equal(r.original,'75');
 const scaled=r.rows.filter(x=>x.factorApplied);
 const untouched=r.rows.filter(x=>!x.factorApplied);
 assert.equal(scaled.reduce((n,x)=>n+BigInt(x.adjusted),0n),59n);
 assert.equal(untouched.reduce((n,x)=>n+BigInt(x.adjusted),0n),20n);
 assert.equal(scaled.length,4);assert.equal(untouched.length,2);
 assert.equal(r.rows.find(x=>x.number==='321').adjusted,'10');
 assert.equal(r.rows.find(x=>x.kind==='da').adjusted,'10');
 assert.equal(input,'hn 21 b10n. 321 b10n. 31 dd15n. 41 dau15n. 51 dui15n. 61 62 da10n.');
 for(const id of ['baoTotal','otherTotal','scaledItems','unscaledItems'])assert.match(html,new RegExp('id="'+id+'"','u'));
 assert.match(html,/KHÔNG NHÂN HỆ SỐ/u);
 assert.match(html,/row\.factorApplied=Boolean\(opts\.tick&&quytFactorEligible\(row\)\)/u);
});
test('V4 DD/Đầu/Đui/Đuôi 3-digit wager numbers are INVALID, regardless of tick/market',()=>{
 const cases=['531 dd15n','641 dau15n','751 dui15n','851 đui15n','951 đuôi15n','031 duoi15n','21 531 dd15n','21 531 dd15n'];
 for(const clause of cases){
  for(const tick of [false,true]){
   assert.throws(()=>app.merge('hn '+clause,{...opts,market:'mb',tick}),/HOLD_3_CHU_SO_KHONG_HOP_LE.*tin 1/u);
  }
 }
 assert.throws(()=>app.merge('tn 531 dd15n',opts),/HOLD_3_CHU_SO_KHONG_HOP_LE/u);
 assert.throws(()=>app.merge('tn 641 dau15n',opts),/HOLD_3_CHU_SO_KHONG_HOP_LE/u);
 assert.throws(()=>app.merge('hn 21 b10n.\nhn 531 dd15n',{...opts,market:'mb'}),/HOLD_3_CHU_SO_KHONG_HOP_LE.*tin 2/u);
});
test('V4 valid two-digit DD/Đầu/Đui aliases and 3-digit BAO/LO retain exact semantics',()=>{
 const r=app.merge('hn 21 b10n. 321 b10n. 31 dd15n. 41 dau15n. 51 đui15n.',{...opts,market:'mb'});
 assert.equal(r.total,'69');
 const parts=Array.from(r.rows.filter(x=>x.factorApplied),x=>x.adjusted);
 assert.deepEqual(parts.sort(),['11','16','16','16'].sort());
 assert.equal(r.rows.find(x=>x.number==='321').factorApplied,false);
 const single=app.merge('hn 321 b75n. 021 lo10n',{...opts,market:'mb'});
 assert.equal(single.total,'85');assert.equal(single.ceilReference,'85');assert.equal(single.roundingDiffRows,0);
 assert.equal(single.rows.filter(x=>x.factorApplied).length,0);
});
test('V4 2d station topology is independent of wager number length',()=>{
 const two=app.merge('2d 21 b10n',opts),three=app.merge('2d 321 b10n',opts);
 assert.equal(two.total,'22');assert.equal(three.total,'20');assert.equal(two.rows.length,2);assert.equal(three.rows.length,2);
 assert.ok(three.rows.every(x=>x.number==='321'&&!x.factorApplied));
 assert.throws(()=>app.merge('2d 531 dd15n',opts),/HOLD_3_CHU_SO_KHONG_HOP_LE/u);
});
test('V4 2-digit scaled stakes partition by eligibility even if rounded amount equals source',()=>{
 const r=app.merge('hn 21 b5n. 321 b5n. 31 dd5n. 41 dui5n.',{...opts,market:'mb'});
 assert.equal(r.total,'20');assert.equal(r.rows.filter(x=>x.factorApplied).length,3);
 assert.equal(r.rows.filter(x=>!x.factorApplied).length,1);
 const plain=app.merge('hn 21 b5n. 321 b5n. 31 dd5n. 41 dui5n.',{...opts,market:'mb',tick:false});
 assert.equal(plain.rows.filter(x=>x.factorApplied).length,0);
 assert.equal(plain.total,'20');
});
