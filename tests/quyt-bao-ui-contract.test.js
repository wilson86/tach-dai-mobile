"use strict";
// Pure static review. Real Chrome and Windows native Node must run separately.
const {test}=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const read=name=>fs.readFileSync(path.join(__dirname,"..",name),"utf8");
const root=read("index.html"),ui=read("quyt-bao-review-ui.js"),sw=read("sw.js");
test("Quyt checkbox is in chat input, off by default, not persisted",()=>{
 assert.ok(ui.includes('input.insertAdjacentElement("afterend",label)'));
 assert.ok(ui.includes('check.type="checkbox"'));
 assert.ok(ui.includes('const requested=ownTop.__KTS_QUYT_SELECTED_V1__===true'));
 assert.ok(!ui.includes("localStorage.setItem"));
 assert.ok(!ui.includes("sessionStorage.setItem"));
 assert.ok(ui.includes("checkedSource!==input.value"));
 assert.ok(ui.includes("ownTop.__KTS_QUYT_SOURCE_V1__"));
 assert.ok(ui.includes('rate.id="ktsQuytRate"'));
 assert.ok(ui.includes('rate.type="text"'));
 assert.ok(ui.includes('rate.inputMode="decimal"'));
 assert.ok(ui.includes('rate.value="1,067"'));
 assert.ok(ui.includes('rate.addEventListener("input"'));
 assert.ok(ui.includes("ownTop.__KTS_QUYT_RATE_V1__"));

});
test("source and canonical ledger are never rewritten",()=>{
 assert.ok(!/input\.value\s*=\s*|output\.value\s*=\s*/u.test(ui));
 assert.ok(ui.includes('original.startsWith("[[KTS_EXACT_OUTPUT_LEDGER_V1]]")'));
 assert.ok(ui.includes('stage:"PREPARED_PREVIEW_ONLY"')||read("quyt-bao-review.js").includes('stage:"PREPARED_PREVIEW_ONLY"'));
});
test("normal copy intercepted only when Quyt selected",()=>{
 assert.ok(ui.includes("if(!enabled())return"));
 assert.ok(ui.includes("event.stopImmediatePropagation()"));
 assert.ok(ui.includes('const resultActions=["dvCopy","copyBtn","cutBtn","dvCutSelection"'));
 assert.ok(ui.includes('"ledgerWorkCopy","ledgerWorkCut","sourceCutBtn","dvSourceCut"]'));
 assert.ok(ui.includes('output.addEventListener(type,event=>'));
 assert.ok(ui.includes('event.stopImmediatePropagation()'));
 assert.ok(ui.includes('navigator.clipboard.writeText(approved.preview)'));
 assert.ok(ui.includes('approved.input!==input.value||approved.result!==output.value'));
 assert.ok(ui.includes('approved.rate!==rate.value'));
 assert.ok(ui.includes('rate:rate.value'));
 assert.ok(ui.includes('kts:quyt-selection-v1'));
});
test("all same-origin Unified iframes get the one customer checkbox state",()=>{
 assert.ok(ui.includes("ownTop.__KTS_QUYT_SELECTED_V1__"));
 assert.ok(ui.includes("ownTop.document.querySelectorAll("));
 assert.ok(ui.includes("kts:quyt-selection-v1"));
});
test("Quyt preview refuses outputs whose original wager amounts were already merged or split",()=>{
 assert.ok(ui.includes("sourceText:original,requireSourceWitness:true"));
 const pure=read("quyt-bao-review.js");
 assert.ok(pure.includes("AGGREGATED_OR_SPLIT_STAKES_HOLD"));
 assert.ok(pure.includes("CHANGED_SOURCE_STAKES_HOLD"));
 assert.ok(pure.includes("sourceWitnessVerified:hasSourceWitness"));
});
test("browser caching and HTML include exact review-only JS",()=>{
 for(const n of ["quyt-bao-review.js","quyt-bao-review-ui.js"]){
  assert.ok(root.includes('src="./'+n+'"'));
  assert.ok(sw.includes('"./'+n+'"'));
 }
 assert.ok(sw.includes("clean-r2-quyt-r6"));
});
test("no auto dispatch, no paid CI, and no modified production source",()=>{
 for(const name of ["telegram.send","sendMessage(","fetch('/api/send","npm install","gh workflow run"]){
  assert.ok(!ui.includes(name),name);
 }
});
