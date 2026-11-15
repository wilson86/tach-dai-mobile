'use strict';
// Synthetic-only financial Cut contract. No Router, Telegram, private data or network.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('quyt-pwa/index.html'),calendar=read('quyt-pwa/station_calendar.generated.js');
const engineSource=html.match(/const OfflineKTS=\(\(\)=>\{[\s\S]*?\}\)\(\);/u);
assert.ok(engineSource,'canonical merger source missing');
const ledgerSource=read('quyt-pwa/quyt-source-cut-ledger.js');
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
test('exactly two result buckets have only full-box Cut and Undo; no duplicated source UI',()=>{
 assert.equal([...html.matchAll(/class="total"/gu)].length,2);
 for(const id of ['cutSelectedScaled','cutSelectedUnscaled','scaledCutBefore','scaledCutRemoved','scaledCutAfter',
  'unscaledCutBefore','unscaledCutRemoved','unscaledCutAfter','undoQuytCut','startNewQuytBatch','cutStatus','cutConservation',
  'cutArchiveScaled','cutSavedScaled','copySavedScaled','cutArchiveUnscaled','cutSavedUnscaled','copySavedUnscaled'])
  assert.match(html,new RegExp('id="'+id+'"','u'));
 for(const removed of ['sourceCutCard','cutSourceList','cutBetList','cutRemovedList','cutScaledList','cutUnscaledList','cutSelectedQuyt'])
  assert.doesNotMatch(html,new RegExp('id="'+removed+'"','u'));
 assert.match(html,/CẮT KHUNG ĐÃ NHÂN ×1\.067/u);
 assert.match(html,/CẮT KHUNG GIỮ NGUYÊN/u);
 assert.match(html,/SAO CHÉP TIN ĐÃ CẮT — GIỮ NGUYÊN/u);
 const copyModule=read('quyt-pwa/quyt-live-cut-ui.js');
 assert.match(copyModule,/function copyArchive\(group\)/u);
 assert.match(copyModule,/HOLD_CUT_COPY_ARCHIVE_MONEY_MISMATCH/u);
 assert.match(copyModule,/await writeClipboard\(text,field\)/u);
 assert.match(copyModule,/if\(!cut\(ids,\{group,text,ids\}\)\)/u);
 assert.match(copyModule,/HOLD_CLIPBOARD: KHÔNG CẮT/u);
 assert.doesNotMatch(copyModule,/if\(successful\)copyArchive\(group\)/u);
 assert.match(html,/id="copySavedScaled" type="button" hidden disabled/u);
 assert.match(html,/id="copySavedUnscaled" type="button" hidden disabled/u);
 assert.match(html,/\.cut-archive\{display:none!important\}/u);
 assert.match(copyModule,/cutArchive'\+name\)\.hidden=true/u);
 assert.match(copyModule,/copySavedScaled'\)\.addEventListener\('click',\(\)=>copyArchive\('scaled'\)\)/u);
 assert.match(copyModule,/copySavedUnscaled'\)\.addEventListener\('click',\(\)=>copyArchive\('unscaled'\)\)/u);
 assert.match(html,/SAO CHÉP TIN ĐÃ CẮT ×1\.067/u);
 assert.match(html,/CHƯA NGHIỆM THU ROUTER/u);
 assert.match(copyModule,/KTS_QUYT_MAIN_V4_SOURCE_CUT_V1/u);
 assert.match(html,/<script src="\.\/quyt-source-cut-ledger\.js"><\/script>/u);
 assert.match(html,/<script src="\.\/quyt-live-cut-ui\.js\?v=2026111518"><\/script>/u);
 assert.match(html,/HOLD_PWA_ASSET_VERSION_MISMATCH/u);
 assert.match(html,/QuytLiveCutUI\.review\(OfflineKTS,raw\.value/u);
 assert.match(html,/QuytLiveCutUI\.reset\(\)/u);
 assert.match(html,/QuytLiveCutUI\.init\(redraw\);redraw\(\)/u);
 assert.match(html,/copyScaled'\)\.disabled=true/u);
 assert.doesNotMatch(html,/Telegram\.send|sendBeacon|XMLHttpRequest/u);
 const sw=read('quyt-pwa/sw.js');
 for(const asset of ['./quyt-source-cut-ledger.js','./quyt-live-cut-ui.js','./quyt-live-cut-ui.js?v=2026111518'])assert.ok(sw.includes("'"+asset+"'"));
 assert.equal(read('quyt-pwa/thu-nghiem/index.html'),html);
 assert.equal(read('quyt-pwa/thu-nghiem/quyt-live-cut-ui.js'),read('quyt-pwa/quyt-live-cut-ui.js'));
 assert.equal(read('quyt-pwa/thu-nghiem/quyt-source-cut-ledger.js'),ledgerSource);
});
test('unchecked Quýt factor retains full original amount and no adjusted-bucket entries',()=>{
 const plain=kts.merge(text,{...opts,tick:false});
 assert.equal(plain.sourceTotal,'415');assert.equal(plain.total,'415');
 assert.ok(plain.rows.every(x=>x.factorApplied===false));
 assert.equal(plain.rows.reduce((sum,row)=>sum+BigInt(row.adjusted),0n),415n);
 const whole=ledger.calculate(plain,text,{...opts,tick:false},plain.sourceEntries.map(x=>x.id));
 assert.equal(whole.before,'415');assert.equal(whole.cutOutput,'415');assert.equal(whole.after,'0');
});


function cutReceiverHarness(raw,options){
 const nodes=new Map(),storage=new Map(),clipboard=[];
 const el=id=>{
  if(!nodes.has(id))nodes.set(id,{
   value:'',textContent:'',disabled:false,checked:false,hidden:false,
   parentElement:{hidden:false},handlers:{},
   addEventListener(name,fn){this.handlers[name]=fn},
   focus(){},select(){},blur(){}
  });
  return nodes.get(id);
 };
 const globals={
  document:{getElementById:el,execCommand:()=>false,activeElement:null},
  navigator:{clipboard:{async writeText(value){clipboard.push(value)}}},
  sessionStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  confirm:()=>false
 };
 const app=vm.runInNewContext(calendar+'\n'+engineSource[0]+'\n'+ledgerSource+'\n'+
  read('quyt-pwa/quyt-live-cut-ui.js')+'\n({OfflineKTS,QuytLiveCutUI})',globals);
 for(const [key,value]of Object.entries({raw,market:options.market,customer:options.customer,
  rate:options.rate,businessDate:options.businessDate}))el(key).value=value;
 el('tick').checked=options.tick;
 app.QuytLiveCutUI.init(()=>{});
 const result=app.QuytLiveCutUI.review(app.OfflineKTS,raw,options);
 for(const bucket of ['scaled','unscaled']){
  el(bucket+'Ticket').value=result.rows.filter(row=>Boolean(row.factorApplied)===(bucket==='scaled'))
   .map(row=>(row.station?row.station+' ':'')+row.number.replace('-',' ')+
    ' '+row.kind+row.adjusted+'n.').join('\n');
 }
 return {el,storage,clipboard,result};
}
test('MN/MT review Cut cannot copy or mutate source ledger, even via synthetic disabled-button click',async()=>{
 for(const [raw,market]of [['tg kg 11 b10n','mn'],['kh kt 11 b10n','mt']]){
  const o={market,businessDate:'2026-11-15',customer:'quyt',tick:false,
   rate:'1.067',duplicateConfirmed:false,confirmMissingDaN:false};
  const h=cutReceiverHarness(raw,o);
  assert.ok(h.result.total!=='0');
  assert.equal(h.el('cutSelectedUnscaled').disabled,true);
  assert.equal(h.el('cutSelectedScaled').disabled,true);
  h.el('cutSelectedUnscaled').handlers.click();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(h.clipboard,[]);
  assert.equal(h.storage.size,0);
  assert.match(h.el('cutStatus').textContent,/HOLD_CUT_MNMT_RECEIVER_UNAPPROVED/u);
 }
});
test('existing original MB no-factor Cut still copies once and commits source ID',async()=>{
 const o={market:'mb',businessDate:'',customer:'quyt',tick:false,
  rate:'1.067',duplicateConfirmed:false,confirmMissingDaN:false};
 const h=cutReceiverHarness('11 b10n',o);
 assert.equal(h.el('cutSelectedUnscaled').disabled,false);
 h.el('cutSelectedUnscaled').handlers.click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(h.clipboard,['11 b10n.']);
 const saved=JSON.parse(h.storage.get('KTS_QUYT_MAIN_V4_SOURCE_CUT_V1'));
 assert.deepEqual(saved.keys,['1:0']);
 assert.equal(h.result.total,'10');
});
