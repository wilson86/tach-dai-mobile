"use strict";
// Operator-origin DX/DA regression: all unique number pairs * all unique station pairs.
// Node-only deterministic DOM harness. No Telegram, network, live stores or user sends.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const root=path.resolve(__dirname,"..");
const read=(name)=>fs.readFileSync(path.join(root,name),"utf8");
const html=read("index.html"),cal=read("station_calendar.generated.js"),engine=read("business_engine.generated.js");
const script=html.match(/<script>\s*([\s\S]*?)<\/script>/i)?.[1]?.split("loadSettings();")[0];
assert.ok(script,"embedded PWA script missing");
const elements={};let clipboard="",acceptReedit=false;
function element(){
  const e={children:[],events:{},style:{},value:"",textContent:"",className:"",
    checked:false,selectionStart:0,selectionEnd:0,
    addEventListener(k,fn){this.events[k]=fn},
    replaceChildren(...xs){this.children=xs},
    append(...xs){this.children.push(...xs)},
    appendChild(child){this.children.push(child);child.parentNode=this},
    setAttribute(){},removeAttribute(){},focus(){this.focused=true},select(){},remove(){},
    setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b},
    classList:{add(){},remove(){}}
  };return e;
}
const storage=new Map();
const ctx={console,Date,Set,Map,JSON,String,Number,Math,RegExp,Error,Array,Object,Promise,
  localStorage:{getItem(k){return storage.get(k)||null},setItem(k,v){storage.set(k,v)},removeItem(k){storage.delete(k)}},
  navigator:{clipboard:{async writeText(x){clipboard=x}}},
  document:{getElementById(id){return elements[id]||(elements[id]=element())},
    createElement:element,body:{appendChild(){}},execCommand(){return true},addEventListener(){}},
  location:{protocol:"https:"},
  setTimeout(fn){fn();return 1},clearTimeout(){},
  confirm(){return acceptReedit},CustomEvent:function(){},dispatchEvent(){}
};
ctx.window=ctx;
vm.createContext(ctx);
vm.runInContext(cal+"\n"+engine+"\n"+script+
  "\nglobalThis.__api={run,processLine,validateBatch,getSchedule,auditMoneyConservation,initGroupedResults,cutSelectedOutput,reeditOriginalAfterCut,records:()=>outputRecords.map(r=>({...r})),input:inputEl,output:outputEl,region:regionEl,date:dateEl};",
  ctx);
const a=ctx.__api;
async function main(){
  a.initGroupedResults();a.region.value="mn";a.date.value="2026-10-24";
  const original="3d 28 82 68 86 dx 1n";
  a.input.value=original;a.run();
  const rows=a.output.value.split("\n");
  assert.equal(rows.length,18,"C(4,2) x C(3,2)=18 exposures");
  assert.equal(new Set(rows.map(x=>x.match(/(\d{2} \d{2}) dx/)[1])).size,6);
  assert.deepEqual(rows.slice(0,3),["tp la 28 82 dx 1n","tp bp 28 82 dx 1n","la bp 28 82 dx 1n"]);
  assert.ok(a.records().every(r=>r.sourceLine===1),"physical source line preserved");
  assert.equal(a.auditMoneyConservation(original,rows,"mn").status,"PASS");
  assert.equal(a.auditMoneyConservation(original,rows.slice(0,3),"mn").status,"FAIL","old three-row bug must fail audit");
  const first=elements.resultGroups.children[0].children[1].children[0];
  first.checked=true;first.events.change();await a.cutSelectedOutput();
  assert.equal(clipboard,rows[0]);assert.equal(a.output.value.split("\n").length,17);
  const cutOutput=a.output.value,ledger=a.input.value;
  a.run();assert.equal(a.output.value,cutOutput,"no resurrection after run");
  a.reeditOriginalAfterCut();assert.equal(a.input.value,ledger,"reedit cancel preserves ledger");
  acceptReedit=true;a.reeditOriginalAfterCut();
  assert.equal(a.input.value,original);assert.equal(a.output.value,"");
  assert.notEqual(a.input.style.display,"none");
  elements.undoBtn.events.click();
  assert.equal(a.input.value,ledger);assert.equal(a.output.value,cutOutput);
  elements.undoBtn.events.click();
  assert.equal(a.input.value,original);assert.equal(a.output.value,rows.join("\n"));
  const da="3d 12 52 92 da 1n";a.input.value=da;a.run();
  assert.equal(a.output.value.split("\n").length,9);
  assert.ok(a.output.value.split("\n").every(x=>/ da 1n$/.test(x)));
  assert.equal(a.auditMoneyConservation(da,a.output.value.split("\n"),"mn").status,"PASS");
  const mixed="3d 12 52 92 b 10n da 1n";a.input.value=mixed;a.run();
  assert.equal(a.output.value.split("\n").filter(x=>/ da 1n$/.test(x)).length,9);
  assert.equal(a.auditMoneyConservation(mixed,a.output.value.split("\n"),"mn").status,"PASS");
  const invalid=original+"\n3d 12 12 92 dx 1n";a.input.value=invalid;a.run();
  assert.equal(a.records().length,0);assert.match(a.output.value,/^PHÁT HIỆN TIN SAI:/);
  a.input.value="3d 12 345 92 dx 1n";a.run();
  assert.equal(a.records().length,0);assert.match(a.output.value,/^PHÁT HIỆN TIN SAI:/);
  console.log("DX NUMBER PAIR OPERATOR QA: PASS");
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
