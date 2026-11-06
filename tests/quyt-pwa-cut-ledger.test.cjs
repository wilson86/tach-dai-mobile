'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'../quyt-pwa');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const engine=html.match(/const OfflineKTS=\(\(\)=>\{[\s\S]*?\}\)\(\);/u);
assert.ok(engine,'real MB engine missing');
const source=fs.readFileSync(path.join(root,'quyt-cut-ledger.js'),'utf8');
const {OfflineKTS,QuytCutLedger}=vm.runInNewContext(engine[0]+'\n'+source+'\n;({OfflineKTS,QuytCutLedger})');
const opts={market:'mb',customer:'quyt',tick:true,rate:'1.067'};
function bet(raw,o=opts){return OfflineKTS.merge(raw,o)}
function cut(base,keys){return QuytCutLedger.derive(base,new Set(keys))}
test('unmodified ledger renders EXACT existing full message and money',()=>{
 const b=bet('hn 21 b10n dd5n. 21 22 da20n. 55 dau5n dui15n.');
 const v=cut(b,[]);
 assert.equal(v.pretty,b.pretty);assert.equal(v.total,b.total);
 assert.deepEqual(Array.from(v.sections,x=>x.text),Array.from(b.sections,x=>x.text));
});
test('CUT B retains only DA/DD/DAU/DUI and conserved money',()=>{
 const b=bet('hn 21 b10n dd5n. 21 22 da20n.');
 const v=cut(b,['b|21']);
 assert.equal(v.pretty.includes(' b11n'),false);
 assert.equal(v.pretty.includes('dd5n'),true);assert.equal(v.pretty.includes('da20n'),true);
 assert.equal(v.total,'25');assert.equal(v.cutTotal,'11');assert.equal(BigInt(v.total)+BigInt(v.cutTotal),BigInt(b.total));
 assert.equal(v.sections.find(x=>x.kind==='b').text,'');
});
test('CUT one of 2 grouped BAO numbers retains other number exactly',()=>{
 const b=bet('hn 21 22 b10n dd5n', {...opts,tick:false});
 const v=cut(b,['b|21']);
 assert.match(v.pretty,/22 b10n/u);assert.doesNotMatch(v.pretty,/21 b10n/u);
 assert.equal(v.total,'20');assert.equal(v.cutTotal,'10');
});
test('CUT same-number DAU keeps DUI valid without recomputing',()=>{
 const b=bet('hn 55 dau5n dui15n', {...opts,tick:false});
 const v=cut(b,['dau|55']);assert.match(v.pretty,/55 dui15n/u);
 assert.equal(v.total,'15');assert.equal(v.cutTotal,'5');
});
test('cut all -> empty combined/groups; undo by restoring keys recovers bytes',()=>{
 const b=bet('hn 21 b10n dd5n');
 const keys=b.rows.map(QuytCutLedger.key);
 const v=cut(b,keys);assert.equal(v.pretty,'');assert.equal(v.total,'0');assert.equal(v.sections.every(x=>!x.text),true);
 assert.equal(cut(b,[]).pretty,b.pretty);
});
test('unknown cut and tampered base fail closed without materializing money',()=>{
 const b=bet('hn 21 b10n');
 assert.throws(()=>cut(b,['b|99']),/HOLD_LEDGER_UNKNOWN_CUT/u);
 const corrupted={...b,total:'9999'};
 assert.throws(()=>cut(corrupted,['b|21']),/HOLD_LEDGER_MONEY_CONSERVATION/u);
});

 
// F5 replay gate regression: execute the actual inline restoreCuts() source.
// Test data is synthetic and no Clipboard, Router or Telegram is touched.
const savedCutBegin=html.indexOf('function restoreCuts(){');
const savedCutEnd=html.indexOf('function resetFrames(){',savedCutBegin);
assert.ok(savedCutBegin>=0&&savedCutEnd>savedCutBegin,'Cut recovery source anchors');
const runRestore=new Function('cutGuard','cutScope','sessionStorage','cutStorageKey',
 "'use strict';let cutKeys=new Set(),cutUndo=[];"+html.slice(savedCutBegin,savedCutEnd)+
 ';restoreCuts();return {keys:[...cutKeys],undo:cutUndo}');
const syntheticCutScope=JSON.stringify(['hn 21 b10n dd5n','quyt','mb',true,'1.067']);
const recover=(guard,record)=>runRestore(guard,()=>syntheticCutScope,{getItem:()=>record},'SYNTHETIC_CUT');
test('F5 HOLD: a completed Cut with missing saved ledger never replays numbers',()=>{
 assert.throws(()=>recover({phase:'cut',scope:syntheticCutScope},null),/HOLD_SAVED_CUT_CORRUPT/u);
});
test('F5 HOLD: a completed Cut with another scope never replays numbers',()=>{
 const mismatched=JSON.stringify({scope:'OTHER',keys:['b|21'],undo:[[]]});
 assert.throws(()=>recover({phase:'cut',scope:syntheticCutScope},mismatched),/HOLD_SAVED_CUT_CORRUPT/u);
});
test('F5 valid scoped Cut: restored keys exclude already Cut numbers',()=>{
 const receipt=JSON.stringify({scope:syntheticCutScope,keys:['b|21'],undo:[[]]});
 assert.deepEqual(recover({phase:'cut',scope:syntheticCutScope,receipt},receipt),{keys:['b|21'],undo:[[]]});
});
test('F5 initial use without cut guard does not falsely HOLD',()=>{
 assert.deepEqual(recover(null,null),{keys:[],undo:[]});
});
test('F5 malformed stored Cut must HOLD',()=>{
 assert.throws(()=>recover({phase:'cut',scope:syntheticCutScope},'{oops'),/HOLD_SAVED_CUT_CORRUPT/u);
});

// Source-bound orphaned Cut receipt gate: test the actual HTML code on F5.
const guardStart=html.indexOf('function loadGuard(){');
const guardEnd=html.indexOf('function writeGuard(',guardStart);
assert.ok(guardStart>=0&&guardEnd>guardStart,'guard source anchors');
const readGuard=new Function('guardText','ledgerText',
 "'use strict';const cutGuardKey='QA_G',cutStorageKey='QA_L';let cutGuard=null;"+
 "const sessionStorage={getItem:key=>key===cutGuardKey?guardText:key===cutStorageKey?ledgerText:null};"+
 html.slice(guardStart,guardEnd)+';loadGuard();return cutGuard');
const sourceCutReceipt=JSON.stringify({scope:'SYNTHETIC',keys:['b|21'],undo:[[]]});
test('F5 missing replay guard with Cut receipt must HOLD, never uncut',()=>{
 assert.deepEqual(readGuard(null,sourceCutReceipt),{scope:'ORPHANED',phase:'blocked'});
});
test('F5 malformed Cut receipt with missing replay guard must HOLD',()=>{
 assert.deepEqual(readGuard(null,'{bad'),{scope:'CORRUPT',phase:'blocked'});
});
test('F5 missing replay guard but prior Undo history must HOLD',()=>{
 assert.deepEqual(readGuard(null,JSON.stringify({scope:'SYNTHETIC',keys:[],undo:[[]]})),
  {scope:'ORPHANED',phase:'blocked'});
});
test('F5 first use and empty untouched ledger remain eligible',()=>{
 assert.equal(readGuard(null,null),null);
 assert.equal(readGuard(null,JSON.stringify({scope:'SYNTHETIC',keys:[],undo:[]})),null);
});
test('F5 valid completed Cut replay guard is preserved',()=>{
 assert.deepEqual(readGuard(JSON.stringify({scope:'SYNTHETIC',phase:'cut'}),sourceCutReceipt),
  {scope:'SYNTHETIC',phase:'cut'});
});

test('F5 HOLD: same-scope Cut ledger deleting a previously-Cut number is rejected',()=>{
 const signed=JSON.stringify({scope:syntheticCutScope,keys:['b|21'],undo:[[]]});
 const modified=JSON.stringify({scope:syntheticCutScope,keys:[],undo:[]});
 assert.throws(()=>recover({phase:'cut',scope:syntheticCutScope,receipt:signed},modified),/HOLD_SAVED_CUT_CORRUPT/u);
});
test('F5 HOLD: same-scope Cut ledger with forged number is rejected',()=>{
 const signed=JSON.stringify({scope:syntheticCutScope,keys:['b|21'],undo:[[]]});
 const modified=JSON.stringify({scope:syntheticCutScope,keys:['b|99'],undo:[[]]});
 assert.throws(()=>recover({phase:'cut',scope:syntheticCutScope,receipt:signed},modified),/HOLD_SAVED_CUT_CORRUPT/u);
});
test('F5 HOLD: historical unbound Cut guard needs manual review (not silent replay)',()=>{
 const signed=JSON.stringify({scope:syntheticCutScope,keys:['b|21'],undo:[[]]});
 assert.throws(()=>recover({phase:'cut',scope:syntheticCutScope},signed),/HOLD_SAVED_CUT_CORRUPT/u);
});
test('F5 KEEP: independently reconciled Undo receipt binds to empty Cut set',()=>{
 const afterUndo=JSON.stringify({scope:syntheticCutScope,keys:[],undo:[]});
 assert.deepEqual(recover({phase:'cut',scope:syntheticCutScope,receipt:afterUndo},afterUndo),{keys:[],undo:[]});
});
