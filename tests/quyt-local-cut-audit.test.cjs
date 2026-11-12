'use strict';
const t=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'quyt-pwa/index.html'),'utf8');
const engine=html.match(/const OfflineKTS=\(\(\)=>\{[\s\S]*?\}\)\(\);/u)?.[0];a.ok(engine);
const ledger=fs.readFileSync(path.join(root,'quyt-pwa/quyt-cut-audit.js'),'utf8');
const {OfflineKTS:E,QuytCutAudit:L}=vm.runInNewContext(engine+'\n'+ledger+'\n;({OfflineKTS,QuytCutAudit})');
const opts={market:'mb',customer:'quyt',tick:true,rate:'1.067'};
const text='60 b 100 dd 100 dau 100 duoi 100\n33 61 dx 5n 526 b10n';
const base=()=>E.merge(text,opts);
const group=(r,b)=>r.rows.filter(x=>x.factorApplied===b).reduce((n,x)=>n+BigInt(x.adjusted),0n);
t('live source 2 lines reconcile 428n multiplied + 15n unchanged with exact original provenance',()=>{
 const b=base(),v=L.derive(b,[]);
 a.equal(v.total,'443');a.equal(v.cutTotal,'0');a.equal(v.sourceCount,2);
 a.equal(group(v,true),428n);a.equal(group(v,false),15n);
 const dx=b.rows.find(x=>x.kind==='dx');
 a.equal(dx.sources[0].line,2);a.equal(dx.sources[0].text,'33 61 dx 5n 526 b10n');
 a.equal(dx.sources[0].money,'5');
 a.equal(b.rows.find(x=>x.kind==='dd').sources[0].line,1);
});
t('cut DD only, no re-multiply; Undo from empty cut selection exactly restores 443n',()=>{
 const b=base(),k=L.key(b.rows.find(x=>x.kind==='dd')),cut=L.derive(b,[k]);
 a.equal(cut.total,'336');a.equal(cut.cutTotal,'107');a.equal(cut.cutCount,1);
 a.equal(group(cut,true),321n);a.equal(group(cut,false),15n);
 a.equal(L.derive(b,[]).total,'443');a.equal(b.total,'443');
});
t('DX 5n can be cut independently without affecting 428n multiplied',()=>{
 const b=base(),cut=L.derive(b,[L.key(b.rows.find(x=>x.kind==='dx'))]);
 a.equal(cut.total,'438');a.equal(group(cut,true),428n);a.equal(group(cut,false),10n);
});
t('independent repeated source lines combine exact stake provenance per canonical number',()=>{
 const b=E.merge('21 b10n\n21 b20n',opts);
 a.equal(b.rows.length,1);a.equal(b.rows[0].raw,'30');a.equal(b.rows[0].adjusted,'32');
 a.deepEqual([...b.rows[0].sources].map(x=>x.line),[1,2]);
 a.deepEqual([...b.rows[0].sources].map(x=>x.money),['10','20']);
 a.equal(L.derive(b,[]).total,'32');
});
t('unknown cut, duplicates, tampered source and money cannot produce an output',()=>{
 const b=base(),key=L.key(b.rows[0]);
 a.throws(()=>L.derive(b,['fake']),/HOLD_CUT_BASE_MISMATCH/u);
 a.throws(()=>L.derive(b,[key,key]),/HOLD_CUT_BASE_OR_SET_INVALID/u);
 a.throws(()=>L.derive({...b,total:'442'},[]),/HOLD_CUT_BASE_MISMATCH/u);
 a.throws(()=>L.derive({...b,rows:b.rows.map(r=>({...r,sources:[]}))},[]),/HOLD_CUT_ROW_INVALID/u);
 a.throws(()=>L.derive({...b,rows:b.rows.map((r,i)=>i===0?{...r,raw:'900'}:r)},[]),/HOLD_CUT_ORIGINAL_MONEY_MISMATCH/u);
});
t('exact customer/region/source/factor scope and isolated session key',()=>{
 const s=L.scope(text,'quyt','mb','',true,'1.067');
 a.notEqual(s,L.scope(text+' ','quyt','mb','',true,'1.067'));
 a.notEqual(s,L.scope(text,'quyt','mn','',true,'1.067'));
 a.notEqual(s,L.scope(text,'quyt','mb','',true,'1.10'));
 a.equal(L.storageKey,'KTS_QUYT_V21_CUT_AUDIT_SCOPE_V1');
});
