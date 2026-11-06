'use strict';
// KTS Issue #18: exact source event handlers, synthetic UI-only regression.
// Never sends Telegram, touches customer money, or mutates production storage.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
const begin=source.indexOf('function invalidateDisplayedResultForScopeChange(){');
const end=source.indexOf('// v2.0.5:',begin);
assert.ok(begin>=0&&end>begin,'scope handlers must exist in actual index.html');
const handlers=source.slice(begin,end);
assert.match(handlers,/regionEl\.addEventListener\("change",updateUIAfterScopeChange\)/u);
assert.match(handlers,/dateEl\.addEventListener\("change",/u);
assert.match(handlers,/todayEl\.addEventListener\("change",updateUIAfterScopeChange\)/u);
const fn=new Function("'use strict';const events={};"+
"const outputEl={value:'PHÁT HIỆN TIN SAI: đài thuộc MN'};"+
"const state={input:'86 lo75n',cut:'KEEP_ORIGINAL_CUT_RECEIPT',undo:'KEEP_UNDO',approval:'OLD_DRAW_APPROVED',approvalClearCount:0,persistWrites:0,parseCalls:0,redraws:0,status:''};"+
"const resetOutputRecords=()=>{state.redraws++};"+
"const setStatus=s=>{state.status=s};"+
"const updateUI=()=>{state.scheduleCalls=(state.scheduleCalls||0)+1};"+
"const clearDuplicateConfirmation=()=>{state.approval=null;state.approvalClearCount++};"+
"const regionEl={addEventListener:(k,cb)=>events.region=cb};"+
"const dateEl={addEventListener:(k,cb)=>events.date=cb};"+
"const todayEl={checked:true,addEventListener:(k,cb)=>events.today=cb};"+
handlers+
";const snapshots=[];for(const k of ['region','date','today']){"+
" outputEl.value='OLD_SCOPE_ERROR';events[k]();snapshots.push({event:k,output:outputEl.value,status:state.status,checked:todayEl.checked});"+
"};return {state,snapshots};");
const result=fn();
assert.equal(result.snapshots.length,3);
for(const snap of result.snapshots){
 assert.equal(snap.output,'',snap.event+' must erase stale result immediately');
 assert.match(snap.status,/Kiểm tra \+ Tách/u,snap.event+' must demand recheck');
}
assert.equal(result.snapshots[1].checked,false,'manual date disables today mode');
assert.equal(result.state.scheduleCalls,3,'scope change updates schedule exactly once each');
assert.equal(result.state.redraws,3,'view invalidation applies for all three scope controls');
assert.equal(result.state.input,'86 lo75n','raw source preserved');
assert.equal(result.state.cut,'KEEP_ORIGINAL_CUT_RECEIPT','persisted Cut untouched');
assert.equal(result.state.undo,'KEEP_UNDO','undo retained');
assert.equal(result.state.persistWrites,0,'scope invalidation writes no persistent storage');
assert.equal(result.state.parseCalls,0,'scope change does not run wager parser automatically');
assert.equal(result.state.approval,null,'old day duplicate approval must be revoked');
assert.equal(result.state.approvalClearCount,3,'region, date and today must each revoke stale duplicate approval');
const resetStart=source.indexOf('function resetOutputRecords(){');
const resetEnd=source.indexOf('function renderOutputRecords(){',resetStart);
assert.ok(resetStart>=0&&resetEnd>resetStart,'reset source anchors');
assert.doesNotMatch(source.slice(resetStart,resetEnd),/localStorage|sessionStorage|inputEl\.value|undoStack/u,
 'resetOutputRecords must not mutate raw wager, storage or undo stack');
console.log('ISSUE18_SCOPE_STALE_VIEW=PASS 3/3; SOURCE_CUT_PRESERVED=PASS; NATIVE_NODE=PASS');
