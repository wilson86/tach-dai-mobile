"use strict";
// Independent end-user proof for Da Vong working source after complete/partial CUT.
// No Telegram/live data, no browser storage deletion, Node VM synthetic DOM only.
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const U=require("../app/unified-core.js");
const sourceFile=fs.readFileSync(path.join(__dirname,"../app/unified-core.js"),"utf8");
const from=sourceFile.indexOf(";(function installDaVongCheckboxUx(){");
const until=sourceFile.indexOf("// Unified source-input authority:",from);
assert.ok(from>0&&until>from);
const ux=sourceFile.slice(from,until);
const raw="3d 00 11 22 dx 4n\n3d 33 44 55 dx 2n";
const remaining="3d 33 44 55 dx 2n";
const ctxApi={normalizeInput:s=>String(s||"").trim(),validateCheckOnlyLine(){},processLine:s=>[s]};
const expected=U.transformDaVongText(raw,ctxApi,"mn",[]);
assert.equal(expected.ok,true);
assert.deepEqual(expected.blocks.map(b=>b.sourceLine),[1,1,2,2]);
assert.equal(expected.outputs.length,6);
function setup(storage=new Map(),legacy=false){
 const nodes=Object.create(null);
 function element(tag="div",id=""){
  const n={tag,events:Object.create(null),children:[],style:{},value:"",textContent:"",
   checked:false,disabled:false,className:"",readOnly:false,
   addEventListener(type,cb){(this.events[type]||=[]).push(cb)},
   async click(){for(const cb of this.events.click||[])await cb({target:this})},
   emit(type){for(const cb of this.events[type]||[])cb({target:this})},
   appendChild(c){this.children.push(c);c.parentNode=this;return c},
   append(...a){for(const c of a)this.appendChild(c)},
   insertBefore(c,b){const i=this.children.indexOf(b);this.children.splice(i>=0?i:this.children.length,0,c);c.parentNode=this;return c},
   replaceChildren(...children){this.children=[];this.append(...children)},
   setAttribute(){},removeAttribute(){},focus(){},select(){},remove(){},
   cloneNode(){return element(this.tag,this.id)},
   replaceWith(v){if(this.parentNode){const i=this.parentNode.children.indexOf(this);this.parentNode.children[i]=v;v.parentNode=this.parentNode;}if(this.id)v.id=this.id},
   classList:{add(){},remove(){}}
  };
  Object.defineProperty(n,"id",{get(){return this._id||""},set(v){this._id=v;if(v)nodes[v]=this}});
  Object.defineProperty(n,"innerHTML",{set(v){for(const m of String(v).matchAll(/id="([^"]+)"/g))if(!nodes[m[1]])element("div",m[1])}});
  if(id)n.id=id;return n;
 }
 const host=element("div");
 for(const id of ["dvInput","dvInputLabel","dvOutput","dvRun","dvCutSelection","dvSelectAllOutput","dvCopy","dvUndo","dvClear","dvSourceCopy","dvSourceCut","dvSelectAllInput","dvRegion","dvDate","dvResultLabel","dvStatus"])
   host.appendChild(element("div",id));
 nodes.dvInput.value=raw;nodes.dvRegion.value="mn";nodes.dvDate.value="2026-10-24";
 const document={readyState:"complete",head:element("head"),body:element("body"),
  createElement:element,getElementById(id){return nodes[id]||null}};
 let clipboard="",copiedCount=0;
 const win={document,navigator:{clipboard:{async writeText(v){clipboard=String(v);copiedCount++}}},
  localStorage:{getItem(k){return storage.get(k)||null},setItem(k,v){storage.set(k,String(v))},removeItem(k){storage.delete(k)}},
  sessionStorage:{getItem(){return raw}},console,Date,Math,JSON,Set,Map,Array,String,RegExp,Error,KTS_UNIFIED:U};
 win.window=win;
 nodes.dvRun.addEventListener("click",()=>{
  if(win.KTS_DV_UI?.beforeRun?.())return;
  const output=U.transformDaVongText(nodes.dvInput.value,ctxApi,"mn",[]);
  assert.equal(output.ok,true);
  win.KTS_DV_UI.noteGeneratedSource(output.blocks,nodes.dvInput.value);
  nodes.dvOutput.value=output.display_output;
 });
 nodes.dvClear.addEventListener("click",()=>{win.KTS_DV_UI?.beforeClear?.();nodes.dvInput.value="";nodes.dvOutput.value=""});
 vm.runInNewContext(ux,win,{timeout:5000});
 return {nodes,win,storage,clipboard:()=>clipboard,copied:()=>copiedCount,
  wait:()=>new Promise(resolve=>setImmediate(resolve))};
}
async function main(){
 const t=setup();
 await t.nodes.dvRun.click();await t.wait();
 assert.equal(t.nodes.dvOutput.value.split("\n").length,6);
 assert.equal(t.nodes.dvInput.value,raw);
 // Cut ALL of first physical source line's three wager children.
 for(const g of t.nodes.dvTapResultList.children.slice(0,2)){
  const cb=g.children[0].children[0];cb.checked=true;cb.emit("change");
 }
 await t.nodes.dvCutSelection.click();
 assert.equal(t.clipboard(),expected.outputs.slice(0,3).join("\n"));
 assert.equal(t.nodes.dvOutput.value,expected.outputs.slice(3).join("\n"));
 assert.equal(t.nodes.dvRemainingSource.value,remaining,"fully cut source line must vanish from visible working source");
 assert.equal(t.nodes.dvRemainingSource.style.display,"");
 assert.equal(t.nodes.dvInput.style.display,"none");
 assert.equal(t.nodes.dvInput.value,raw,"authoritative input remains immutable for Undo and sibling modes");
 assert.equal(t.nodes.dvSourceCopy.disabled,true,"no replay of original raw wager via source copy");
 assert.equal(t.nodes.dvOriginalSourceText.textContent,raw,"operator can still audit preserved original");
 const ledger=JSON.parse(t.storage.get("KTS_DAVONG_WORKING_ROWS_V1"));
 assert.ok(ledger.rows.every(r=>r.sourceLine===1||r.sourceLine===2));
 assert.equal(ledger.rows.filter(r=>r.alive).length,3);
 // Re-run must not resurrect the fully cut line.
 await t.nodes.dvRun.click();await t.wait();
 assert.equal(t.nodes.dvRemainingSource.value,remaining);
 assert.equal(t.nodes.dvOutput.value,expected.outputs.slice(3).join("\n"));
 // Partial cut of second original line: still visible but result is authoritative.
 const part=t.nodes.dvTapResultList.children[0].children[1].children[0];
 part.checked=true;part.emit("change");
 await t.nodes.dvCutSelection.click();
 assert.equal(t.nodes.dvOutput.value,expected.outputs.slice(4).join("\n"));
 assert.equal(t.nodes.dvRemainingSource.value,remaining);
 assert.match(t.nodes.dvSourceProtectedNote.textContent,/KHÔNG Copy\/gửi lại tin nguồn/u);
 await t.nodes.dvUndo.click();
 assert.equal(t.nodes.dvOutput.value,expected.outputs.slice(3).join("\n"));
 assert.equal(t.nodes.dvRemainingSource.value,remaining);
 await t.nodes.dvUndo.click();
 assert.equal(t.nodes.dvInput.value,raw);
 assert.equal(t.nodes.dvOutput.value,expected.outputs.join("\n"));
 assert.equal(t.nodes.dvRemainingSource.style.display,"none");
 // Persisted legacy source (old version without provenance) is rebuilt ONLY
 // from exactly matching pure-DX pair outputs and does not duplicate a row.
 const restored=setup();
 await restored.nodes.dvRun.click();await restored.wait();
 for(const g of restored.nodes.dvTapResultList.children.slice(0,2)){
  const cb=g.children[0].children[0];cb.checked=true;cb.emit("change");
 }
 await restored.nodes.dvCutSelection.click();
 const saved=JSON.parse(restored.storage.get("KTS_DAVONG_WORKING_ROWS_V1"));
 for(const r of saved.rows)delete r.sourceLine;
 restored.storage.set("KTS_DAVONG_WORKING_ROWS_V1",JSON.stringify(saved));
 const legacy=setup(restored.storage);
 assert.equal(legacy.nodes.dvOutput.value,expected.outputs.slice(3).join("\n"));
 assert.equal(legacy.nodes.dvRemainingSource.value,remaining,"legacy DX ledger recovers exact row lineage");
 assert.equal(legacy.nodes.dvInput.value,raw);
 // An ambiguous/mismatched legacy row MUST retain the immutable source rather
 // than incorrectly hiding or deleting an unverified original line.
 const invalid=JSON.parse(legacy.storage.get("KTS_DAVONG_WORKING_ROWS_V1"));
 for(const r of invalid.rows)delete r.sourceLine;
 invalid.rows[0].text="UNMAPPED_WAGER";
 legacy.storage.set("KTS_DAVONG_WORKING_ROWS_V1",JSON.stringify(invalid));
 const failClosed=setup(legacy.storage);
 assert.equal(failClosed.nodes.dvRemainingSource.style.display,"none");
 assert.equal(failClosed.nodes.dvInput.value,raw);
 assert.equal(failClosed.nodes.dvInput.readOnly,true);
 console.log("DAVONG SOURCE LINEAGE CUT/PARTIAL/UNDO/RELOAD/LEGACY FAIL-CLOSED: PASS");
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1});
