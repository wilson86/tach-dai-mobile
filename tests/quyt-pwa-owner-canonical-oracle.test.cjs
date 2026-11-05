'use strict';
// WILSON86 approved canonical money fixture, reconstructed as SYNTHETIC wager
// clauses. These are NOT the six real original Telegram messages or source IDs.
// Authority: KTS Issue #18 owner totals: B2775 DA120 DD2664 DAU225 DUI2565 = 8349n.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../quyt-pwa');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const engineScript=html.match(/const OfflineKTS=\(\(\)=>\{[\s\S]*?\}\)\(\);/u);
assert.ok(engineScript,'exact source-bound Quyt engine must be present');
const ledger=fs.readFileSync(path.join(root,'quyt-cut-ledger.js'),'utf8');
const {OfflineKTS,QuytCutLedger}=vm.runInNewContext(engineScript[0]+'\n'+ledger+'\n;({OfflineKTS,QuytCutLedger})');
const segments=[
 '13 31 lo255n. 19 lo45n. 39 lo30n. 71 92 80 lo165n.',
 '52 lo180n. 38 83 57 75 lo300n. 68 76 98 lo60n.',
 '36 63 88 96 lo15n. 86 lo75n. 98 dau225n dui585n.',
 '67 76 dui720n. 30 dui360n. 03 dui180n.',
 '76 dd300n. 15 55 dd600n. 95 dd900n. 06 60 16 61 dd36n.',
 '36 63 88 dd30n. 86 96 dd15n. 83 57 da60n. 83 75 da60n.'
];
const one='hn '+segments.join(' ');
const six=segments.map(x=>'hn '+x).join('\n');
const opts={market:'mb',customer:'quyt',tick:true,rate:'1.067'};
const sections=out=>Object.fromEntries(out.sections.map(x=>[x.kind,BigInt(x.total)]));
const key=(r,kind,num)=>r.rows.find(x=>x.kind===kind&&x.number===num);
test('owner approved canonical 41 bets conserve exactly 8349n before factor',()=>{
 const r=OfflineKTS.merge(one,{...opts,tick:false});
 assert.equal(r.total,'8349');assert.equal(r.rows.length,41);
 assert.deepEqual({...sections(r)},{b:2775n,da:120n,xc:0n,dd:2664n,dau:225n,dui:2565n});
 assert.equal(key(r,'b','39').raw,'30');assert.equal(key(r,'b','86').raw,'75');
});
test('Quyt factor 1.067 once AFTER aggregate produces 8534 integer n',()=>{
 const r=OfflineKTS.merge(one,opts);
 assert.equal(r.total,'8534');
 assert.deepEqual({...sections(r)},{b:2960n,da:120n,xc:0n,dd:2664n,dau:225n,dui:2565n});
 assert.equal(key(r,'b','39').adjusted,'32');
 assert.equal(key(r,'b','86').adjusted,'80');
 assert.equal(key(r,'b','86').beforeRounding,'80.025');
 assert.match(r.pretty,/39 b32n/u);assert.match(r.pretty,/86 b80n/u);
 assert.doesNotMatch(r.pretty,/\d+[,.]\d+n\b/u);
});
test('six distinct synthetic messages aggregate to same 8534n; no placements dropped',()=>{
 const once=OfflineKTS.merge(one,opts);
 const many=OfflineKTS.merge(six,opts);
 assert.equal(many.sourceCount,6);
 assert.equal(many.rows.length,once.rows.length);
 assert.equal(many.total,once.total);
 assert.deepEqual({...sections(many)},{...sections(once)});
 for(const x of once.rows){const y=many.rows.find(z=>z.kind===x.kind&&z.number===x.number);assert.ok(y,x.kind+' '+x.number);assert.equal(y.adjusted,x.adjusted)}
});
test('one source repeated without distinct placement confirmation must HOLD',()=>{
 const raw='hn 21 b75n\nhn 21 b75n';
 assert.throws(()=>OfflineKTS.merge(raw,opts),/TIN_TRÙNG_CHƯA_XÁC_NHẬN/u);
 assert.equal(OfflineKTS.merge(raw,{...opts,duplicateConfirmed:true}).total,'160');
});
test('Cắt all B conserves exact already-rounded 5574n; Undo restores 8534n',()=>{
 const base=OfflineKTS.merge(six,opts);
 const keys=base.rows.filter(r=>r.kind==='b').map(QuytCutLedger.key);
 const cut=QuytCutLedger.derive(base,keys);
 assert.equal(cut.cutTotal,'2960');assert.equal(cut.total,'5574');
 assert.equal(cut.sections.find(x=>x.kind==='b').text,'');
 assert.equal(cut.sections.filter(x=>x.kind!=='b').reduce((n,x)=>n+BigInt(x.total),0n),5574n);
 assert.equal(BigInt(cut.cutTotal)+BigInt(cut.total),BigInt(base.total));
 const undo=QuytCutLedger.derive(base,[]);assert.equal(undo.pretty,base.pretty);assert.equal(undo.total,'8534');
});
test('Cắt only 39 B removes 32n, leaves 86 B80n and all other groups',()=>{
 const base=OfflineKTS.merge(one,opts);
 const after=QuytCutLedger.derive(base,['b|39']);
 assert.equal(after.cutTotal,'32');assert.equal(after.total,'8502');
 assert.doesNotMatch(after.pretty,/39 b32n/u);
 assert.match(after.pretty,/86 b80n/u);
 assert.equal(after.sections.find(x=>x.kind==='dd').total,'2664');
});
