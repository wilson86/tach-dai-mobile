"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const html=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");
const script=html.match(/<script>\s*([\s\S]*?)<\/script>/i)?.[1];
assert.ok(script,"embedded source missing");
const begin=script.indexOf("function reeditOriginalAfterCut(){");
const end=script.indexOf("async function copySourceView(){",begin);
assert.ok(begin>=0&&end>begin,"re-edit implementation missing");
assert.match(html,/<button id="ledgerReeditOriginal"[^>]*>Sửa tin gốc/u);
assert.match(script,/ledgerReeditOriginal"\)\.addEventListener\("click",reeditOriginalAfterCut\)/u);
const code=script.slice(begin,end);
function check(mode){
  const calls=[];
  const state={
    inputEl:{value:"INTERNAL_LEDGER",focus(){calls.push("focus")}},
    outputEl:{value:"UNCUT_RESULT"},
    outputRecords:[{text:"UNCUT_RESULT",alive:true}],
    undoStack:[],
    parseExactOutputLedger(){return mode==="invalid"?false:{origin:"3d 12 52 92 da 1n"}},
    snapshot(){this.undoStack.push({source:this.inputEl.value,output:this.outputEl.value})},
    resetOutputRecords(){this.outputRecords=[]},
    persistExactOutputLedger(){calls.push("persist")},
    renderOutputRecords(){calls.push("render")},
    announceWorkingSource(){calls.push("emit")},
    setStatus(){calls.push("status")},
    window:{confirm(){calls.push("confirm");return mode==="accept"}}
  };
  const run=new Function("scope","with(scope){"+code+";return reeditOriginalAfterCut;}")(state);
  run();
  if(mode==="accept"){
    assert.equal(state.inputEl.value,"3d 12 52 92 da 1n");
    assert.equal(state.outputEl.value,"");
    assert.deepEqual(state.outputRecords,[]);
    assert.equal(state.undoStack.length,1);
    for(const event of ["persist","render","emit","focus"])assert.ok(calls.includes(event),event);
  }else{
    assert.equal(state.inputEl.value,"INTERNAL_LEDGER");
    assert.equal(state.outputEl.value,"UNCUT_RESULT");
    assert.equal(state.undoStack.length,0);
    assert.ok(!calls.includes("persist"));
  }
}
for(const mode of ["accept","decline","invalid"])check(mode);
console.log("SAFE SOURCE REEDIT: PASS 3/3 (mocked transactions)");
