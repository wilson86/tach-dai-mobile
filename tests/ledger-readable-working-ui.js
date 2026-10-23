"use strict";
// DOM/browser-contract: readonly source line reference, lower results only. Native Node,
// no network/production data. Both app variants use the exact same contract.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=path.resolve(__dirname,"..");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const script=html.match(/<script>\s*([\s\S]*?)<\/script>/i)[1].split("loadSettings();")[0];
const calendar=fs.readFileSync(path.join(root,"station_calendar.generated.js"),"utf8");
const engine=fs.readFileSync(path.join(root,"business_engine.generated.js"),"utf8");
const els=Object.create(null), clipboard={value:""};
function element(tag="div"){
 const node={tag,children:[],events:{},value:"",textContent:"",className:"",checked:false,disabled:false,style:{},
   selectionStart:0,selectionEnd:0,
   classList:{add(v){node.className+=" "+v}},
   addEventListener(name,cb){node.events[name]=cb},
   appendChild(n){this.children.push(n);n.parentNode=this},
   append(...xs){for(const x of xs)this.appendChild(x)},
   replaceChildren(...xs){this.children=[];this.append(...xs)},
   setAttribute(){},removeAttribute(){},focus(){},select(){},remove(){},
   setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b}
 };
 return node;
}
const dom={
 getElementById(id){return els[id]||(els[id]=element(id))},
 createElement:element,body:{appendChild(){}},execCommand(){return true},addEventListener(){}
};
const storage=new Map();
const ctx={
 console,Date,Set,Map,JSON,String,Number,Math,RegExp,Error,Array,Object,Promise,
 navigator:{clipboard:{async writeText(value){clipboard.value=value}}},
 localStorage:{getItem(k){return storage.get(k)||null},setItem(k,v){storage.set(k,v)},removeItem(k){storage.delete(k)}},
 document:dom,
 setTimeout(){},clearTimeout(){}
};
ctx.globalThis=ctx;ctx.window=ctx;
vm.createContext(ctx);
vm.runInContext(calendar+"\n"+engine+"\n"+script+
 "\nglobalThis.__api={run,initGroupedResults,cutSelectedOutput,copyLedgerWork,parseExactOutputLedger,restorePersistedExactOutputLedger,serializeExactOutputLedger,renderLedgerWork,records:()=>outputRecords.map(r=>({...r})),input:inputEl,output:outputEl,region:regionEl,date:dateEl,undo:()=>document.getElementById('undoBtn').events.click()};",ctx);
const p=ctx.__api;
const groups=()=>els.resultGroups.children;
const rows=()=>els.ledgerWorkRows.children;
async function main(){
  p.initGroupedResults();
  p.region.value="mn";p.date.value="2026-10-15";
  p.input.value="2d 89 98 b5n dx2,5n";
  p.run();
  assert.equal(els.ledgerWork.style.display,"none","raw input remains editable");
  const original=p.input.value;
  assert.equal(p.records().filter(r=>r.alive).length,3);
  let dx=groups()[0].children[3].children[0];dx.checked=true;dx.events.change();
  await p.cutSelectedOutput();
  const ledger=p.input.value;
  assert.ok(ledger.startsWith("[[KTS_EXACT_OUTPUT_LEDGER_V1]]\n"));
  assert.equal(p.output.value.split("\n").length,2);
  assert.equal(p.input.style.display,"none");
  assert.equal(els.ledgerWork.style.display,"");
  // Partially Cut source remains as reference, NOT a second result selector.
  assert.equal(els.ledgerSourceView.value,original);
  assert.match(html,/id="ledgerWorkRows" style="display:none"/u,"no duplicate upper result list");
  assert.equal(els.ledgerWorkCopy.disabled,true);
  assert.equal(els.ledgerWorkCut.disabled,true);
  assert.equal(els.ledgerWorkOrigin.textContent,original);
  await els.ledgerCopyOriginal.events.click();
  assert.equal(clipboard.value,original,"raw original available by explicit review only");
  const survivors=p.output.value;
  p.run();assert.equal(p.output.value,survivors,"re-run must not resurrect cut DX");
  p.undo();
  assert.equal(p.input.value,original);
  assert.equal(p.output.value.split("\n").length,3);
  assert.equal(els.ledgerWork.style.display,"none");
  // Clear and Undo are atomic against the exact-output storage.
  dx=groups()[0].children[3].children[0];dx.checked=true;dx.events.change();
  await p.cutSelectedOutput();
  const previous=p.input.value;
  assert.ok(previous.startsWith("[[KTS_EXACT_OUTPUT_LEDGER_V1]]\n"));
  const key=p.parseExactOutputLedger(previous).app==="tach-dai-mobile"?
    "tachDaiMobileExactOutputLedgerV1":"tachDaiNgangExactOutputLedgerV1";
  assert.equal(storage.has(key),true);
  await els.clearBtn.events.click();
  assert.equal(p.input.value,"");
  assert.equal(storage.has(key),false);
  p.undo();
  assert.equal(p.input.value,previous);
  assert.equal(storage.has(key),true);
  assert.equal(els.ledgerWork.style.display,"");
  console.log("LEDGER READONLY SOURCE + LOWER RESULT ONLY + UNDO/CLEAR PASS");
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});