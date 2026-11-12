'use strict';
// Synthetic-only financial tests: no real customer messages are committed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../quyt-pwa');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const source = html.match(/const OfflineKTS=\(\(\)=>\{[\s\S]*?\}\)\(\);/u);
assert.ok(source, 'The exact offline source engine must be present');
const app = vm.runInNewContext(source[0] + ';OfflineKTS;');
const base = {market:'mb', customer:'quyt', tick:false, rate:'1.067'};
const merge = (s, opts={}) => app.merge('hn '+s, {...base,...opts});
function printedStakesHaveNoFraction(result) {
 assert.doesNotMatch(result.pretty, /\b\d+[.,]\d+n\b/iu);
 assert.match(result.total, /^\d+$/u);
 for(const row of result.rows) {
  assert.match(row.adjusted, /^\d+$/u);
 }
}
test('half-up boundary: 0.499 down, 0.500 and 0.501 up', () => {
 const a = merge('21 b1.499n. 22 b1.5n. 23 b1.501n.');
 assert.equal(a.total,'5');
 assert.equal(a.original,'4.5');
 assert.match(a.pretty, /21 b1n/u);
 assert.match(a.pretty, /23 22 b2n/u); // pre-existing descending stake sort order
 printedStakesHaveNoFraction(a);
});
test('Quýt scales BAO/LO, DD, DAU and DUI then rounds each canonical number', () => {
 const a = merge('21 b55n. 22 b5n. 23 b100n. 34 dd10n.',{tick:true});
 assert.equal(a.original,'170');assert.equal(a.total,'182');
 assert.match(a.pretty, /23 b107n/u); assert.match(a.pretty,/21 b59n/u);
 assert.match(a.pretty, /22 b5n/u);assert.match(a.pretty,/34 dd11n/u);
 const row=a.rows.find(x=>x.number==='21');
 assert.equal(row.beforeRounding,'58.685');
 assert.equal(row.adjusted,'59');
 assert.equal(a.rounding,'HALF_UP_PER_NUMBER_AFTER_MULTIPLY');
 printedStakesHaveNoFraction(a);
});
test('merge identical number wagers first, multiply and round exactly ONCE', () => {
 const a=merge('21 b5n. 21 lo5n.',{tick:true});
 assert.equal(a.original,'10');assert.equal(a.total,'11');
 assert.match(a.pretty,/21 b11n/u);
});
test('never round grand total instead of per-number amounts', () => {
 const a=merge('21 22 b5n.',{tick:true});
 assert.equal(a.original,'10');assert.equal(a.total,'10');
 assert.match(a.pretty,/21 22 b5n/u);
 assert.equal(a.rows.length,2);
 assert.equal(a.rows.reduce((sum,row)=>sum+Number(row.adjusted),0),10);
 printedStakesHaveNoFraction(a);
});
test('DA stays unscaled; DD/DAU/DUI scale and round HALF_UP', () => {
 const a=merge('21 22 da5.5n. 44 dd3.51n. 45 dau5.499n dui2.5n.',{tick:true});
 assert.equal(a.total,'19');assert.equal(a.original,'17.009');
 assert.match(a.pretty,/21 22 da6n/u);assert.match(a.pretty,/44 dd4n/u);
 assert.match(a.pretty,/45 dau6n dui3n/u);
 printedStakesHaveNoFraction(a);
});
test('positive money that would round to zero HOLDs rather than dropping a wager', () => {
 assert.throws(()=>merge('21 b0.4n.'),/làm tròn thành 0n/u);
 assert.throws(()=>merge('21 b0.4n.',{tick:true}),/làm tròn thành 0n/u);
 const a=merge('21 b0.5n.');
 assert.equal(a.total,'1');
});
test('rate edit recomputes from source, untick gives original integer stakes', () => {
 const raw='21 b55n.';
 assert.equal(merge(raw,{tick:true,rate:'1.067'}).total,'59');
 assert.equal(merge(raw,{tick:true,rate:'1.05'}).total,'58');
 assert.equal(merge(raw,{tick:true,rate:'1.10'}).total,'61');
 assert.equal(merge(raw,{tick:false,rate:'INVALID'}).total,'55');
});
test('owner-approved B money without n is accepted, but DA without n still needs explicit confirmation',()=>{
 const a=merge('21 b55',{tick:true});
 assert.equal(a.total,'59');
 assert.match(a.pretty,/21 b59n/u);
 assert.throws(()=>merge('21 22 da20'),/THIEU_N_CAN_XAC_NHAN/u);
 const d=merge('21 22 da20',{confirmMissingDaN:true,tick:true});
 assert.equal(d.total,'20');
});
test('unsupported XC and market still HOLD, and source is never mutated',()=>{
 assert.throws(()=>merge('21 xc5n.'),/XC chưa có quy tắc/u);
 assert.throws(()=>merge('21 b55n.',{market:'mn'}),/MN\/MT phải chọn ngày xổ số hợp lệ/u);
 const s='hn 21 b55n.';const copy=s;
 const a=app.merge(s,{...base,tick:true});
 assert.equal(s,copy);assert.equal(a.total,'59');
});
test('v19 service worker retains v4 money contract and adds group frames',()=>{
 const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
 assert.match(sw,/kts-quyt-standalone-pwa-20261113-v27-atomic-cut-to-clipboard/u);
 assert.match(html,/Sau nhân, chưa tròn/u);
 assert.match(html,/Xuất, đã tròn/u);
 assert.match(html,/id="baoTotal"/u);assert.match(html,/id="otherTotal"/u);
});
