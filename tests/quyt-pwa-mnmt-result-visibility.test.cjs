'use strict';
// Synthetic, offline, SHA-bound source/engine regression for the MN/MT Quyt UI.
// Run: node --test tests/quyt-pwa-mnmt-result-visibility.test.cjs
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../quyt-pwa/mn-mt-review.html'),'utf8');
const calendar=fs.readFileSync(path.join(__dirname,'../station_calendar.generated.js'),'utf8');
const engine=html.match(/const OfflineKTS=\(\(\)=>\{[\s\S]*?\}\)\(\);/u);
assert.ok(engine,'review-only engine must exist');
const app=vm.runInNewContext(calendar+'\n'+engine[0]+';OfflineKTS;');
const options={customer:'quyt',market:'mn',businessDate:'2026-11-04',rate:'1.067',tick:false};
const frameOrder=[...html.matchAll(/<section class="bet-section(?: pending)?" data-bet-kind="([^"]+)"/gu)].map(m=>m[1]);
const visible=res=>res.sections.filter(s=>s.supported&&Boolean(s.text)).map(s=>s.kind);
test('results cards start hidden, reset hides each section and full Copy',()=>{
 assert.match(html,/id="groupedResultsCard" hidden/u);
 assert.match(html,/id="combinedResultsCard" hidden/u);
 assert.match(html,/\[hidden\]\{display:none!important\}/u);
 assert.match(html,/function resetFrames\(\)\{[\s\S]*?groupedResultsCard[\s\S]*?combinedResultsCard[\s\S]*?\.hidden=true/u);
});
test('UI group order B, DA, DD, XC, DAU, DUI',()=>{
 assert.deepEqual(frameOrder,['b','da','dd','xc','dau','dui']);
});
test('only populated supported groups can become visible; Copy gate remains separate',()=>{
 assert.match(html,/\.hidden=!\(section\.supported&&section\.text\)/u);
 assert.match(html,/visibleGroups===0/u);
 assert.match(html,/function syncCopyGate/u);
 assert.match(html,/frame\.button\.disabled=!\(can&&section&&section\.supported/u);
});
test('one valid B bet exposes B only; zero-stake DA, DD, XC stay hidden',()=>{
 const result=app.merge('dn 21 b10n',options);
 assert.deepEqual(visible(result),['b']);
 assert.equal(result.sections.find(s=>s.kind==='b').text,'dn 21 b10n.');
});
test('valid B and DD expose exactly B and DD; no empty DA/XC',()=>{
 const result=app.merge('dn 21 b10n dd5n',options);
 assert.deepEqual(visible(result),['b','dd']);
});
test('unsupported XC and DA hold the entire transaction, not partial result',()=>{
 assert.throws(()=>app.merge('dn 21 b10n xc5n',options),/XC/u);
 assert.throws(()=>app.merge('dn 21 b10n\ndn 21 22 da5n',options),/ĐÁ/u);
});
test('rounding disagreement is still a hard HOLD before rendering',()=>{
 const result=app.merge('dn 21 b15n',{...options,tick:true});
 assert.ok(result.roundingDiffRows>0);
 assert.match(html,/if\(res\.roundingDiffRows>0\)\{/u);
 assert.match(html,/HOLD_CHENH_LECH_LAM_TRON/u);
});
