'use strict';
// Synthetic-only, exact HTML engine. User-approved shorthand: no final n required
// when an unambiguous money amount immediately follows an approved bet selector.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../quyt-pwa');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const source=html.match(/const OfflineKTS=\(\(\)=>\{[\s\S]*?\}\)\(\);/u);
assert.ok(source,'actual embedded merge engine required');
const engine=vm.runInNewContext(source[0]+';OfflineKTS;');
const base={market:'mb',customer:'quyt',rate:'1.067',tick:false};
const merge=(raw,opts={})=>engine.merge(raw,{...base,...opts});
const hold=(raw,pattern,opts={})=>assert.throws(()=>merge(raw,opts),pattern);
test('operator screenshot: 5 BAO numbers ×300n without suffix',()=>{
 const raw='40 22 33 61 77 b300';
 const before=raw;
 const plain=merge(raw),quyt=merge(raw,{tick:true});
 assert.equal(raw,before,'input is immutable');
 assert.equal(plain.sourceCount,1);
 assert.equal(plain.rows.length,5);
 assert.equal(plain.original,'1500');
 assert.equal(plain.total,'1500');
 assert.equal(plain.pretty,'40 22 33 61 77 b300n.');
 assert.equal(quyt.original,'1500');
 assert.equal(quyt.total,'1600');
 assert.equal(quyt.pretty,'40 22 33 61 77 b320n.');
 for(const r of quyt.rows){
  assert.equal(r.raw,'300');assert.equal(r.beforeRounding,'320.1');
  assert.equal(r.adjusted,'320');
 }
});
test('source equivalent with n or without n; Quyt multiply exactly once',()=>{
 const raw='hn 40 22 33 61 77 b300';
 const a=merge(raw,{tick:true});
 const b=merge(raw+'n',{tick:true});
 assert.equal(a.pretty,b.pretty);assert.equal(a.original,b.original);
 assert.equal(a.total,b.total);assert.equal(a.total,'1600');
});
test('DA, DD, DAU, DUI and BAO/LO all accept whole n amounts without suffix',()=>{
 const da=merge('hn 21 22 da 20. 21 23 đá 20');
 assert.equal(da.original,'40');assert.equal(da.total,'40');
 assert.match(da.pretty,/21 22 da20n/u);assert.match(da.pretty,/21 23 da20n/u);
 const other=merge('hn 34 dau 25 dui 45n. 55 dd10. 21 b20 lo20',{tick:true});
 assert.equal(other.original,'120');
 // Quyt factor applies to BAO/LO only; every other type remains unscaled.
 assert.equal(other.rows.find(x=>x.kind==='dd').adjusted,'10');
 assert.equal(other.rows.find(x=>x.kind==='dau').adjusted,'25');
 assert.equal(other.rows.find(x=>x.kind==='dui').adjusted,'45');
 assert.equal(other.rows.find(x=>x.kind==='b').raw,'40');
 assert.equal(other.rows.find(x=>x.kind==='b').adjusted,'43');
});
test('BAO aliases LO, BLO, BAO and B share canonical output and money',()=>{
 const a=merge('hn 21 b10 lo10 blo10 bao10');
 assert.equal(a.original,'40');assert.equal(a.total,'40');
 assert.equal(a.rows.length,1);assert.equal(a.rows[0].kind,'b');
});
test('fail closed on unsupported or ambiguous amounts and numbers',()=>{
 hold('hn 21 b',/Cú pháp|Thiếu/u);
 hold('hn 21 22',/chưa ghi loại cược|không có cược/u);
 hold('hn 21 b0',/phải lớn hơn 0/u);
 hold('hn 21 b300x',/Cú pháp/u);
 hold('hn 21 b300.5',/Cú pháp/u);
 hold('hn 83 da20',/ĐÁ phải có đúng hai số/u);
 hold('hn 21 xc20',/XC chưa có quy tắc/u);
 hold('hn 21 b20',/chỉ nghiệm thu.*MB/u,{market:'mn'});
});
test('multiple independent messages are not silently deduplicated',()=>{
 const raw='hn 21 b300\nhn 21 b300';
 hold(raw,/TIN_TRÙNG_CHƯA_XÁC_NHẬN/u);
 const r=merge(raw,{duplicateConfirmed:true});
 assert.equal(r.sourceCount,2);assert.equal(r.original,'600');
 assert.equal(r.pretty,'HN\n21 b600n.');
});
test('source is never rewritten, and no obsolete missing-n confirmation UI',()=>{
 const raw='hn 21 b300. 22 dd10';merge(raw);
 assert.equal(raw,'hn 21 b300. 22 dd10');
 assert.doesNotMatch(html,/id="confirmMissingDaN"/u);
 assert.match(html,/40 22 33 61 77 b300/u);
});
test('PWA review remains draft, distinct from live v8',()=>{
 const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
 assert.match(sw,/kts-quyt-standalone-pwa-20261106-v9-cut-offline-review/u);
 assert.match(html,/PWA \/ OFFLINE/u);
});
