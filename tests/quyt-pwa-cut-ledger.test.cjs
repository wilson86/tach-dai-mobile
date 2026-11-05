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
 assert.equal(v.total,'15');assert.equal(v.cutTotal,'10');
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
