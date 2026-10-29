"use strict";
// Regression: Cut operates on RESULT rows only. SOURCE remains raw text,
// even when an exact-output ledger is required for unrepresentable partial Cut.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const source=html.match(/<script>\s*([\s\S]*?)<\/script>/i)?.[1];
assert.ok(source,"root application script missing");
const origin="[10/22/2026 4:05 PM] Thiên: 3d 35 52 68 dx 5n\n"+
  "————MT————\n3d 12 21 b10n";
const prefix="[[KTS_EXACT_OUTPUT_LEDGER_V1]]\n";
const readLedger=(s)=>{if(!s.startsWith(prefix))return null;
  try{const data=JSON.parse(s.slice(prefix.length));return typeof data.origin==="string"&&Array.isArray(data.rows)?data:false}
  catch(_){return false}};
const elements=new Map();
function $(id){if(!elements.has(id))elements.set(id,{
  id,value:"",placeholder:"",textContent:"",disabled:false,readOnly:false,style:{display:""},
});return elements.get(id)}
function scopedFunction(code,start,end,name,ctx){
  const a=code.indexOf(start),b=code.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,"missing source function: "+name);
  return new Function("scope","with(scope){\n"+code.slice(a,b)+"\nreturn "+name+";}")(ctx);
}
const renderCtx={inputEl:$("input"),$,EXACT_OUTPUT_LEDGER_PREFIX:prefix,
  parseExactOutputLedger:readLedger,ledgerCheckboxBindings:[{index:0}]};
const render=scopedFunction(source,"function renderLedgerWork(){",
 "\nasync function copySourceView(){","renderLedgerWork",renderCtx);
assert.match(html,/<textarea id="ledgerSourceView" readonly/);
assert.match(html,/<div id="ledgerWorkRows" style="display:none">/);
assert.match(html,/<div id="resultGroups"/);
assert.ok(source.includes("inputEl.value=serializeExactOutputLedger()"),"exact ledger safety retention required");
assert.ok(source.includes("persistExactOutputLedger()"),"persistent ledger safety required");
assert.ok(source.includes("function restoreCutDraft("),"Undo receipt remains available");
const full=[{id:"a",text:"3d 35 52 dx 5n",sourceLine:1,alive:true},
 {id:"b",text:"3d 35 68 dx 5n",sourceLine:1,alive:true}];
let rows=full.map(r=>({...r})),clip=[],snapshots=[],stored="",announcements=0;
const cutCtx={
  outputRecords:rows,inputEl:renderCtx.inputEl,outputEl:$("output"),
  EXACT_OUTPUT_LEDGER_PREFIX:prefix,
  checkedResultRecordIndexes:new Set([0]),checkedAliveRecordIndexes:()=>[0],
  selectedAliveRecordIndexes:()=>[0],groupedResultReady:true,
  writeClipboardText:async text=>{clip.push(text);return true},
  rememberOutputSelection(){},snapshot(){snapshots.push({source:this.inputEl.value,
   rows:this.outputRecords.map(r=>({...r}))});this.undoStack.push({})},
  undoStack:[],lastSourceLines:[],lastOutputSelection:{start:0,end:0},workingLedger:{origin},
  deleteCompletedSourceLines(){},cutOutputMatchesExecutableSource:()=>false,
  serializeExactOutputLedger(){
    return prefix+JSON.stringify({origin,rows:cutCtx.outputRecords.filter(r=>r.alive).map(r=>({...r}))})
  },renderOutputRecords(){this.outputEl.value=this.outputRecords.filter(r=>r.alive).map(r=>r.text).join("\n")},
  // The real application requires an explicit true after durable storage.
  // An undefined stub falsely invokes the rollback error path.
  persistExactOutputLedger(){stored=this.inputEl.value;return true},
  announceWorkingSource(){announcements++},setStatus(){},
};
const cut=scopedFunction(source,"async function cutSelectedOutput(){",
 "\nfunction resolveExplicitSourceRegion(","cutSelectedOutput",cutCtx);
async function testRoot(){
  cutCtx.inputEl.value=origin;
  await cut();
  assert.deepEqual(clip,[full[0].text],"only the selected result must be copied");
  assert.equal(rows[0].alive,false);
  assert.equal(rows[1].alive,true);
  assert.ok(stored.startsWith(prefix),"survivor is retained in exact-output ledger");
  assert.equal(readLedger(stored).rows.length,1);
  assert.equal(announcements,1);
  assert.equal(cutCtx.outputEl.value,full[1].text,"only uncut result is visible");
  render();
  assert.equal($("ledgerSourceView").value,full[1].text,
    "working source shows ONLY surviving wagers after Cut");
  assert.equal($("ledgerWorkOrigin").textContent,origin,
    "immutable original chat and physical source lines remain visible in audit reference");
  assert.equal($("ledgerWork").style.display,"");
  assert.equal($("input").style.display,"none","internal ledger is never shown as an editable source ticket");
  assert.equal($("sourceCutBtn").style.display,"none","source Cut must not corrupt protected ledger");
  assert.equal($("ledgerWorkCut").disabled,true);
  assert.equal($("ledgerCopyOriginal").disabled,false);
  assert.equal(cutCtx.inputEl.value,stored,"display must not overwrite ledger bytes");
  // Invalid or cross-mode ledger remains fail closed.
  cutCtx.inputEl.value=prefix+"corrupt";render();
  assert.equal($("ledgerSourceView").value,"");
  assert.equal($("ledgerCopyOriginal").disabled,true);
  // Undo receipt retains exact pre-Cut rows and input, normal source editable.
  assert.equal(snapshots.length,1);
  cutCtx.inputEl.value=snapshots[0].source;
  rows=snapshots[0].rows;cutCtx.outputRecords=rows;
  render();
  assert.equal($("input").style.display,"");
  assert.equal($("ledgerWork").style.display,"none");
  assert.equal(rows.filter(r=>r.alive).length,2);
  // Clipboard failure must not Cut a result, replace source, or write ledger.
  cutCtx.checkedResultRecordIndexes.add(0);
  cutCtx.writeClipboardText=async()=>false;const before=cutCtx.inputEl.value;
  await cut();assert.equal(cutCtx.inputEl.value,before);
  assert.equal(rows.filter(r=>r.alive).length,2);
}
async function testDaVong(){
  const p=path.join(root,"app","unified-core.js");
  if(!fs.existsSync(p))return;
  const code=fs.readFileSync(p,"utf8");
  const els=new Map(),el=id=>{if(!els.has(id))els.set(id,{
    value:"",readOnly:false,disabled:false,style:{display:""},textContent:"",className:""
  });return els.get(id)};
  const result=[{id:"r1",text:"3d 35 52 dx 5n",alive:true},
    {id:"r2",text:"3d 35 68 dx 5n",alive:true}];
  el("dvInput").value=origin;
  const ctx={$:el,ledgerActive:false,live:()=>result.filter(r=>r.alive),
    picked:()=>result.filter(r=>r.alive),activeGroups:()=>[{id:"g1"}],
    selectionBindings:[],groupList(){},undoStack:[]};
  const draw=scopedFunction(code,"  function render(){","\n  async function cut(){","render",ctx);
  draw();assert.equal(el("dvInput").readOnly,false);
  result[0].alive=false;ctx.ledgerActive=true;draw();
  assert.equal(el("dvInput").value,origin);
  assert.equal(el("dvInput").readOnly,true,"partial Cut protects raw source edit");
  assert.equal(el("dvInput").style.display,"");
  assert.equal(el("dvWorkingPanel").style.display,"none","never render duplicate result-style source");
  assert.equal(el("dvSourceCut").disabled,true);
  assert.equal(el("dvSourceProtectedNote").style.display,"");
  assert.equal(el("dvOutput").value,result[1].text);
  ctx.ledgerActive=false;draw();
  assert.equal(el("dvInput").readOnly,false);
  assert.equal(el("dvSourceCut").disabled,false);
  assert.equal(el("dvSourceProtectedNote").style.display,"none");
  assert.ok(code.includes("modeLocalLedger=new Map()"),"cross-mode isolation must remain");
  assert.ok(code.includes("undoStack.push({origin"),"Undo snapshot must remain");
}
(async()=>{await testRoot();await testDaVong();
  console.log("SOURCE PANE AFTER RESULT CUT: PASS (root, ledger safety, Undo receipt, clipboard atomicity"+(fs.existsSync(path.join(root,"app","unified-core.js"))?", Da Vong":"")+")");
})().catch(e=>{console.error(e);process.exitCode=1});