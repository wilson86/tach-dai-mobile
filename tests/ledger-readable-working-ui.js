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
const storage=new Map();let failWrites=false;
const ctx={
 console,Date,Set,Map,JSON,String,Number,Math,RegExp,Error,Array,Object,Promise,
 navigator:{clipboard:{async writeText(value){clipboard.value=value}}},
 localStorage:{getItem(k){return storage.get(k)||null},setItem(k,v){if(failWrites)throw Error('quota');storage.set(k,v)},removeItem(k){storage.delete(k)}},
 document:dom,
 setTimeout(){},clearTimeout(){}
};
ctx.globalThis=ctx;ctx.window=ctx;
vm.createContext(ctx);
vm.runInContext(calendar+"\n"+engine+"\n"+script+
 "\nglobalThis.__api={run,initGroupedResults,cutSelectedOutput,copyLedgerWork,parseExactOutputLedger,restorePersistedExactOutputLedger,serializeExactOutputLedger,renderLedgerWork,records:()=>outputRecords.map(r=>({...r})),input:inputEl,output:outputEl,region:regionEl,date:dateEl,undo:()=>document.getElementById('undoBtn').events.click()};",ctx);
const p=ctx.__api;
const groups=()=>els.resultGroups.children;
const choose=record=>{const label=groups().flatMap(g=>g.children.slice(1)).find(x=>x.children[1].textContent===record);assert.ok(label,record);const box=label.children[0];box.checked=true;box.events.change()};
async function main(){
 p.initGroupedResults();
 p.region.value="mn";p.date.value="2026-10-15";
 p.input.value="2d 89 98 b5n dx2,5n";
 p.run();
 assert.equal(els.ledgerWork.style.display,"none","plain Telegram input stays editable");
 const original=p.input.value;
 const all=p.records().filter(r=>r.alive).map(r=>r.text);
 assert.deepEqual(Array.from(all),["tn 89 98 b5n","ag 89 98 b5n","tn ag 89 98 dx2,5n"]);
 assert.ok(p.records().every(r=>r.sourceLine===1),"original physical line retained");
 const cut=all.find(r=>r.includes(' dx'));choose(cut);
 await p.cutSelectedOutput();
 const rawLedger=p.input.value;
 assert.ok(rawLedger.startsWith("[[KTS_EXACT_OUTPUT_LEDGER_V1]]\n"),"internal ledger remains authoritative");
 assert.equal(p.output.value.split("\n").length,2,"DX removed, B outputs preserved");
 assert.equal(p.input.style.display,"none","internal JSON textarea not shown to user");
 assert.equal(els.ledgerWork.style.display,"","readable upper working source shown");
 assert.equal(els.ledgerSourceView.value,p.output.value,"working view shows exactly remaining ledger rows");
 assert.match(html,/<summary>Xem tin gốc ban đầu<\/summary>/u);
 assert.match(html,/<textarea id="ledgerSourceView" readonly/u);
 assert.equal(els.ledgerWorkOrigin.textContent,original,"raw original is still separately auditable");
 await els.ledgerCopyOriginal.events.click();
 assert.equal(clipboard.value,original,"Copy tin gốc cannot export internal JSON");
 assert.equal(els.ledgerWorkCut.disabled,true,"no accidental cut with zero selected");
 // Result selection and actions are owned by the lower pane.
 choose(p.records().find(r=>r.alive).text);
 assert.match(els.resultGroupsSummary.textContent,/Đã chọn 1\/2/u);
 await els.copyBtn.events.click();
 assert.equal(clipboard.value,p.records().find(r=>r.alive).text);
 await els.cutBtn.events.click();
 assert.equal(p.output.value.split("\n").length,1);
 assert.equal(els.ledgerWork.style.display,"");
 const persisted=p.output.value;
 p.run();assert.equal(p.output.value,persisted,"re-run does not resplit remaining wager");
 p.input.value="";p.restorePersistedExactOutputLedger();p.run();
 assert.equal(p.output.value,persisted,"reload does not resurrect cut rows");
 p.undo();assert.equal(p.input.value,rawLedger,"undo restores prior serialized state without loss");
 assert.deepEqual(Array.from(p.output.value.split("\n")),Array.from(all).filter(r=>r!==cut),"undo restores surviving rows");
 p.undo();assert.equal(p.input.value,original,"second undo restores original plaintext");
 assert.equal(els.ledgerWork.style.display,"none");
 assert.equal(p.output.value.split("\n").length,3);
 // Full Cut retains the original as a zero-row ledger across reload, with no wagers.
 els.selectAllOutputBtn.events.click();await p.cutSelectedOutput();
 const empty=p.parseExactOutputLedger(p.input.value);assert.equal(empty.origin,original);assert.equal(empty.rows.length,0);
 assert.ok(empty.undoReceipt,"full Cut must carry one durable Undo receipt");
 const tampered={...empty,undoReceipt:{...empty.undoReceipt,input:"khác tin gốc"}};
 assert.equal(p.parseExactOutputLedger("[[KTS_EXACT_OUTPUT_LEDGER_V1]]\n"+JSON.stringify(tampered)),false,"foreign-source Undo receipt rejected");
 p.input.value="";p.restorePersistedExactOutputLedger();
 // Simulate a new browser's empty volatile Undo stack after a full Cut.
 vm.runInContext("undoStack=[]",ctx);p.run();assert.equal(p.output.value,"");
 assert.equal(els.ledgerWorkOrigin.textContent,original);p.undo();assert.equal(p.input.value,original);
 assert.equal(p.output.value,all.join("\n"),"one-step Undo after reload restores exact output");
 // A failed persistence must roll the Cut back without losing rows.
 const beforeFailure=p.output.value;choose(p.records().find(r=>r.alive).text);failWrites=true;
 await p.cutSelectedOutput();failWrites=false;assert.equal(p.input.value,original);assert.equal(p.output.value,beforeFailure);
 // Explicit Xóa must remove persistent ledger; Undo restores both it and UI.
 choose(cut);
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
 // A quota/storage failure during Undo must not expose non-durable wagers.
 const beforeFailedUndo=p.input.value;
 failWrites=true;p.undo();failWrites=false;
 assert.equal(p.input.value,beforeFailedUndo,"failed Undo keeps previously cleared UI");
 assert.equal(storage.has(key),false,"failed Undo does not invent persisted rows");
 assert.match(els.status.textContent,/Không lưu được Hoàn tác/u);
 p.undo();
 assert.equal(p.input.value,previous);
 assert.equal(els.ledgerWork.style.display,"");
 assert.equal(storage.has(key),true,"Undo restores persisted exact ledger");
 // New day/region must not silently hide or erase a valid prior ledger.
 const preservedOld=storage.get(key);
 p.date.value="2026-10-16";p.input.value="";
 p.restorePersistedExactOutputLedger();
 p.run();assert.equal(p.output.value,"","incompatible date must not produce wagers");
 assert.match(els.status.textContent,/HOLD: còn dữ liệu Cut/u);
 await els.clearBtn.events.click();
 assert.equal(storage.get(key),preservedOld,"Clear cannot silently discard incompatible ledger");
 p.date.value="2026-10-15";p.restorePersistedExactOutputLedger();p.run();
 assert.ok(p.output.value.length>0,"matching date restores original surviving ledger");
 console.log("READABLE EXACT LEDGER TOP SOURCE COPY CUT UNDO: PASS");
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
