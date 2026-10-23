"use strict";
// Cross-surface source display contract. Exact wager output is never recomputed on Cut.
// Legacy ambiguous provenance stays visible/readonly and cannot trigger raw source sends.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const src=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8").match(/<script>\s*([\s\S]*?)<\/script>/i)?.[1];
assert.ok(src,"PWA script missing");
const a=src.indexOf("function remainingOriginalSourceLines(");
const b=src.indexOf("async function copySourceView(",a);
assert.ok(a>0&&b>a,"working source renderer missing");
const nodes={};
function $(id){return nodes[id]||(nodes[id]={
  value:"",textContent:"",placeholder:"",disabled:false,readOnly:false,style:{},attributes:{},
  setAttribute(k,v){this.attributes[k]=v}
})}
const input=$("input");
const scope={$,inputEl:input,EXACT_OUTPUT_LEDGER_PREFIX:"[[KTS_EXACT_OUTPUT_LEDGER_V1]]\n",
  ledgerCheckboxBindings:[],regionEl:{value:"mn"},dateEl:{value:"2026-10-24"},
  parseLocalDate:s=>s,localDateISO:()=> "2026-10-24",getSchedule:()=>["tp","la","bp"],
  isStandaloneSeparator:()=>false,
  // Inject the mode's already-confirmed split output without imposing
  // Mobile business semantics on Ngang or vice versa.
  processLine:(source)=>source.startsWith("3d 00 11 22")?
    ["WAGER_A1","WAGER_A2","WAGER_A3"]:
    source.startsWith("3d 33 44 55")?["WAGER_B1","WAGER_B2","WAGER_B3"]:[]};
const api=new Function("scope","with(scope){"+src.slice(a,b)+"\nreturn {remainingOriginalSourceLines,renderLedgerWork};}")(scope);
const source="3d 00 11 22 dx 4n\n3d 33 44 55 dx 2n";
const id=(n,slot,text)=>({id:n+":"+slot+":"+text,text,sourceLine:n});
const all=[id(1,1,"WAGER_A1"),id(1,2,"WAGER_A2"),id(1,3,"WAGER_A3"),
 id(2,1,"WAGER_B1"),id(2,2,"WAGER_B2"),id(2,3,"WAGER_B3")];
const prefix=scope.EXACT_OUTPUT_LEDGER_PREFIX;
function draw(rows,origin=source){
  const ledger={origin,rows};
  input.value=prefix+JSON.stringify(ledger);
  scope.parseExactOutputLedger=()=>ledger;
  api.renderLedgerWork();
  assert.equal(input.value,prefix+JSON.stringify(ledger),"internal authoritative wager ledger unchanged");
  assert.equal(input.style.display,"none","raw ledger hidden");
  assert.equal($("ledgerWork").style.display,"");
  assert.equal($("sourceCutBtn").style.display,"none");
  assert.equal($("ledgerWorkCopy").disabled,true);
  return $("ledgerSourceView").value;
}
assert.equal(draw(all.slice(3)), "3d 33 44 55 dx 2n","full Cut removes first source line");
assert.equal(draw([all[2],...all.slice(3)]),source,"partial Cut retains source line as reference");
assert.equal(draw(all.slice(0,3)),"3d 00 11 22 dx 4n","full Cut removes second source line");
assert.equal(draw([{...all[3],text:"UNVERIFIED"}]),source,"corrupt legacy ledger fails closed");
assert.equal(draw([{...all[3],id:"9:1:WAGER_B1"}]),source,"out-of-bounds origin line denied");
assert.equal(draw([{...all[3],id:"2:1:OTHER"}]),source,"row ID/text mismatch denied");
assert.equal($("ledgerWorkOrigin").textContent,source,"original preserved for review/Undo");
assert.ok($("ledgerWorkStatus").textContent.includes("Chưa xác minh"),"fail-closed warning visible");
assert.equal(input.readOnly,false,"hidden input not overwritten");
console.log("SOURCE CUT WORKING VIEW CROSS-MODE CONTRACT PASS (complete/partial/legacy)");
