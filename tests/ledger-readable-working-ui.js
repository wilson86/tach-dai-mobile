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
 p.initGroupedResults();
 p.region.value="mn";p.date.value="2026-10-15";
 p.input.value="2d 89 98 b5n dx2,5n";
 p.run();
 assert.equal(els.ledgerWork.style.display,"none","plain Telegram input stays editable");
 const original=p.input.value;
 const all=p.records().filter(r=>r.alive).map(r=>r.text);
 assert.equal(all.length,3);
 const dx=groups()[0].children[3].children[0];dx.checked=true;dx.events.change();
 await p.cutSelectedOutput();
 const rawLedger=p.input.value;
 assert.ok(rawLedger.startsWith("[[KTS_EXACT_OUTPUT_LEDGER_V1]]\n"),"internal ledger remains authoritative");
 assert.equal(p.output.value.split("\n").length,2,"DX removed, B outputs preserved");
 assert.equal(p.input.style.display,"none","internal JSON textarea not shown to user");
 assert.equal(els.ledgerWork.style.display,"","readable upper working source shown");
 assert.equal(rows().length,2,"upper rows reflect exactly surviving output rows");
 assert.deepEqual(rows().map(r=>r.children[1].textContent),p.output.value.split("\n"));
 assert.ok(!rows().some(r=>r.children[1].textContent.includes("KTS_EXACT_OUTPUT_LEDGER")));
 assert.equal(els.ledgerWorkOrigin.textContent,original,"raw original is still separately auditable");
 assert.equal(els.ledgerWorkCut.disabled,true,"no accidental cut with zero selected");
 // Upper row selection is the same authoritative checkbox state as lower pane.
 const first=rows()[0].children[0];first.checked=true;first.events.change();
 assert.match(els.resultGroupsSummary.textContent,/Đã chọn 1\/2/u);
 await els.ledgerWorkCopy.events.click();
 assert.equal(clipboard.value,p.records().find(r=>r.alive).text);
 await els.ledgerWorkCut.events.click();
 assert.equal(p.output.value.split("\n").length,1);
 assert.equal(rows().length,1);
 assert.equal(els.ledgerWork.style.display,"");
 const persisted=p.output.value;
 p.run();assert.equal(p.output.value,persisted,"re-run does not resplit remaining wager");
 p.undo();assert.equal(p.input.value,rawLedger,"undo restores prior serialized state without loss");
 assert.equal(rows().length,2,"upper readable rows restored");
 p.undo();assert.equal(p.input.value,original,"second undo restores original plaintext");
 assert.equal(els.ledgerWork.style.display,"none");
 assert.equal(p.output.value.split("\n").length,3);
 // Explicit Xóa must remove persistent ledger; Undo restores both it and UI.
 const last=groups()[0].children[3].children[0];last.checked=true;last.events.change();
 await p.cutSelectedOutput();
 const previous=p.input.value;
 assert.ok(previous.startsWith("[[KTS_EXACT_OUTPUT_LEDGER_V1]]\n"));
 const key=p.parseExactOutputLedger(previous).app==="tach-dai-mobile"?
   "tachDaiMobileExactOutputLedgerV1":"tachDaiNgangExactOutputLedgerV1";
 assert.equal(storage.has(key),true);
 await els.clearBtn.events.click();
 assert.equal(p.input.value,"");
 assert.equal(els.ledgerWork.style.display,"none");
 assert.equal(storage.has(key),false,"explicit Clear must prevent stale ledger on reload");
 p.undo();
 assert.equal(p.input.value,previous);
 assert.equal(els.ledgerWork.style.display,"");
 assert.equal(storage.has(key),true,"Undo restores persisted exact ledger");
 console.log("READABLE EXACT LEDGER TOP SOURCE COPY CUT UNDO: PASS");
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});