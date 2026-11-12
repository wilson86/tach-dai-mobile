'use strict';
// WILSON86: sanitized synthetic station fixture; no real Telegram text or money.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const mb=fs.readFileSync(path.join(root,'quyt-pwa/index.html'),'utf8');
const regional=fs.readFileSync(path.join(root,'quyt-pwa/mn-mt-review.html'),'utf8');
const calendar=fs.readFileSync(path.join(root,'station_calendar.generated.js'),'utf8');
const mbRoute=mb.match(/function suggestedMarket\(\)\{[\s\S]*?^\}/mu);
const regionEngine=regional.match(/const OfflineKTS=\(\(\)=>\{[\s\S]*?\}\)\(\);/u);
assert.ok(mbRoute,'MB source must expose station-aware routing hint');
assert.ok(regionEngine,'MN/MT engine must come from the canonical review HTML');
function suggest(rawText,selection='mb'){
 return vm.runInNewContext(mbRoute[0]+';suggestedMarket();',{raw:{value:rawText},market:{value:selection}});
}
const app=vm.runInNewContext(calendar+'\n'+regionEngine[0]+';OfflineKTS;');
const synthetic='Tn 42 43 bl10n';
const options={customer:'quyt',market:'mn',businessDate:'2026-11-12',rate:'1.067',tick:true};
test('TN is MN Thursday in canonical generated calendar; never silently MB/MT',()=>{
 assert.equal(new Date('2026-11-12T12:00:00Z').getUTCDay(),4);
 assert.ok(app.schedule('mn',options.businessDate).some(([id,name])=>id==='tn'&&name==='Tây Ninh'));
 assert.equal(suggest(synthetic),'mn');
 assert.equal(suggest('mn tn 42 43 bl10n'),'mn');
 assert.equal(suggest(synthetic,'mt'),'mn'); // Source station wins over an incorrect selected region.
 assert.equal(suggest('hn 42 b10n'),null);
 assert.equal(suggest('hn 42 b10n','mt'),'mt');
});
test('TN synthetic Bao/Lô groups after ×1.067 on correct date without modifying original',()=>{
 const saved=synthetic;
 const result=app.merge(synthetic,options);
 assert.equal(synthetic,saved);
 assert.equal(result.total,'22');
 assert.equal(result.sections.find(group=>group.kind==='b').total,'22');
 assert.equal(result.sections.filter(group=>group.kind!=='b').reduce((n,g)=>n+BigInt(g.total),0n),0n);
 assert.match(result.pretty,/tn 42 43 b11n/u);
});
test('wrong or missing date, wrong region and unsupported MB copy stay HOLD',()=>{
 assert.throws(()=>app.merge(synthetic,{...options,businessDate:''}),/phải chọn ngày xổ số/u);
 assert.throws(()=>app.merge(synthetic,{...options,businessDate:'2026-11-13'}),/cần mã hoặc tên đài/u);
 assert.throws(()=>app.merge(synthetic,{...options,market:'mt'}),/cần mã hoặc tên đài/u);
 assert.throws(()=>app.merge(synthetic,{...options,market:'mb'}),/Cú pháp chưa rõ.*HOLD|bắt đầu HN|chỉ nghiệm thu/u);
 assert.match(mb,/id="regionalHelp"/u);
 assert.match(mb,/window\.location\.assign\('\.\/mn-mt-review\.html'\)/u);
});
test('handoff does not transmit source via a URL and preserves existing draft unless confirmed',()=>{
 assert.match(mb,/sessionStorage\.setItem\('KTS_QUYT_MNMT_HANDOFF_V1',payload\)/u);
 assert.match(regional,/if\(raw\.value\.trim\(\)&&!confirm\(/u);
 assert.match(regional,/businessDate\.value=''; \/\/ Never infer the wager's draw date/u);
 assert.match(regional,/KTS_QUYT_MNMT_HANDOFF_V1/u);
 assert.match(regional,/id="handoffPending"/u);
 assert.doesNotMatch(mb,/location\.assign\([^)]*raw\.value/gu);
});
test('real target import function transfers source unchanged but clears remembered date and approvals',()=>{
 const snippet=regional.match(/function importHandoff\(\)\{[\s\S]*?^\}/mu);
 assert.ok(snippet);
 const state={pendingHandoff:{schema:1,raw:synthetic,customer:'quyt',market:'mn',rate:'1.067',tick:true},
  customer:{value:'hien'},market:{value:'mt'},raw:{value:''},businessDate:{value:'2026-11-13'},
  rate:{value:'1.000'},rates:{hien:'1.000',quyt:'1.067'},tick:{checked:false},
  confirmedRaw:'OLD',confirmedDaScope:'OLD',handoffKey:'KTS_QUYT_MNMT_HANDOFF_V1',
  document:{getElementById:()=>({hidden:false})},redraw:()=>{},message:()=>{},
  sessionStorage:{removeItem:key=>{state.removedKey=key}}};
 vm.runInNewContext('const $=id=>document.getElementById(id);\n'+snippet[0]+'\nimportHandoff();',state);
 assert.equal(state.raw.value,synthetic);
 assert.equal(state.market.value,'mn');assert.equal(state.customer.value,'quyt');
 assert.equal(state.businessDate.value,'');assert.equal(state.tick.checked,true);
 assert.equal(state.confirmedRaw,null);assert.equal(state.confirmedDaScope,null);
 assert.equal(state.pendingHandoff,null);assert.equal(state.removedKey,state.handoffKey);
});
