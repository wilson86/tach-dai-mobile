"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
const begin=html.indexOf("function invalidateOldScopeValidationError(){");
const end=html.indexOf('regionEl.addEventListener("change",updateUIAfterOperatorScopeChange);',begin);
test("source has scoped legacy error invalidation before UI scope change",()=>{
 assert.ok(begin>0&&end>begin,"Expected actual source function");
 const slice=html.slice(begin,end);
 assert.match(slice,/outputRecords\.length===0/u);
 assert.match(slice,/EXACT_OUTPUT_LEDGER_PREFIX/u);
 assert.match(slice,/updateUI\(\)/u);
 for(const type of ["regionEl","dateEl","todayEl"])
  assert.ok(html.includes(type+'.addEventListener("change",'),type);
});
const code=html.slice(begin,end)+"\nupdateUIAfterOperatorScopeChange();";
function apply(error,ledger=false,rows=[]){
 const source=ledger?"[[KTS_EXACT_OUTPUT_LEDGER_V1]]\nreceipt":"86 lo75n";
 const inputEl={value:source},outputEl={value:error},outputRecords=rows,
   status=[],calls=[];
 vm.runInNewContext(code,{
  inputEl,outputEl,outputRecords,
  EXACT_OUTPUT_LEDGER_PREFIX:"[[KTS_EXACT_OUTPUT_LEDGER_V1]]\n",
  setStatus:(text,level)=>status.push({text,level}),
  updateUI:()=>calls.push("update")
 },{timeout:1000});
 return {inputEl,outputEl,outputRecords,status,calls};
}
test("old MN error cleared after changing to MB; original source untouched",()=>{
 const before="PHÁT HIỆN TIN SAI:\n\nĐài 86 không thuộc lịch MN";
 const next=apply(before);
 assert.equal(next.outputEl.value,"");
 assert.equal(next.inputEl.value,"86 lo75n");
 assert.match(next.status[0].text,/bấm Kiểm tra \+ Tách/);
 assert.deepEqual(next.calls,["update"]);
});
test("stale duplicate prompt no longer impersonates approval in next region",()=>{
 const x=apply("XÁC NHẬN SỐ TRÙNG CẦN THIẾT");
 assert.equal(x.outputEl.value,"");
 assert.match(x.status[0].text,/ngày đã đổi/);
});
test("cut ledger warnings and valid derived records are not overwritten",()=>{
 const ledger=apply("PHÁT HIỆN TIN SAI:\n\nLedger không hợp lệ",true);
 assert.match(ledger.outputEl.value,/PHÁT HIỆN TIN SAI/u);
 assert.equal(ledger.status.length,0);
 const rows=[{text:"86 lo75n",alive:true}];
 const ready=apply("86 lo75n",false,rows);
 assert.equal(ready.outputEl.value,"86 lo75n");
 assert.equal(ready.outputRecords.length,1);
 assert.equal(ready.status.length,0);
});
