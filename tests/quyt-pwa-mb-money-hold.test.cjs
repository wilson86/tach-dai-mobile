'use strict';
// Deterministic source-bound money + market-scope review. No Telegram, backend or real funds.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../quyt-pwa/index.html'),'utf8');
const m=html.match(/const OfflineKTS=\(\(\)=>\{[\s\S]*?\}\)\(\);/u);
assert.ok(m,'Expected standalone Quyt canonical local engine');
const app=vm.runInNewContext(m[0]+';OfflineKTS;');
const calculate=(source,opts={})=>app.merge(source,{
 market:'mb',customer:'quyt',rate:'1.067',tick:false,...opts
});
function hold(source,opts,why){
 assert.throws(()=>calculate(source,opts),why);
}
test('MB base stake remains unchanged without Quyt checkbox',()=>{
 assert.equal(calculate('hn 21 b15n').total,'15');
 assert.equal(calculate('hn 21 b10n').total,'10');
});
test('owner-approved integer preview flags unresolved receiving Router CEIL',()=>{
 const a=calculate('hn 21 b15n',{tick:true});assert.equal(a.total,'16');assert.equal(a.roundingDiffRows,1);
 const b=calculate('hn 21 b75n',{tick:true});assert.equal(b.total,'80');assert.equal(b.roundingDiffRows,1);assert.equal(b.rows[0].beforeRounding,'80.025');
 const c=calculate('hn 21 b15n dd10n',{tick:true});assert.equal(c.total,'26');assert.equal(c.roundingDiffRows,1);
});
test('nondiscrepant Quyt amount and unscaled other groups stay usable',()=>{
 assert.equal(calculate('hn 21 b10n',{tick:true}).total,'11');
 assert.equal(calculate('hn 21 dd10n',{tick:true}).total,'10');
});
test('merging happens before multiplier check and repeat is not silently discarded',()=>{
 const source='hn 21 b5n\nhn 21 b5n';
 hold(source,{tick:true},/TIN_TRÙNG_CHƯA_XÁC_NHẬN/u);
 const x=calculate(source,{tick:true,duplicateConfirmed:true});
 assert.equal(x.total,'11');
 assert.match(x.pretty,/21 b11n/u);
});
test('MB page never offers unsupported MN/MT in same picker',()=>{
 assert.match(html,/<select id="market"[^>]*>\s*<option value="mb">MB \/ HN<\/option>/u);
 assert.doesNotMatch(html,/<option value="mn"|<option value="mt"/u);
 assert.match(html,/href="\.\/mn-mt-review\.html"/u);
});
test('legacy MN/MT draft is kept but not automatically relabelled as MB',()=>{
 assert.match(html,/\['mb','mn','mt',''\]\.includes\(state\.market\)/u);
 assert.match(html,/raw\.value=state\.raw;if\(state\.market==='mb'\)/u);
 assert.match(html,/market\.value='';\$\('oldMarketNotice'\)\.hidden=false/u);
 assert.match(html,/HOLD: bản nháp cũ chọn MN\/MT/u);
});


test('REVIEW N019: duplicate number in a single MB clause must HOLD instead of doubling money',()=>{
 hold('hn 21 21 b10n',{tick:false},/HOLD: số lặp trong cùng một nhóm cược/u);
});
test('REVIEW N020: repeated MB selector without fresh numbers must HOLD, including b→bao aliases',()=>{
 hold('hn 21 b10n b20n',{tick:false},/HOLD: lặp loại cược/u);
 hold('hn 21 b10n bao20n',{tick:false},/HOLD: lặp loại cược/u);
});
test('REVIEW positive: truly separate MB clauses and messages still add both placements',()=>{
 const a=calculate('hn 21 b10n. 21 b20n',{tick:false});
 assert.equal(a.total,'30');
 const b=calculate('hn 21 b10n\nhn 21 b20n',{tick:false});
 assert.equal(b.total,'30');
});
