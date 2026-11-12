'use strict';
// Synthetic-only financial Cut contract. No Router, Telegram, private data or network.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('quyt-pwa/quyt-cut-beta/index.html'),calendar=read('quyt-pwa/quyt-cut-beta/station_calendar.generated.js');
const engineSource=html.match(/const OfflineKTS=\(\(\)=>\{[\s\S]*?\}\)\(\);/u);
assert.ok(engineSource,'canonical merger source missing');
const ledgerSource=read('quyt-pwa/quyt-cut-beta/quyt-source-cut-ledger.js');
const {OfflineKTS:kts,QuytSourceCutLedger:ledger}=vm.runInNewContext(
 calendar+'\n'+engineSource[0]+'\n'+ledgerSource+'\n({OfflineKTS,QuytSourceCutLedger})');
const opts={market:'mb',customer:'quyt',businessDate:'',tick:true,rate:'1.067'};
const text='60 b 100 dd 100 dau 100 duoi 100\n33 61 dx 5n 526 b10n';
const baseline=kts.merge(text,opts);
test('exact owner fixture retains source money, 6 independent atoms and two bucket totals',()=>{
 assert.equal(baseline.sourceTotal,'415');assert.equal(baseline.total,'443');
 assert.equal(baseline.sourceEntries.length,6);assert.equal(baseline.sourceCount,2);
 assert.equal(baseline.rows.filter(x=>x.factorApplied).reduce((a,b)=>a+BigInt(b.adjusted),0n),428n);
 assert.equal(baseline.rows.filter(x=>!x.factorApplied).reduce((a,b)=>a+BigInt(b.adjusted),0n),15n);
 assert.equal(baseline.sourceEntries[0].text,'60 b 100 dd 100 dau 100 duoi 100');
 assert.equal(baseline.sourceEntries[4].text,'33 61 dx 5n 526 b10n');
});
test('Cut single source wager recalculates current two frames and conserves whole money',()=>{
 const v=ledger.calculate(baseline,text,opts,['1:0']);
 assert.equal(v.before,'443');assert.equal(v.cutOutput,'107');assert.equal(v.after,'336');
 assert.equal(v.originalBefore,'415');assert.equal(v.cutOriginal,'100');assert.equal(v.originalAfter,'315');
 assert.equal(v.remaining.rows.filter(x=>x.factorApplied).reduce((a,b)=>a+BigInt(b.adjusted),0n),321n);
 assert.equal(v.remaining.rows.filter(x=>!x.factorApplied).reduce((a,b)=>a+BigInt(b.adjusted),0n),15n);
 assert.equal(BigInt(v.before),BigInt(v.cutOutput)+BigInt(v.after));
});
test('Cut complete source physical line removes both DX and 3-digit B, not other source',()=>{
 const ids=baseline.sourceEntries.filter(x=>x.line===2).map(x=>x.id);
 const v=ledger.calculate(baseline,text,opts,ids);
 assert.equal(v.remaining.total,'428');assert.equal(v.cutOutput,'15');assert.equal(v.cutOriginal,'15');
 assert.equal(v.remaining.rows.length,4);assert.equal(v.remaining.sourceCount,2);
 assert.equal(text,'60 b 100 dd 100 dau 100 duoi 100\n33 61 dx 5n 526 b10n');
});
test('Undo and replay is deterministic: [] restores same raw provenance and amount',()=>{
 const cut=ledger.calculate(baseline,text,opts,['1:0']);
 const undo=ledger.calculate(baseline,text,opts,[]);
 assert.equal(cut.after,'336');assert.equal(undo.after,'443');assert.equal(undo.cutOutput,'0');
 assert.equal(JSON.stringify(undo.remaining.sourceEntries),JSON.stringify(baseline.sourceEntries));
});
test('source line allocation remains explicit for dated Telegram envelope and station 2d',()=>{
 const envelope='[11/12/2026 6:06 PM] Cô Quýt: 60 b10n';
 const x=kts.merge(envelope,opts);
 assert.equal(x.sourceEntries[0].text,envelope);assert.equal(x.sourceEntries[0].line,1);
 const mn={...opts,market:'mn',businessDate:'2026-11-12'};
 const y=kts.merge('2d 42 b10n',mn);
 assert.equal(y.rows.length,2);assert.equal(y.total,'22');
 assert.equal(y.sourceEntries.length,1);assert.equal(y.sourceEntries[0].stations.length,2);
 const cut=ledger.calculate(y,'2d 42 b10n',mn,['1:0']);
 assert.equal(cut.remaining.total,'0');assert.equal(cut.originalBefore,'20');assert.equal(cut.cutOriginal,'20');
});
test('rounding after aggregate is recomputed, not subtraction of individually multiplied source',()=>{
 const input='60 b5n\n60 b5n',options={...opts,duplicateConfirmed:true};
 const base=kts.merge(input,options),cut=ledger.calculate(base,input,options,['1:0']);
 assert.equal(base.total,'11');assert.equal(cut.after,'5');assert.equal(cut.cutOutput,'6');
 assert.equal(BigInt(cut.before),BigInt(cut.after)+BigInt(cut.cutOutput));
});
test('fail-closed invalid 3-digit DD and unknown Cut references, no partial output',()=>{
 assert.throws(()=>ledger.calculate(baseline,text,opts,['3:0']),/HOLD_CUT_UNKNOWN_SOURCE/u);
 assert.equal(ledger.calculate(baseline,text,opts,['1:0','1:0']).removed.length,1); // idempotent ledger; UI prevents duplicate Cut
 assert.throws(()=>kts.merge('60 b100n\n123 dd10n',{...opts,excludeBetIds:['2:0']}),/HOLD_3_CHU_SO/u);
 assert.throws(()=>kts.merge('60 b100n\n33 61 xc5n',{...opts,excludeBetIds:['2:0']}),/XC chưa/u);
});
test('exactly 2 money output frames, inline source reconciliation, explicit Copy scaled HOLD',()=>{
 assert.equal([...html.matchAll(/class="total"/gu)].length,2);
 for(const id of ['sourceCutCard','cutBefore','cutRemoved','cutAfter','cutOriginalBefore','cutOriginalRemoved','cutOriginalAfter','cutSourceList','cutBetList','cutRemovedList','undoQuytCut','startNewQuytBatch'])
  assert.match(html,new RegExp('id="'+id+'"','u'));
 assert.match(html,/<script src="\.\/quyt-source-cut-ledger\.js"><\/script>/u);
 assert.match(html,/<script src="\.\/quyt-live-cut-ui\.js"><\/script>/u);
 assert.match(html,/QuytLiveCutUI\.review\(OfflineKTS,raw\.value/u);
 assert.match(html,/QuytLiveCutUI\.reset\(\)/u);
 assert.match(html,/QuytLiveCutUI\.init\(redraw\);redraw\(\)/u);
 assert.match(html,/copyScaled'\)\.disabled=true/u);
 assert.doesNotMatch(html,/Telegram\.send|sendBeacon|XMLHttpRequest/u);
 const sw=read('quyt-pwa/quyt-cut-beta/sw.js');
 for(const asset of ['./quyt-source-cut-ledger.js','./quyt-live-cut-ui.js'])assert.ok(sw.includes("'"+asset+"'"));
 assert.match(html,/BẢN THỬ ĐỘC LẬP/u);
 assert.match(html,/function receiverMarketApproved\(\)\{return false\}/u);
 assert.match(read('quyt-pwa/quyt-cut-beta/quyt-live-cut-ui.js'),/KTS_QUYT_BETA_CUT_LEDGER_V1/u);
});