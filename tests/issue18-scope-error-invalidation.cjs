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
"let scopeRevision=0;"+
"const state={input:'86 lo75n',cut:'KEEP_ORIGINAL_CUT_RECEIPT',undo:'KEEP_UNDO',approval:'OLD_DRAW_APPROVED',approvalClearCount:0,persistWrites:0,parseCalls:0,redraws:0,status:''};"+
"const resetOutputRecords=()=>{state.redraws++};"+
"const setStatus=s=>{state.status=s};"+
"const updateUI=(allowScopeRehydrate=true)=>{state.scheduleCalls=(state.scheduleCalls||0)+1;(state.rehydrateFlags||=[]).push(allowScopeRehydrate)};"+
"const clearDuplicateConfirmation=()=>{state.approval=null;state.approvalClearCount++};"+
"const regionEl={addEventListener:(k,cb)=>events.region=cb};"+
"const dateEl={addEventListener:(k,cb)=>events.date=cb};"+
"const todayEl={checked:true,addEventListener:(k,cb)=>events.today=cb};"+
handlers+
";const snapshots=[];for(const k of ['region','date','today']){"+
" outputEl.value='OLD_SCOPE_ERROR';events[k]();snapshots.push({event:k,output:outputEl.value,status:state.status,checked:todayEl.checked});"+
"};state.scopeRevision=scopeRevision;return {state,snapshots};");
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
assert.equal(result.state.scopeRevision,3,'each scope change invalidates previous Undo scope revision');
assert.deepEqual(result.state.rehydrateFlags,[false,false,false], 'scope change must NOT auto-rehydrate old Cut ledger');
const resetStart=source.indexOf('function resetOutputRecords(){');
const resetEnd=source.indexOf('function renderOutputRecords(){',resetStart);
assert.ok(resetStart>=0&&resetEnd>resetStart,'reset source anchors');
assert.doesNotMatch(source.slice(resetStart,resetEnd),/localStorage|sessionStorage|inputEl\.value|undoStack/u,
 'resetOutputRecords must not mutate raw wager, storage or undo stack');
console.log('ISSUE18_SCOPE_STALE_VIEW=PASS 3/3; SOURCE_CUT_PRESERVED=PASS; NATIVE_NODE=PASS');

const undoStart=source.indexOf('$("undoBtn").addEventListener("click",()=>{');
const undoEnd=source.indexOf('// Scope changes invalidate',undoStart);
assert.ok(undoStart>=0&&undoEnd>undoStart,'real Undo handler anchors');
const actualUndo=source.slice(undoStart,undoEnd);
const simulateUndo=new Function('priorRevision','activeRevision',
 "'use strict';let undo;let scopeRevision=activeRevision,storageWrites=0,holdCalls=0;"+
 "const undoStack=[{scopeRevision:priorRevision,input:'MN_OLD_SOURCE',output:'MN_OLD_RESULT',status:'ok',cls:'status ok',"+
 "outputRecords:[{id:'1',text:'21 b10n',sourceLine:1,alive:true}],sourceLines:['MN_OLD_SOURCE'],workingLedger:{origin:'MN_OLD_SOURCE'}}];"+
 "const inputEl={value:'MB_SOURCE'},outputEl={value:''},statusEl={textContent:'Select MB',className:'status'},resultCard={className:''};"+
 "let outputRecords=[],workingLedger=null,lastSourceLines=[],lastOutputSelection={start:0,end:0};"+
 "const checkedResultRecordIndexes=new Set();"+
 "const $=()=>({addEventListener:(_event,fn)=>{undo=fn}}),holdIfBusinessEngineStale=()=>false,"+
 "cloneLedger=x=>x===null?null:JSON.parse(JSON.stringify(x)),renderGroupedResults=()=>{},renderLedgerWork=()=>{},"+
 "persistExactOutputLedger=()=>{storageWrites++;return true},setStatus=msg=>{holdCalls++;statusEl.textContent=msg},announceWorkingSource=()=>{};"+
 actualUndo+";undo();return {input:inputEl.value,output:outputEl.value,storageWrites,holdCalls,status:statusEl.textContent,stack:undoStack.length};");
const staleUndo=simulateUndo(1,2);
assert.equal(staleUndo.input,'MB_SOURCE','cross-draw Undo does not restore source from previous region');
assert.equal(staleUndo.output,'','cross-draw Undo cannot restore old wager output');
assert.equal(staleUndo.storageWrites,0,'cross-draw Undo cannot mutate durable money storage');
assert.equal(staleUndo.stack,1,'blocked Undo leaves original receipt untouched');
assert.match(staleUndo.status,/HOLD_UNDO_SCOPE_CHANGED/u,'cross-draw Undo must emit specific HOLD');
const sameScopeUndo=simulateUndo(2,2);
assert.equal(sameScopeUndo.output,'MN_OLD_RESULT','valid same-scope Undo is still allowed');
assert.equal(sameScopeUndo.storageWrites,1,'valid same-scope Undo remains durable');
assert.equal(sameScopeUndo.stack,0,'valid same-scope Undo pops one snapshot');
assert.match(source,/undoStack\.push\(\{\s*scopeRevision,/u,'new Undo snapshot must bind current scope');
assert.match(source,/undoStack\.push\(\{\.\.\.cloneLedger\(exactLedger\.undoReceipt\),scopeRevision\}\)/u,
 'validated F5 durable receipt must bind to current scope');
console.log('ISSUE18_UNDO_CROSS_SCOPE_HOLD=PASS 5 checks; VALID_UNDO=PASS 3 checks');

const reconcileStart=source.indexOf('function reconcileStoredLedgerScope(');
const reconcileEnd=source.indexOf('function saveSettings(){',reconcileStart);
assert.ok(reconcileStart>=0&&reconcileEnd>reconcileStart,'actual ledger scope reconciliation anchors');
const reconcileSource=source.slice(reconcileStart,reconcileEnd);
const reviewReconcile=new Function('allowRehydrate','sameScope',
 "'use strict';let pendingIncompatibleLedger=true,rehydrated=0,cleared=0;"+
 "const EXACT_OUTPUT_LEDGER_STORAGE_KEY='REVIEW_KEY',EXACT_OUTPUT_LEDGER_PREFIX='[[LEDGER]]',INCOMPATIBLE_LEDGER_WARNING='HOLD';"+
 "const inputEl={value:'SIGNED_LEDGER'},outputEl={value:''},"+
 "localStorage={getItem:()=> 'SIGNED_LEDGER'},parseExactOutputLedger=()=>sameScope,"+
 "resetOutputRecords=()=>{cleared++},setStatus=()=>{},"+
 "run=()=>{rehydrated++;outputEl.value='OLD_DRAW_CUT_OUTPUT'};"+
 reconcileSource+
 ";reconcileStoredLedgerScope(allowRehydrate);"+
 "return {rehydrated,cleared,output:outputEl.value,pending:pendingIncompatibleLedger};");
const switchedBack=reviewReconcile(false,true);
assert.equal(switchedBack.rehydrated,0,'draw switch must never rehydrate stored Cut output automatically');
assert.equal(switchedBack.output,'','draw switch keeps results hidden even if stored ledger matches selected draw');
assert.equal(switchedBack.pending,true,'manual recheck remains required after scope switch');
const startup=reviewReconcile(true,true);
assert.equal(startup.rehydrated,1,'boot restore of previously verified same-scope ledger remains supported');
assert.equal(startup.pending,false,'validated boot restore clears hold');
const crossDraw=reviewReconcile(false,false);
assert.equal(crossDraw.rehydrated,0,'cross-draw ledger never auto-runs');
assert.equal(crossDraw.cleared,1,'cross-draw ledger mismatch preserves HOLD');
console.log('ISSUE18_NO_AUTO_REHYDRATE=PASS 7 checks; COLD_BOOT_RECEIPT=PASS');
