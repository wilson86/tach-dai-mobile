'use strict';
// WILSON86 KTS: exact source-extracted async Cut/Clipboard race contract.
// Synthetic text only; no Router, Telegram, payment, production or browser state.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
function between(a,b){
 const start=src.indexOf(a),end=src.indexOf(b,start);
 assert.ok(start>=0&&end>start,'Missing exact index.html source boundary '+a);
 return src.slice(start,end);
}
const resultSource=between('async function cutSelectedOutput(){','function resolveExplicitSourceRegion(');
const sourceSource=between('async function cutSelectedSourceLines(){','async function copyLedgerWork(){');
assert.match(src,/let cutInFlight=false;/u,'must use shared Cut lock');
const simulate=new Function('which','scenario',
 "'use strict';let cutInFlight=false,scopeRevision=0,copyCalls=0,snapshots=0,writes=0,redraws=0,parses=0,announcements=0;let resolveClipboard;"+
 "const notices=[],EXACT_OUTPUT_LEDGER_PREFIX='[[LEDGER]]',groupedResultReady=true,outputRecords=[{text:'21 b10n',alive:true}];"+
 "const inputEl={value:'21 b10n\\n22 b5n',selectionStart:0,selectionEnd:7},outputEl={value:'21 b10n'},"+
 "const undoStack=[],checkedResultRecordIndexes=new Set(),lastOutputSelection={start:0,end:0};let lastSourceLines=[],workingLedger=null;"+
 "const holdIfBusinessEngineStale=()=>false,rememberOutputSelection=()=>{},checkedAliveRecordIndexes=()=>[0],"+
 "selectedAliveRecordIndexes=()=>[0],setStatus=(message)=>{notices.push(message)},"+
 "writeClipboardText=()=>{copyCalls++;return new Promise(done=>resolveClipboard=done)},"+
 "snapshot=()=>{snapshots++;undoStack.push({input:inputEl.value,output:outputEl.value,outputRecords:outputRecords.map(r=>({...r})),sourceLines:[],workingLedger:null})},"+
 "serializeExactOutputLedger=()=> '[[LEDGER]]SYNTHETIC',"+
 "renderOutputRecords=()=>{redraws++},renderLedgerWork=()=>{},"+
 "persistExactOutputLedger=()=>{writes++;return true},restoreCutDraft=()=>{throw Error('UNEXPECTED_RESTORE')},"+
 "run=()=>{parses++},resetOutputRecords=()=>{},announceWorkingSource=()=>{announcements++};"+
 resultSource+sourceSource+
 ";return (async()=>{const first=which==='source'?cutSelectedSourceLines():cutSelectedOutput();"+
 "const second=which==='source'?cutSelectedOutput():cutSelectedSourceLines();"+
 "if(scenario==='scope')scopeRevision++;"+
 "if(scenario==='edit')inputEl.value='NEW_SOURCE';"+
 "resolveClipboard(scenario!=='denied');await Promise.all([first,second]);"+
 "return {copyCalls,snapshots,writes,redraws,parses,announcements,cutInFlight,input:inputEl.value,notices};})();");
async function check(which,scenario){
 const r=await simulate(which,scenario);
 assert.equal(r.copyCalls,1,'only one clipboard Cut is in flight across panes');
 assert.equal(r.cutInFlight,false,'Cut lock must release even on failure/HOLD');
 assert.match(r.notices.join(' | '),/HOLD_CUT_BUSY/u,'second Cut blocked');
 if(scenario==='scope'||scenario==='edit'){
  assert.equal(r.snapshots,0,'stale Copy must not make Undo snapshots');
  assert.equal(r.writes,0,'stale Copy must not persist wagers');
  assert.match(r.notices.join(' | '),/HOLD_CUT_STALE_COPY/u,'stale Copy must HOLD');
 }else if(scenario==='denied'){
  assert.equal(r.snapshots,0,'denied Clipboard has no Cut');
  assert.equal(r.writes,0,'denied Clipboard has no ledger persistence');
 }else{
  assert.equal(r.snapshots,1,'legitimate Copy/Cut snapshots exactly once');
  assert.equal(r.writes,1,'legitimate Copy/Cut saves exactly once');
  assert.equal(r.announcements,1,'legitimate Cut advertises source exactly once');
 }
 return r;
}
(async()=>{
 for(const mode of ['result','source']){
  for(const scenario of ['scope','edit','denied','ok'])
   await check(mode,scenario);
 }
 console.log('ISSUE18_CUT_CLIPBOARD_RACE=PASS 8/8 scenarios, CROSS_PANE_MUTEX=PASS, STALE_MONEY_WRITE=0');
})().catch(error=>{console.error(error);process.exitCode=1});
