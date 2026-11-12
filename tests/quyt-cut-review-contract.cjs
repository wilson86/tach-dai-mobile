'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('Review preview banner is prominent and live app remains independent',()=>{
 const index=read('quyt-cut-review/index.html');
 assert.match(index,/<section class="card" id="reviewOnlyBanner" role="alert"/u);
 assert.match(index,/CHƯA DÙNG TIỀN THẬT/u);
 assert.match(index,/KHÔNG gửi cược hoặc số tiền thật/u);
 assert.match(index,/href="\.\.\/quyt-pwa\/\?v=9"/u);
 assert.match(index,/<script src="\.\/quyt-cut-ledger\.js"><\/script>/u);
 assert.match(index,/KIỂM TRA VÀ GỘP/u);
 assert.match(index,/HOLD_CUT_REPLAY/u);
});
test('Review service worker cannot evict live PWA production cache',()=>{
 const preview=read('quyt-cut-review/sw.js');
 const live=read('quyt-pwa/sw.js');
 assert.match(preview,/kts-quyt-standalone-review-only-20261112-v11-two-amount-summary/u);
 assert.match(preview,/k\.startsWith\('kts-quyt-standalone-review-only-'\)/u);
 assert.doesNotMatch(preview,/k\.startsWith\('kts-quyt-standalone-pwa-'\)/u);
 assert.match(preview,/HOLD_OFFLINE_ROUTE_UNAVAILABLE/u);
 assert.match(preview,/\.\/quyt-cut-ledger\.js/u);
 assert.match(live,/kts-quyt-standalone-pwa-20261112-v10-regional-handoff/u);
});
test('Preview PWA install scope is itself, not main',()=>{
 const manifest=JSON.parse(read('quyt-cut-review/manifest.webmanifest'));
 assert.equal(manifest.scope,'./');
 assert.equal(manifest.start_url,'./');
 assert.match(manifest.name,/KHÔNG DÙNG TIỀN THẬT/u);
 const files=['quyt-cut-review/index.html','quyt-cut-review/quyt-cut-ledger.js','quyt-cut-review/sw.js','quyt-cut-review/manifest.webmanifest','quyt-cut-review/icon.svg'];
 files.forEach(p=>assert.ok(fs.statSync(path.join(root,p)).size>0,p));
});

test('Preview has no production Quyt session/local storage key collisions',()=>{
 const live=read('quyt-pwa/index.html'), preview=read('quyt-cut-review/index.html');
 const keys=s=>Object.fromEntries([...s.matchAll(/(?:const |,)(storageKey|ratesKey|cutStorageKey|cutGuardKey)='([^']+)'/gu)].map(x=>[x[1],x[2]]));
 const prod=keys(live),review=keys(preview);
 assert.equal(prod.storageKey,'KTS_OFFLINE_QUYT_DRAFT_V1');
 assert.equal(prod.ratesKey,'KTS_OFFLINE_QUYT_RATES_V1');
 assert.deepEqual(review,{storageKey:'KTS_QUYT_REVIEW_V10_DRAFT_V1',
  ratesKey:'KTS_QUYT_REVIEW_V10_RATES_V1',
  cutStorageKey:'KTS_QUYT_REVIEW_V10_SCOPED_CUT_V1',
  cutGuardKey:'KTS_QUYT_REVIEW_V10_CUT_REPLAY_GUARD_V1'});
 assert.equal(new Set(Object.values(review)).size,4);
 for(const key of Object.values(prod))assert.ok(!Object.values(review).includes(key));
});

 
// Cut ledger replay-safety: the source under test is the exact inline HTML
// function, not a copied implementation. No browser, production state or IO.
const restoreSource=read('quyt-cut-review/index.html');
const restoreStart=restoreSource.indexOf('function restoreCuts(){');
const restoreEnd=restoreSource.indexOf('function resetFrames(){',restoreStart);
assert.ok(restoreStart>=0&&restoreEnd>restoreStart,'restoreCuts source anchors');
const restoreCutsUnderTest=new Function('cutGuard','cutScope','sessionStorage','cutStorageKey',
  "'use strict';let cutKeys=new Set(),cutUndo=[];"+restoreSource.slice(restoreStart,restoreEnd)+
  ';restoreCuts();return {keys:[...cutKeys],undo:cutUndo}');
const cutScopeForTest=JSON.stringify(['hn 21 b10n dd5n','quyt','mb',true,'1.067']);
const restored=(guard,receipt)=>restoreCutsUnderTest(guard,()=>cutScopeForTest,{
  getItem:key=>key==='SYNTHETIC_LEDGER'?receipt:null
},'SYNTHETIC_LEDGER');

test('REPLAY HOLD: missing stored ledger must never resurrect a completed Cut on F5',()=>{
 assert.throws(()=>restored({phase:'cut',scope:cutScopeForTest},null),/HOLD_SAVED_CUT_CORRUPT/u);
});
test('REPLAY HOLD: Cut ledger from another scope cannot resurrect removed rows',()=>{
 const wrong=JSON.stringify({scope:'DIFFERENT_SOURCE',keys:['b|21'],undo:[[]]});
 assert.throws(()=>restored({phase:'cut',scope:cutScopeForTest},wrong),/HOLD_SAVED_CUT_CORRUPT/u);
});
test('REPLAY KEEP: valid scoped Cut receipt restores removed keys and Undo history',()=>{
 const valid=JSON.stringify({scope:cutScopeForTest,keys:['b|21'],undo:[[]]});
 const state=restored({phase:'cut',scope:cutScopeForTest,receipt:valid},valid);
 assert.deepEqual(state.keys,['b|21']);assert.deepEqual(state.undo,[[]]);
});
test('FIRST USE: no Cut guard and no stored ledger is allowed to start empty',()=>{
 const state=restored(null,null);assert.deepEqual(state.keys,[]);assert.deepEqual(state.undo,[]);
});
test('REPLAY HOLD: malformed Cut ledger still fails closed',()=>{
 assert.throws(()=>restored({phase:'cut',scope:cutScopeForTest},'{invalid'),/HOLD_SAVED_CUT_CORRUPT/u);
});

// The actual HTML loadGuard function must recover a missing replay guard
// conservatively: an orphaned Cut ledger is a HOLD, never a new batch.
const guardHtml=read('quyt-cut-review/index.html');
const guardStart=guardHtml.indexOf('function loadGuard(){');
const guardEnd=guardHtml.indexOf('function writeGuard(',guardStart);
assert.ok(guardStart>=0&&guardEnd>guardStart,'loadGuard source anchors');
const evaluateGuard=new Function('guardText','ledgerText',
  "'use strict';const cutGuardKey='QA_GUARD',cutStorageKey='QA_LEDGER';let cutGuard=null;"+
  "const sessionStorage={getItem:key=>key===cutGuardKey?guardText:key===cutStorageKey?ledgerText:null};"+
  guardHtml.slice(guardStart,guardEnd)+';loadGuard();return cutGuard');
const syntheticReceipt=JSON.stringify({scope:'SYNTHETIC',keys:['b|21'],undo:[[]]});
test('missing replay guard with remaining Cut receipt must HOLD, not export cut numbers',()=>{
 const found=evaluateGuard(null,syntheticReceipt);
 assert.deepEqual(found,{scope:'ORPHANED',phase:'blocked'});
});
test('missing replay guard with malformed Cut receipt must HOLD',()=>{
 assert.deepEqual(evaluateGuard(null,'{bad'),{scope:'CORRUPT',phase:'blocked'});
});
test('missing replay guard with partial undo history must HOLD',()=>{
 assert.deepEqual(evaluateGuard(null,JSON.stringify({scope:'SYNTHETIC',keys:[],undo:[[]]})),
  {scope:'ORPHANED',phase:'blocked'});
});
test('first use without Cut history can proceed; empty ledger alone is not a Cut',()=>{
 assert.equal(evaluateGuard(null,null),null);
 assert.equal(evaluateGuard(null,JSON.stringify({scope:'SYNTHETIC',keys:[],undo:[]})),null);
});
test('valid source-bound replay guard remains in completed-Cut phase',()=>{
 assert.deepEqual(evaluateGuard(JSON.stringify({scope:'SYNTHETIC',phase:'cut'}),syntheticReceipt),
  {scope:'SYNTHETIC',phase:'cut'});
});

test('REPLAY HOLD: same-scope Cut ledger deleting a previously-Cut number is rejected',()=>{
 const signed=JSON.stringify({scope:cutScopeForTest,keys:['b|21'],undo:[[]]});
 const modified=JSON.stringify({scope:cutScopeForTest,keys:[],undo:[]});
 assert.throws(()=>restored({phase:'cut',scope:cutScopeForTest,receipt:signed},modified),/HOLD_SAVED_CUT_CORRUPT/u);
});
test('REPLAY HOLD: same-scope Cut ledger with forged number is rejected',()=>{
 const signed=JSON.stringify({scope:cutScopeForTest,keys:['b|21'],undo:[[]]});
 const modified=JSON.stringify({scope:cutScopeForTest,keys:['b|99'],undo:[[]]});
 assert.throws(()=>restored({phase:'cut',scope:cutScopeForTest,receipt:signed},modified),/HOLD_SAVED_CUT_CORRUPT/u);
});
test('REPLAY HOLD: historical unbound Cut guard needs manual review (not silent replay)',()=>{
 const signed=JSON.stringify({scope:cutScopeForTest,keys:['b|21'],undo:[[]]});
 assert.throws(()=>restored({phase:'cut',scope:cutScopeForTest},signed),/HOLD_SAVED_CUT_CORRUPT/u);
});
test('REPLAY KEEP: independently reconciled Undo receipt binds to empty Cut set',()=>{
 const afterUndo=JSON.stringify({scope:cutScopeForTest,keys:[],undo:[]});
 assert.deepEqual(restored({phase:'cut',scope:cutScopeForTest,receipt:afterUndo},afterUndo),{keys:[],undo:[]});
});

const previewHtml=read('quyt-cut-review/index.html');
const previewEngine=previewHtml.match(/const OfflineKTS=\(\(\)=>\{[\s\S]*?\}\)\(\);/u);
assert.ok(previewEngine,'Quyt review must test exact source engine');
const reviewQuyt=new Function("'use strict';"+previewEngine[0]+";return OfflineKTS")();
const reviewOpts={market:'mb',customer:'quyt',rate:'1.067',tick:true};
test('operator screenshot 40 22 33 61 77 b300 = five BAO bets at 300n',()=>{
 const raw='40 22 33 61 77 b300',unchanged=raw;
 const actual=reviewQuyt.merge(raw,reviewOpts);
 assert.equal(raw,unchanged);
 assert.equal(actual.sourceCount,1);
 assert.equal(actual.rows.length,5);
 assert.equal(actual.original,'1500');
 assert.equal(actual.total,'1600');
 assert.equal(actual.pretty,'40 22 33 61 77 b320n.');
 assert.ok(actual.rows.every(x=>x.raw==='300'&&x.beforeRounding==='320.1'&&x.adjusted==='320'));
 assert.equal(reviewQuyt.merge(raw+'n',reviewOpts).pretty,actual.pretty);
 assert.equal(reviewQuyt.merge(raw+'.',reviewOpts).pretty,actual.pretty);
});
test('review optional-n shorthand works for DA, DD, DAU and DUI, no Quyt multiplier except BAO',()=>{
 const parsed=reviewQuyt.merge('hn 21 22 da20. 34 dau25 dui45. 55 dd10. 21 b20 lo20',reviewOpts);
 assert.equal(parsed.original,'140');
 assert.equal(parsed.rows.find(x=>x.kind==='b').adjusted,'43');
 assert.equal(parsed.rows.find(x=>x.kind==='da').adjusted,'20');
 assert.equal(parsed.rows.find(x=>x.kind==='dd').adjusted,'10');
 assert.equal(parsed.rows.find(x=>x.kind==='dau').adjusted,'25');
 assert.equal(parsed.rows.find(x=>x.kind==='dui').adjusted,'45');
});
test('review optional-n still HOLDs malformed money, unknown XC, unsupported region and ambiguous DA',()=>{
 for(const raw of ['hn 21 b','hn 21 b300.5','hn 21 b300x','hn 21 xc20','hn 83 da20']){
  assert.throws(()=>reviewQuyt.merge(raw,reviewOpts),/Cú pháp|Thiếu|XC chưa có|ĐÁ phải có/u,raw);
 }
 assert.throws(()=>reviewQuyt.merge('40 22 b300',{...reviewOpts,market:'mn'}),/chỉ nghiệm thu.*MB/u);
});
test('review optional-n UI explains the 300n shorthand; no dead confirmation button',()=>{
 assert.match(previewHtml,/40 22 33 61 77 b300/u);
 assert.match(previewHtml,/số tiền có thể ghi/u);
 assert.doesNotMatch(previewHtml,/id="confirmMissingDaN"/u);
});
