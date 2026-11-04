"use strict";
// Direct PWA DOM-level grouped-checkbox UX regression, offline Node VM only.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const root=path.resolve(__dirname,"..");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const calendar=fs.readFileSync(path.join(root,"station_calendar.generated.js"),"utf8");
const engine=fs.readFileSync(path.join(root,"business_engine.generated.js"),"utf8");
const embedded=html.match(/<script>\s*([\s\S]*?)<\/script>/i);
assert.ok(embedded);
const script=embedded[1].slice(0,embedded[1].indexOf("loadSettings();"));
assert.ok(script.includes("function initGroupedResults"));
const els=Object.create(null), clipboard={text:""}, durableStore=new Map();
function element(tag="div"){
  const obj={
    tag,children:[],events:{},className:"",style:{},value:"",textContent:"",
    checked:false,selectionStart:0,selectionEnd:0,
    classList:{add(name){obj.className+=" "+name;}},
    addEventListener(name,handler){this.events[name]=handler;},
    appendChild(child){this.children.push(child);child.parentNode=this;},
    append(...children){for(const child of children)this.appendChild(child);},
    replaceChildren(...children){this.children=[];this.append(...children);},
    setAttribute(){},removeAttribute(){},focus(){},select(){},
    setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;},
    remove(){}
  };
  return obj;
}
const ctx={
  console,Date,Set,Map,JSON,String,Number,Math,RegExp,Error,Array,Object,Promise,
  navigator:{clipboard:{async writeText(text){clipboard.text=text;}}},
  localStorage:{getItem(key){return durableStore.has(key)?durableStore.get(key):null;},
    setItem(key,value){durableStore.set(key,String(value));},
    removeItem(key){durableStore.delete(key);}},
  document:{
    getElementById(id){return els[id]||(els[id]=element(id));},
    createElement:element,body:{appendChild(){}},execCommand(){return true;},
    addEventListener(){}
  }
};
vm.createContext(ctx);
vm.runInContext(calendar+"\n"+engine+"\n"+script+
  "\nglobalThis.__rules={run,initGroupedResults,cutSelectedOutput,copyOutput,getRecords:()=>outputRecords.map(r=>({...r})),undo:()=>document.getElementById('undoBtn').events.click(),els:{input:inputEl,output:outputEl,region:regionEl,date:dateEl}};",
  ctx);
const rules=ctx.__rules;
const groups=()=>els.resultGroups.children;
const records=()=>rules.getRecords();

const original="2d.219.b5n.xc25n.19.b15n";
async function main(){
  rules.initGroupedResults();
  rules.els.region.value="mn";
  rules.els.date.value="2026-10-15";
  rules.els.input.value=original;
  rules.run();
  const fullResult=rules.els.output.value;
  const count=records().length;
  assert.equal(groups().length,2,"semantic groups must be distinct");
  assert.ok(count>=4);

  // The user requires editable source to be executable and equivalent to
  // precisely the surviving wager output after ANY successful Cut operation.
  // An unsupported partial child Cut must FAIL CLOSED without changing either.
  const firstRow=groups()[0].children[1].children[0];
  firstRow.checked=true;
  firstRow.events.change();
  await rules.cutSelectedOutput();
  const postSource=rules.els.input.value;
  const postOutput=rules.els.output.value;
  const cutOccurred=postOutput!==fullResult;
  if(cutOccurred){
    assert.notEqual(postSource,original,
      "A removed result row must remove or rewrite corresponding source input");
    rules.run();
    assert.equal(rules.els.output.value,postOutput,
      "A rerun MUST NOT resurrect an already CUT wager output");
    rules.undo();
    assert.equal(rules.els.input.value,original);
    assert.equal(rules.els.output.value,fullResult);
  }else{
    assert.equal(postSource,original,
      "A refused nonrepresentable cut must preserve source exactly");
    assert.equal(postOutput,fullResult,
      "A refused cut must preserve all prior output rows");
  }

  // Whole logical group CUT must remain supported without source drift.
  rules.els.input.value=original;
  rules.run();
  groups()[0].children[0].children[0].checked=true;
  groups()[0].children[0].children[0].events.change();
  await rules.cutSelectedOutput();
  const groupSource=rules.els.input.value;
  const prefix="[[KTS_EXACT_OUTPUT_LEDGER_V1]]\n";
  assert.ok(groupSource.startsWith(prefix),"Cut must retain immutable origin in exact-output ledger");
  const groupLedger=JSON.parse(groupSource.slice(prefix.length));
  assert.equal(groupLedger.origin,original,"original source must remain auditably intact");
  const groupOutput=rules.els.output.value;
  assert.deepEqual(Array.from(groupLedger.rows.map(r=>r.text)),groupOutput.split("\n"),
    "only surviving rows may exist in exact-output ledger");
  assert.ok(groupOutput && !groupOutput.includes("219"));
  rules.run();
  assert.equal(rules.els.output.value,groupOutput,
    "Rerun after group CUT must never restore removed group");
  rules.undo();
  assert.equal(rules.els.input.value,original);
  assert.equal(rules.els.output.value,fullResult);
  console.log("SOURCE OUTPUT CUT CONSERVATION: PASS");
}
main().catch(err=>{console.error(err.stack||err);process.exitCode=1;});
