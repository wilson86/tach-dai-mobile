'use strict';
// Synthetic money-only UI fixtures. No source Telegram, no network, no real money.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const pages=['quyt-pwa/index.html','quyt-pwa/mn-mt-review.html','quyt-cut-review/index.html'];
function source(page){return fs.readFileSync(path.join(__dirname,'..',page),'utf8')}
function render(page,result,{customer='quyt',tick=true,rate='1.067'}={}){
 const html=source(page);
 const snippet=html.match(/function showTwoTotals\(result\)\{[\s\S]*?^\}/mu);
 assert.ok(snippet,'missing two-amount helper: '+page);
 const nodes=Object.fromEntries(['baoTotal','otherTotal','baoLabel'].map(id=>[id,{textContent:''}]));
 const env={document:{getElementById:id=>nodes[id]},customer:{value:customer},tick:{checked:tick},rate:{value:rate},formatVi:v=>BigInt(v).toLocaleString('vi-VN')+'n'};
 const fn=vm.runInNewContext('const $=id=>document.getElementById(id);\n'+snippet[0]+'\nshowTwoTotals',env);
 fn(result);
 return nodes;
}
const verified=[{kind:'b',total:'2960'},{kind:'da',total:'120'},{kind:'dd',total:'2664'},{kind:'dau',total:'225'},{kind:'dui',total:'2565'},{kind:'xc',total:'0'}];
for(const page of pages){
 test(page+' exposes exactly two summary amounts',()=>{
  const html=source(page);
  assert.equal([...html.matchAll(/class="total"/gu)].length,2);
  assert.doesNotMatch(html,/id="before"|id="after"/u);
  for(const id of ['baoLabel','baoTotal','otherTotal'])assert.match(html,new RegExp('id="'+id+'"','u'));
  assert.match(html,/PHẦN CÒN LẠI \(KHÔNG NHÂN\)/u);
  assert.match(html,/id="result"/u);
  assert.match(html,/id="copy"/u);
  const v=render(page,{sections:verified,total:'8534'});
  assert.equal(v.baoTotal.textContent,'2.960n');
  assert.equal(v.otherTotal.textContent,'5.574n');
  assert.equal(v.baoLabel.textContent,'BAO/LÔ ĐÃ NHÂN ×1.067');
 });
 test(page+' does not multiply other bets or a non-Quýt customer',()=>{
  let v=render(page,{sections:[{kind:'b',total:'55'},{kind:'dd',total:'15'}],total:'70'},{customer:'hien',tick:false});
  assert.equal(v.baoTotal.textContent,'55n');
  assert.equal(v.otherTotal.textContent,'15n');
  assert.equal(v.baoLabel.textContent,'BAO/LÔ KHÔNG NHÂN');
  v=render(page,{sections:[{kind:'b',total:'11'},{kind:'dd',total:'0'}],total:'11'});
  assert.equal(v.baoTotal.textContent,'11n');
  assert.equal(v.otherTotal.textContent,'0n');
 });
 test(page+' shows post-Cut amounts and holds a mismatch',()=>{
  const v=render(page,{sections:[{kind:'b',total:'0'},{kind:'dd',total:'5'}],total:'5'});
  assert.equal(v.baoTotal.textContent,'0n');
  assert.equal(v.otherTotal.textContent,'5n');
  assert.throws(()=>render(page,{sections:verified,total:'8533'}),/HOLD_MONEY_SUMMARY_MISMATCH/u);
  assert.throws(()=>render(page,{sections:[{kind:'dd',total:'5'}],total:'5'}),/HOLD_MONEY_SUMMARY_BAO_MISSING/u);
 });
}
