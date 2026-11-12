'use strict';
// Public synthetic-only regression fixtures — never commit real customer content.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'../quyt-pwa');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const coreScript=html.match(/const OfflineKTS=\(\(\)=>\{[\s\S]*?\}\)\(\);/u);
assert.ok(coreScript,'source-bound standalone merge engine required');
const core=vm.runInNewContext(coreScript[0]+';OfflineKTS;');
const opts={market:'mb',customer:'quyt',rate:'1.067',tick:false};
function hold(raw,re,override={}){assert.throws(()=>core.merge(raw,{...opts,...override}),re)}
test('two DA wagers with missing n HOLD until explicit source-bound approval',()=>{
 const raw='21 22 da 20 21 23 da 20';
 assert.equal(core.missingDaN(raw).length,2);
 hold(raw,/THIEU_N_CAN_XAC_NHAN/u);
 const result=core.merge(raw,{...opts,confirmMissingDaN:true});
 assert.equal(result.total,'40');
 assert.equal(result.sourceCount,1);
 assert.match(result.pretty,/21 22 da20n/u);
 assert.match(result.pretty,/21 23 da20n/u);
});
test('DAU bare integer is approved automatically while DUI explicit n is valid',()=>{
 const raw='34 dau 25 dui 45n';
 assert.equal(core.missingDaN(raw).length,0);
 const x=core.merge(raw,opts);
 assert.equal(x.total,'70');assert.match(x.pretty,/34 dau25n dui45n/u);
});
test('BAO/LO bare integer is approved automatically; multiplier applies once',()=>{
 const raw='21 22 lo 20';
 assert.equal(core.missingDaN(raw).length,0);
 const base=core.merge(raw,opts);
 const adjusted=core.merge(raw,{...opts,tick:true});
 assert.equal(base.total,'40');assert.equal(adjusted.total,'42');
});
test('no text alteration by merge, no unapproved decimal or XC admission',()=>{
 const raw='21 22 da 20';const before=raw;
 core.merge(raw,{...opts,confirmMissingDaN:true});assert.equal(raw,before);
 assert.equal(core.missingDaN('21 22 da 20n').length,0);
 assert.equal(core.missingDaN('21 22 dd10n').length,0);
 assert.equal(core.missingDaN('34 xc 20').length,0);
 hold('34 xc 20',/(?:Thiếu tiền|XC|Cú pháp)/u,{confirmMissingDaN:true});
});
test('no orphan DA pair, no unsupported regions even after confirmation',()=>{
 hold('21 da 20',/ĐÁ phải có đúng hai số/u,{confirmMissingDaN:true});
 hold('21 22 da 20',/MN\/MT phải chọn ngày xổ số hợp lệ/u,{market:'mn',confirmMissingDaN:true});
});
test('already-valid exact source remains byte-compatible',()=>{
 const raw='hn 21 22 da20n. 34 dau25n dui45n. 21 b10n.';
 assert.equal(core.missingDaN(raw).length,0);
 const a=core.merge(raw,opts);const b=core.merge(raw,{...opts,confirmMissingDaN:true});
 assert.equal(a.pretty,b.pretty);assert.equal(a.total,'100');
});
test('new standalone service-worker key must be version v20',()=>{
 const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
 assert.match(sw,/kts-quyt-standalone-pwa-20261112-v21-local-source-cut/u);
 assert.match(html,/id="confirmMissingDaN"/u);
});

test('A bare approved wager amount at physical end-of-line is n; next line stays independent',()=>{
 const raw='60 b 100 dd 100 dau 100 duoi 100\n33 61 dx 5n 526 b10n';
 const r=core.merge(raw,{...opts,tick:true});
 assert.equal(r.sourceCount,2);
 assert.equal(r.total,'443');
 assert.equal(r.rows.find(x=>x.kind==='dui').adjusted,'107');
 assert.equal(r.rows.find(x=>x.kind==='dx').adjusted,'5');
 assert.equal(r.rows.find(x=>x.number==='526').adjusted,'10');
 assert.equal(raw,'60 b 100 dd 100 dau 100 duoi 100\n33 61 dx 5n 526 b10n');
});
