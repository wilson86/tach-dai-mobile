"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const U=require("../app/unified-core.js");
const src=fs.readFileSync(path.join(__dirname,"../app/unified-core.js"),"utf8");
const from=src.indexOf(";(function installDaVongCheckboxUx(){");
const until=src.indexOf("// Unified source-input authority:",from);
assert.ok(from>0&&until>from);
const code=src.slice(from,until);
const sample="3d 12 32 42 52 dx5n";
const detailed="──── 12 đá (3) ────\n3d 12 32 dx5n\n3d 12 42 dx5n\n3d 12 52 dx5n\n"+
 "\n──── 32 đá (2) ────\n3d 32 42 dx5n\n3d 32 52 dx5n\n"+
 "\n──── 42 đá (1) ────\n3d 42 52 dx5n";
const originalRows=[
 "3d 12 32 dx 5n","3d 12 42 dx 5n","3d 12 52 dx 5n",
 "3d 32 42 dx 5n","3d 32 52 dx 5n","3d 42 52 dx 5n"];
function setup(existingStorage=new Map(),clipboardFailure=false,denyBackup=false){
 const nodes=Object.create(null);
 function element(tag="div",id=""){
  const node={tag,id,children:[],events:Object.create(null),style:{},value:"",
   checked:false,disabled:false,textContent:"",className:"",selectionStart:0,selectionEnd:0,
   innerHTMLValue:"",attributes:Object.create(null),
   addEventListener(type,fn){(this.events[type]||=[]).push(fn)},
   async click(){for(const fn of this.events.click||[])await fn({target:this})},
   emit(type){for(const fn of this.events[type]||[])fn({target:this})},
   appendChild(x){this.children.push(x);x.parentNode=this;return x},
   append(...xs){for(const x of xs)this.appendChild(x)},
   insertBefore(x,before){const at=this.children.indexOf(before);this.children.splice(at<0?this.children.length:at,0,x);x.parentNode=this;return x},
   replaceChildren(...xs){this.children=[];this.append(...xs)},
   setAttribute(k,v){this.attributes[k]=v},
   remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(x=>x!==this)},
   focus(){},select(){this.selectionStart=0;this.selectionEnd=this.value.length},
   replaceWith(other){other.parentNode=this.parentNode;if(this.parentNode){
     const i=this.parentNode.children.indexOf(this);if(i>=0)this.parentNode.children[i]=other;
    }if(this.id){other.id=this.id;nodes[this.id]=other}},
   cloneNode(){const cloned=element(this.tag,this.id);cloned.textContent=this.textContent;cloned.className=this.className;return cloned}
  };
  Object.defineProperty(node,"id",{get(){return this._id||""},set(next){this._id=next;if(next)nodes[next]=this}});
  if(id)node.id=id;
  Object.defineProperty(node,"innerHTML",{get(){return this.innerHTMLValue},set(value){
   this.innerHTMLValue=value;
   for(const m of String(value).matchAll(/id="([^"]+)"/g)){
     if(!nodes[m[1]])nodes[m[1]]=element("div",m[1]);
   }
  }});
  if(id)nodes[id]=node;return node;
 }
 const host=element("div");
 for(const id of ["dvInput","dvOutput","dvRun","dvCutSelection","dvSelectAllOutput",
   "dvCopy","dvUndo","dvClear","dvSourceCopy","dvSourceCut","dvSelectAllInput",
   "dvRegion","dvDate","dvResultLabel","dvStatus"]){
   host.appendChild(element("div",id));
 }
 nodes.dvInput.value=sample;nodes.dvOutput.value="";
 nodes.dvRegion.value="mn";nodes.dvDate.value="2026-10-15";
 const doc={readyState:"complete",head:element("head"),body:element("body"),
  getElementById(id){return nodes[id]||null;},createElement:element};
 const store={getItem(k){return existingStorage.get(k)||null},setItem(k,v){if(denyBackup&&k.includes(':preserved:'))throw Error('quota');existingStorage.set(k,String(v))},
  removeItem(k){existingStorage.delete(k)}};
 let written="";
 const navigator={clipboard:{async writeText(v){if(clipboardFailure)throw Error("denied");written=String(v)}}};
 const ctx={document:doc,localStorage:store,sessionStorage:{getItem(){return sample}},
  navigator,console,Date,Math,JSON,Set,Map,Array,String,RegExp,Error,
  window:null,KTS_UNIFIED:U};ctx.window=ctx;
 // The app shell's business transform runs before this UI's post-run observer.
 nodes.dvRun.addEventListener("click",()=>{
   if(ctx.KTS_DV_UI?.beforeRun?.())return;
   if(nodes.dvInput.value){
     const result=U.transformDaVongText(nodes.dvInput.value,{
       normalizeInput:s=>String(s).trim(),validateCheckOnlyLine(){},
       processLine:s=>[s]
     },"mn",[]);
     assert.equal(result.ok,true);
     ctx.KTS_DV_UI?.noteGeneratedSource?.(result.blocks,nodes.dvInput.value);
     nodes.dvOutput.value=result.display_output;
   }else nodes.dvOutput.value="";
 });
 nodes.dvClear.addEventListener("click",()=>{
  ctx.KTS_DV_UI?.beforeClear?.();nodes.dvInput.value="";nodes.dvOutput.value="";
 });
 vm.runInNewContext(code,ctx,{timeout:5000});
 const wait=()=>new Promise(resolve=>setImmediate(resolve));
 return {nodes,ctx,store,backing:existingStorage,getCopied:()=>written,wait};
}
async function main(){
 const key='KTS_DAVONG_WORKING_ROWS_V1';
 const legacy=JSON.stringify({schema:key,app:'tach-dai-davong',engine:'old-engine',region:'mn',date:'2026-10-15',origin:'synthetic',rows:[],groups:[]});
 const retained=new Map([[key,legacy]]),old=setup(retained);
 assert.equal(retained.get(key),legacy,'startup retains incompatible ledger');
 await old.nodes.dvClear.click();await old.wait();
 assert.equal(retained.get(key+':preserved:0'),legacy,'legacy bytes backed up before clear');
 const full=new Map([[key,legacy]]),blocked=setup(full,false,true);
 await blocked.nodes.dvClear.click();await blocked.wait();
 assert.equal(full.get(key),legacy,'quota failure preserves original ledger');
 const x=setup();
 await x.nodes.dvRun.click();await x.wait();
 assert.equal(x.nodes.dvTapResultList.children.length,3,"3 pair-header checkbox groups");
 assert.equal(x.nodes.dvOutput.value,originalRows.join("\n"));
 let firstGroup=x.nodes.dvTapResultList.children[0];
 assert.equal(firstGroup.children[0].children[0].tag,"input","group uses native checkbox");
 assert.equal(firstGroup.children[1].children[0].tag,"input","wager row uses native checkbox");
 const firstRowCheckbox=firstGroup.children[1].children[0];
 firstRowCheckbox.checked=true;
 firstRowCheckbox.emit("change");
 assert.equal(x.nodes.dvTapResultList.children[0],firstGroup,"checkbox tap keeps its group DOM node");
 assert.equal(firstGroup.children[1].children[0],firstRowCheckbox,"checkbox focus must not be destroyed");
 assert.equal(firstRowCheckbox.checked,true);
 assert.match(x.nodes.dvTapSummary.textContent,/1\/6 kết quả · 3 nhóm/u);
 await x.nodes.dvCutSelection.click();
 assert.equal(x.getCopied(),originalRows[0],"CUT clipboard only first selected wager");
 assert.equal(x.nodes.dvOutput.value,originalRows.slice(1).join("\n"));
 assert.equal(x.nodes.dvWorkingPanel.style.display,"none","duplicate result-row pane remains hidden");
 assert.equal(x.nodes.dvInput.style.display,"none","raw input hidden after source/result mapping");
 assert.equal(x.nodes.dvRemainingSource.value,sample,"working source keeps line with live wagers");
 assert.equal(x.nodes.dvOriginalSourceText.textContent,sample,"immutable original separately available");
 assert.equal(x.nodes.dvSourceCopy.disabled,true,"raw copy blocked after partial Cut");
 const stored=JSON.parse(x.store.getItem("KTS_DAVONG_WORKING_ROWS_V1"));
 assert.equal(stored.app,"tach-dai-davong");
 assert.equal(stored.rows.filter(r=>r.alive).length,5);
 await x.nodes.dvRun.click();await x.wait();
 assert.equal(x.nodes.dvOutput.value,originalRows.slice(1).join("\n"),"rerun does not resurrect CUT wager");
 await x.nodes.dvUndo.click();
 assert.equal(x.nodes.dvOutput.value,originalRows.join("\n"),"Undo restores original result rows");
 assert.equal(x.nodes.dvInput.style.display,"","Undo restores original editable source");
 // Cut again and reload (same same-origin storage) must preserve exact survivor set.
 firstGroup=x.nodes.dvTapResultList.children[0];
 firstGroup.children[1].children[0].checked=true;
 firstGroup.children[1].children[0].emit("change");
 await x.nodes.dvCutSelection.click();
 const loaded=setup(x.backing);
 assert.equal(loaded.nodes.dvOutput.value,originalRows.slice(1).join("\n"),"offline reload restores exact remaining bets");
 assert.equal(loaded.nodes.dvInput.style.display,"none");
 assert.equal(loaded.nodes.dvRemainingSource.value,sample);
 await loaded.nodes.dvUndo.click();
 assert.equal(loaded.nodes.dvOutput.value,originalRows.join("\n"),"persisted Undo restores full output");
 await loaded.nodes.dvClear.click();
 assert.equal(loaded.backing.has("KTS_DAVONG_WORKING_ROWS_V1"),false,"Xóa prevents stale wager reappearance");
 // Pair-header checkbox selects exactly the corresponding wagers and does not
 // erase other groups in either result or working-source display.
 const selectedGroup=setup();
 await selectedGroup.nodes.dvRun.click();await selectedGroup.wait();
 const box=selectedGroup.nodes.dvTapResultList.children[0].children[0].children[0];
 box.checked=true;box.emit("change");
 assert.equal(selectedGroup.nodes.dvTapResultList.children[0].children[0].children[0],box,
   "group checkbox focus and scroll anchor survive selection");
 assert.match(selectedGroup.nodes.dvTapSummary.textContent,/3\/6 kết quả · 3 nhóm/u);
 await selectedGroup.nodes.dvCutSelection.click();
 assert.equal(selectedGroup.nodes.dvOutput.value,originalRows.slice(3).join("\n"));
 assert.equal(selectedGroup.nodes.dvTapResultList.children.length,2);
 await selectedGroup.nodes.dvUndo.click();
 assert.equal(selectedGroup.nodes.dvOutput.value,originalRows.join("\n"));
 // The lower result is the sole authoritative Cut/Copy selection surface.
 const lower=setup();await lower.nodes.dvRun.click();await lower.wait();
 let first=lower.nodes.dvTapResultList.children[0].children[1].children[0];
 first.checked=true;first.emit("change");
 await lower.nodes.dvCutSelection.click();
 let survivor=lower.nodes.dvTapResultList.children[0].children[1].children[0];
 survivor.checked=true;survivor.emit("change");
 assert.match(lower.nodes.dvTapSummary.textContent,/1\/5 kết quả/u);
 await lower.nodes.dvCopy.click();
 assert.equal(lower.getCopied(),originalRows[1]);
 await lower.nodes.dvCutSelection.click();
 assert.equal(lower.nodes.dvOutput.value,originalRows.slice(2).join("\n"));
 await lower.nodes.dvRun.click();await lower.wait();
 assert.equal(lower.nodes.dvOutput.value,originalRows.slice(2).join("\n"));
 await lower.nodes.dvUndo.click();
 assert.equal(lower.nodes.dvOutput.value,originalRows.slice(1).join("\n"));
 await lower.nodes.dvUndo.click();
 assert.equal(lower.nodes.dvOutput.value,originalRows.join("\n"));

 // Denied clipboard permissions must keep the source and result atomic.
 const denied=setup(new Map(),true);
 await denied.nodes.dvRun.click();await denied.wait();
 const row=denied.nodes.dvTapResultList.children[0].children[1].children[0];
 row.checked=true;row.emit("change");
 await denied.nodes.dvCutSelection.click();
 assert.equal(denied.nodes.dvOutput.value,originalRows.join("\n"));
 assert.equal(denied.nodes.dvInput.value,sample);
 assert.equal(denied.backing.has("KTS_DAVONG_WORKING_ROWS_V1"),false);

 // The Unified Đá Vòng source visibly strips the copied Telegram envelope,
 // but Undo restores the exact bytes of the original paste.
 const copiedChat='[10/16/2026 5:36 PM] Hiền: 92 82 da 10n';
 const normalized='92 82 da 10n';
 const chat=setup();
 chat.nodes.dvInput.value=copiedChat;
 chat.ctx.KTS_DV_UI.beforeChatNormalize(copiedChat,normalized);
 assert.equal(chat.nodes.dvInput.value,normalized);
 assert.equal(chat.ctx.KTS_DV_UI.beforeRun(),false);
 await chat.nodes.dvUndo.click();
 assert.equal(chat.nodes.dvInput.value,copiedChat,'Undo retains the full original chat line');

 console.log("DAVONG CHECKBOX GROUP, WORKING SOURCE, CUT/UNDO/RELOAD: PASS");
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
