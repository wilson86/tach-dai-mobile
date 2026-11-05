'use strict';
// Purpose-built PUBLIC synthetic fixture. No real customer's wager text or
// approved private order numbers should ever be committed here.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../quyt-pwa');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const engine=html.match(/const OfflineKTS=\(\(\)=>\{[\s\S]*?\}\)\(\);/u);
assert.ok(engine,'source-bound standalone engine missing');
const ledger=fs.readFileSync(path.join(root,'quyt-cut-ledger.js'),'utf8');
const {OfflineKTS,QuytCutLedger}=vm.runInNewContext(engine[0]+'\n'+ledger+'\n;({OfflineKTS,QuytCutLedger})');
const messages=[
 'hn 01 lo15n.',
 'hn 02 bao15n.',
 'hn 03 b5n.',
 'hn 04 b75n.',
 'hn 05 06 da10n. 07 dd20n.',
 'hn 08 dau5n dui15n.'
];
const single='hn 01 02 lo15n. 03 b5n. 04 bao75n. 05 06 da10n. 07 dd20n. 08 dau5n dui15n.';
const many=messages.join('\n');
const options={market:'mb',customer:'quyt',tick:true,rate:'1.067'};
const totals=r=>Object.fromEntries(r.sections.map(s=>[s.kind,BigInt(s.total)]));
test('synthetic multi-kind base money is 160n and 8 canonical rows',()=>{
 const r=OfflineKTS.merge(single,{...options,tick:false});
 assert.equal(r.total,'160');assert.equal(r.rows.length,8);
 assert.deepEqual({...totals(r)},{b:110n,da:10n,xc:0n,dd:20n,dau:5n,dui:15n});
});
test('synthetic 1.067 HALF_UP is applied ONCE to B/BAO/LO, never DD, DA, DAU, DUI',()=>{
 const r=OfflineKTS.merge(single,options);
 assert.equal(r.total,'167');
 assert.deepEqual({...totals(r)},{b:117n,da:10n,xc:0n,dd:20n,dau:5n,dui:15n});
 assert.equal(r.rows.find(x=>x.kind==='b'&&x.number==='04').adjusted,'80');
 assert.equal(r.rows.find(x=>x.kind==='b'&&x.number==='04').beforeRounding,'80.025');
 assert.match(r.pretty,/04 b80n/u);assert.doesNotMatch(r.pretty,/\d+[.,]\d+n\b/u);
});
test('six independent synthetic messages add rather than overwrite source bets',()=>{
 const a=OfflineKTS.merge(single,options),b=OfflineKTS.merge(many,options);
 assert.equal(b.sourceCount,6);assert.equal(b.total,a.total);assert.equal(b.rows.length,a.rows.length);
 assert.deepEqual({...totals(b)},{...totals(a)});
 for(const x of a.rows)assert.equal(b.rows.find(z=>z.kind===x.kind&&z.number===x.number).adjusted,x.adjusted);
});
test('two pasted identical messages HOLD absent a distinct placement confirmation',()=>{
 const src='hn 09 b75n\nhn 09 b75n';
 assert.throws(()=>OfflineKTS.merge(src,options),/TIN_TRÙNG_CHƯA_XÁC_NHẬN/u);
 assert.equal(OfflineKTS.merge(src,{...options,duplicateConfirmed:true}).total,'160');
});
test('Cut all B preserves 50n; Undo exactly restores the original already rounded output',()=>{
 const r=OfflineKTS.merge(many,options);
 const c=QuytCutLedger.derive(r,r.rows.filter(x=>x.kind==='b').map(QuytCutLedger.key));
 assert.equal(c.total,'50');assert.equal(c.cutTotal,'117');
 assert.equal(BigInt(c.total)+BigInt(c.cutTotal),BigInt(r.total));
 assert.equal(c.sections.find(x=>x.kind==='b').text,'');
 const u=QuytCutLedger.derive(r,[]);assert.equal(u.total,'167');assert.equal(u.pretty,r.pretty);
});
test('partial Cut of one B number preserves the other B and non-B amounts',()=>{
 const r=OfflineKTS.merge(single,options),c=QuytCutLedger.derive(r,['b|04']);
 assert.equal(c.cutTotal,'80');assert.equal(c.total,'87');
 assert.equal(c.sections.find(x=>x.kind==='dd').total,'20');
 assert.match(c.pretty,/01 02 b16n/u);assert.doesNotMatch(c.pretty,/04 b80n/u);
});
