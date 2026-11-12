'use strict';
// Public sanitized fixtures only. No real customers' Telegram source in repo.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'../quyt-pwa');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const core=html.match(/const OfflineKTS=\(\(\)=>\{[\s\S]*?\}\)\(\);/u);
assert.ok(core,'Standalone canonical source must exist');
const app=vm.runInNewContext(core[0]+';OfflineKTS;');
const base={market:'mb',customer:'quyt',tick:true,rate:'1.067'};
function group(out,kind){return out.sections.find(x=>x.kind===kind)}
function sum(out){return out.sections.reduce((n,x)=>n+BigInt(x.total),0n)}
test('engine group accounting unchanged; UI order is B/DA/DD/XC/DAU/DUI',()=>{
 const a=app.merge('hn 21 b55n. 21 22 da20n. 44 dd10n. 55 dau5n dui15n.',base);
 assert.deepEqual(Array.from(a.sections,x=>x.kind),['b','da','xc','dd','dau','dui','dx']);
 assert.equal(a.total,'111');assert.equal(sum(a),111n);
 assert.equal(group(a,'b').text,'HN\n21 b59n.');
 assert.equal(group(a,'da').text,'HN\n21 22 da20n.');
 assert.equal(group(a,'dd').text,'HN\n44 dd11n.');
 assert.equal(group(a,'dau').text,'HN\n55 dau5n.');
 assert.equal(group(a,'dui').text,'HN\n55 dui16n.');
 assert.equal(group(a,'xc').text,'');assert.equal(group(a,'xc').supported,false);
 assert.match(a.pretty,/55 dau5n dui16n/u); // Preserve previously verified full-copy format
});
test('BO/LO aliases combine only with same canonical number; other groups never mingle',()=>{
 const a=app.merge('hn 21 lo5n. 21 b5n. 21 dd3n. 21 22 da5n.',base);
 assert.equal(group(a,'b').text,'HN\n21 b11n.');
 assert.equal(group(a,'dd').text,'HN\n21 dd3n.');
 assert.equal(group(a,'da').text,'HN\n21 22 da5n.');
 assert.equal(sum(a),BigInt(a.total));
});
test('each frame and full Copy derive from same rounded amounts at 1.067 and 1.10',()=>{
 const source='hn 21 b55n. 22 b5n. 44 dd10n.';
 const a=app.merge(source,base);
 const b=app.merge(source,{...base,rate:'1.10'});
 assert.equal(group(a,'b').total,'64');assert.equal(a.total,'75');
 assert.equal(group(b,'b').total,'67');assert.equal(b.total,'78');
 assert.equal(sum(a),BigInt(a.total));assert.equal(sum(b),BigInt(b.total));
 assert.equal(group(a,'dd').total,'11');assert.equal(group(b,'dd').total,'11'); // 10n both round to 11n at 1.067 and 1.10
 const off=app.merge(source,{...base,tick:false});
 assert.equal(group(off,'b').total,'60');assert.equal(off.total,'70');
});
test('no group output may be emitted on ambiguous or unsupported source',()=>{
 assert.throws(()=>app.merge('hn 21 xc5n.',base),/XC chưa có quy tắc/u);
 assert.throws(()=>app.merge('hn 21 22 da 20',base),/THIEU_N_CAN_XAC_NHAN/u);
 assert.throws(()=>app.merge('hn 21 b55n.',{...base,market:'mn'}),/MN\/MT phải chọn ngày xổ số hợp lệ/u);
});
test('HTML has six readonly wager frames, two factor bucket cards and v20 cache',()=>{
 const blocks=[...html.matchAll(/<section class="bet-section[^"]*" data-bet-kind="([a-z]+)">/gu)];
 assert.deepEqual(Array.from(blocks,x=>x[1]),['b','da','dd','xc','dau','dui']);
 assert.match(html,/id="betSections"/u);
 assert.match(html,/id="groupedResultsCard" hidden/u);
 assert.equal([...html.matchAll(/class="total"/gu)].length,2);
 assert.match(html,/id="scaledItems"/u);assert.match(html,/id="unscaledItems"/u);
 assert.match(html,/grid-template-columns:1fr/u);
 assert.match(html,/id="combinedResultsCard" hidden/u);
 assert.match(html,/\[hidden\]\{display:none!important\}/u);
 assert.match(html,/frame\.field\.closest\('\.bet-section'\)\.hidden=!\(section\.supported&&section\.text\)/u);
 assert.match(html,/class="section-copy" disabled/u);
 assert.match(html,/class="section-text" readonly/u);
 const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
 assert.match(sw,/kts-quyt-standalone-pwa-20261112-v21-source-cut-ledger/u);
});
