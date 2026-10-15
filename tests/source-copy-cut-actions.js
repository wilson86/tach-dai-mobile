"use strict";
// DOM/browser-contract test for hiding raw exact-ledger JSON. Native Node only,
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
 p.initGroupedResults();p.region.value="mn";p.date.value="2026-10-15";
 const full="2d 89 98 b5n dx2,5n\n2d 19 b15n";
 p.input.value=full;p.run();
 const originalOutput=p.output.value;
 const firstLine=full.split("\n")[0];
 p.input.selectionStart=0;p.input.selectionEnd=firstLine.length;
 await els.sourceCopyBtn.events.click();
 assert.equal(clipboard.value,firstLine,"Copy nguồn copies selected human text");
 await els.sourceCutBtn.events.click();
 assert.equal(p.input.value,"2d 19 b15n","Cắt nguồn removes the selected entire source line");
 assert.ok(!p.output.value.includes("89 98"));
 assert.ok(p.output.value.includes("19 b"),"remaining number 19 must survive with native mode allocation");
 p.undo();
 assert.equal(p.input.value,full);
 assert.equal(p.output.value,originalOutput);
 // Child row partial CUT uses local ledger: upper shows only readable results.
 p.input.value=firstLine;p.run();
 const checkbox=groups()[0].children[3].children[0];
 checkbox.checked=true;checkbox.events.change();
 await p.cutSelectedOutput();
 const ledger=p.input.value;
 assert.ok(ledger.startsWith("[[KTS_EXACT_OUTPUT_LEDGER_V1]]\n"));
 assert.equal(p.input.style.display,"none");
 assert.equal(rows().length,2);
 // Copy nguồn while in ledger state MUST never export the technical JSON.
 await els.sourceCopyBtn.events.click();
 assert.equal(clipboard.value,p.output.value);
 assert.ok(!clipboard.value.includes("[[KTS_EXACT_OUTPUT_LEDGER_V1]]"));
 // Cắt dòng nguồn with one selected upper row maps to existing wager ledger.
 const upper=rows()[0].children[0];upper.checked=true;upper.events.change();
 await els.sourceCutBtn.events.click();
 assert.equal(rows().length,1);
 assert.equal(p.output.value.split("\n").length,1);
 p.run();assert.equal(p.output.value.split("\n").length,1);
 p.undo();assert.equal(p.input.value,ledger);
 assert.equal(rows().length,2);
 console.log("SOURCE ACTIONS AND HUMAN-READABLE LEDGER: PASS");
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});