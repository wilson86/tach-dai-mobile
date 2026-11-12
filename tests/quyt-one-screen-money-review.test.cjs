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
test('factor is applied to Bao/Lô ONLY, never DD, preserving integer n',()=>{
 const out=app.merge('tn 42 bl10n dd5n',opts);
 assert.equal(out.total,'16');
 assert.equal(out.roundingDiffRows,0);
 assert.equal(out.sections.find(x=>x.kind==='b').total,'11');
 assert.equal(out.sections.find(x=>x.kind==='dd').total,'5');
});
