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
test('BAO multiplier mismatch HALF_UP vs CEIL blocks whole ticket rather than printing a stake',()=>{
 hold('hn 21 b15n',{tick:true},/HOLD_CHENH_LECH_LAM_TRON/u);
 hold('hn 21 b75n',{tick:true},/HOLD_CHENH_LECH_LAM_TRON/u);
 hold('hn 21 b15n dd10n',{tick:true},/HOLD_CHENH_LECH_LAM_TRON/u);
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
