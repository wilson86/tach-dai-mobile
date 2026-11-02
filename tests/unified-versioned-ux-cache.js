"use strict";
// Bounded static delivery regression: the fresh Unified checkbox UI must not
// load stale JS through a cache-first service worker, including offline use.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=part=>fs.readFileSync(path.join(root,"app",part),"utf8");
const app=read("index.html");
const sw=read("sw.js");
const core=read("unified-core.js");
const version=JSON.parse(read("version.json")).version;
const cache=(sw.match(/const CACHE='([^']+)'/u)||[])[1];
const source=(app.match(/<script src="\.\/unified-core\.js\?ux=([\d.]+)"><\/script>/u)||[])[1];
const ux=(core.match(/const UX_VERSION='([^']+)'/u)||[])[1];
assert.equal(version,"1.0.33","duplicate approval candidate must advance without downgrade");
assert.equal(source,version,"HTML URL must uniquely identify new Unified JavaScript");
assert.equal(ux,version,"embedded UX version must match shell");
assert.ok(cache && cache.includes("v"+version+"-"),"service-worker cache key must advance");
assert.ok(sw.includes("'./unified-core.js?ux="+version+"'"),"offline precache must include versioned JS requested by HTML");
assert.ok(sw.includes("'./unified-core.js'"),"existing unversioned asset remains available");
assert.match(core,/if\(nativeOutput\) doc\.getElementById\(outputButtonId\)\?\.remove\(\)/u);
assert.match(core,/if\(output&&!nativeOutput&&!doc\.getElementById\('resultGroups'\)\)/u);
assert.equal(app.split("Unified "+version).length-1,1,"displayed Unified version must match metadata once");
// Issue18: Unified cannot select or synchronize a hosted Ngang iframe with
// a stale generated money engine, even if it is same-origin / cached.
const guardSource=(core.match(/function checkUnifiedNgangFrame\(frame\)\{[\s\S]*?\n\}/u)||[])[0];
assert.ok(guardSource,"missing a fail-closed Unified Ngang engine gate");
const checkNgangFrame=(new Function("return ("+guardSource+")"))();
const expectedSha="0a0e541680405bd685a52225d637246064ef59a9715ea4afa72f750c9095e487";
const valid={contentWindow:{KTS_BUSINESS_ENGINE:{ENGINE_SHA256:expectedSha},validateCheckOnlyLine(){},processLine(){}}};
assert.equal(checkNgangFrame(valid),true,"matching canonical Ngang engine should be available");
assert.equal(checkNgangFrame({contentWindow:{...valid.contentWindow,KTS_BUSINESS_ENGINE:{ENGINE_SHA256:"7952aa29eda4ba7117d0245ed71b79cf8f8643f291b94dbef268b710a4b849ea"}}}),false,"old hosted Ngang must HOLD");
assert.equal(checkNgangFrame({contentWindow:{...valid.contentWindow,processLine:null}}),false,"unready Ngang cannot be selected");
assert.equal(checkNgangFrame(null),false,"missing iframe cannot be selected");
assert.equal(checkNgangFrame({get contentWindow(){throw Error("cross-origin");}}),false,"foreign-origin Ngang cannot be selected");
assert.ok(core.includes("if(checkUnifiedNgangFrame(frame))"),"shared source must not propagate into an unqualified Ngang frame");
assert.ok(app.includes("if(mode==='ngang'&&!ngangFrameReady())"),"Unified mode selector must block stale Ngang");
assert.ok(app.includes("if(localStorage.getItem('kts_unified_mode_v1')==='ngang')setMode('ngang')"),"A stored Ngang mode must be restored after iframe passes engine SHA gate");
assert.ok(app.includes("if(frameId==='ngangFrame'&&!ngangFrameReady())return"),"Unified settings must not sync into stale Ngang");
assert.ok(app.includes('id="ngangEngineHold"'),"visible HOLD explanation required");
assert.ok(app.includes("frame.style.pointerEvents=ready?'':'none'"),"block stale embedded frame interaction");
// Execute the real selector and shared-input admission functions with a
// synthetic DOM: the older hosted iframe may never become the active mode
// or share its raw input with the new Unified app.
const selectorSource=(app.match(/function setMode\(mode\)\{[\s\S]*?\n\}/u)||[])[0];
const sourcesSource=(core.match(/function sources\(\)\{[\s\S]*?\n  \}/u)||[])[0];
assert.ok(selectorSource&&sourcesSource,"missing actual Unified mode/source admission functions");
for(const [label,matching] of [["stale",false],["matching",true]]){
  const state=new Map(),hold={hidden:true},saved=[];
  const frame={
    contentWindow:{
      ...valid.contentWindow,
      KTS_BUSINESS_ENGINE:{ENGINE_SHA256:matching?expectedSha:"7952aa29eda4ba7117d0245ed71b79cf8f8643f291b94dbef268b710a4b849ea"}
    },
    contentDocument:{getElementById:id=>id==="input"?{value:"2d 52 68 dx5n"}:null}
  };
  const panes=Object.fromEntries(["tach","ngang","davong"].map(mode=>["pane-"+mode,{
    classList:{toggle(name,active){state.set("pane-"+mode,active)}}
  }]));
  const buttons=["tach","ngang","davong"].map(mode=>({
    dataset:{mode},
    classList:{toggle(name,active){state.set("tab-"+mode,active)}}
  }));
  const doc={getElementById:id=>({
    ...panes,ngangFrame:frame,ngangEngineHold:hold,dvInput:{value:"2d 52 68 dx5n"}
  })[id]||null};
  const setMode=(new Function("$","ngangFrameReady","modeButtons","localStorage","updateDvSchedule",
    "return ("+selectorSource+")"))(doc.getElementById,()=>checkNgangFrame(frame),
    buttons,{setItem(key,val){saved.push([key,val])}},()=>{});
  const sources=(new Function("document","checkUnifiedNgangFrame",
    "return ("+sourcesSource+")"))(doc,checkNgangFrame);
  setMode("ngang");
  assert.equal(state.get("tab-ngang")===true,matching,label+": wrong selected Ngang tab");
  assert.equal(sources().some(item=>item.mode==="ngang"),matching,label+": wrong shared-source admission");
  assert.equal(state.get("tab-tach"),!matching,label+": wrong safe fallback mode");
  assert.equal(hold.hidden,matching,label+": incorrect HOLD warning state");
  if(matching)assert.equal(saved.at(-1)[1],"ngang",label+": must persist matching mode");
  else assert.equal(saved.length,0,label+": must not overwrite preferred Ngang while loading");
}
// Live-source regression: a successful Cut must NEVER restore the cut raw
// wager into a sibling mode on F5. An explicit Undo may intentionally restore.
const sharedBegin=core.indexOf(";(function installUnifiedSharedInput(){");
const sharedEnd=core.indexOf("\n})();",sharedBegin);
assert.ok(sharedBegin>=0&&sharedEnd>sharedBegin,"shared input controller missing");
const sharedFactory=core.slice(sharedBegin,sharedEnd+"\n})();".length);
const origTicket="2d 52 68 dx5n";
const ledgerTicket="[[KTS_EXACT_OUTPUT_LEDGER_V1]]\n"+JSON.stringify({origin:origTicket,rows:[]});
const storage={"KTS_UNIFIED_SHARED_INPUT_V1":origTicket};
const session={
  getItem:key=>storage[key]??null,
  setItem:(key,value)=>{storage[key]=String(value)},
  removeItem:key=>{delete storage[key]}
};
function createSharedController(tachInitial,ngangInitial){
  const entry=value=>({value,events:{},addEventListener(type,fn){this.events[type]=fn}});
  const tach=entry(tachInitial),ngang=entry(ngangInitial),dv=entry(tachInitial),callbacks={};
  const ngangWindow={
    KTS_BUSINESS_ENGINE:{ENGINE_SHA256:expectedSha},
    validateCheckOnlyLine(){},processLine(){},
    addEventListener(type,fn){callbacks[type]=fn}
  };
  const frame=(el,win)=>({
    contentDocument:{getElementById:id=>id==="input"?el:null},
    contentWindow:win,addEventListener(){}
  });
  const frames={
    tachFrame:frame(tach,{addEventListener(){}}),
    ngangFrame:frame(ngang,ngangWindow),
    dvInput:dv
  };
  const doc={
    readyState:"complete",
    getElementById:id=>frames[id]||null,
    querySelector:()=>({dataset:{mode:"ngang"},addEventListener(){}})
  };
  (new Function("document","sessionStorage","checkUnifiedNgangFrame","setTimeout",sharedFactory))(
    doc,session,checkNgangFrame,()=>{});
  return {tach,ngang,dv,ngangWindow,callbacks};
}
const cutStart=createSharedController(origTicket,origTicket);
cutStart.ngang.value=ledgerTicket;
cutStart.callbacks["kts:working-source"]({detail:{
  schema:"KTS_WORKING_SOURCE_V1",
  token:cutStart.ngangWindow.__KTS_UNIFIED_FRAME_TOKEN__,
  value:ledgerTicket
}});
assert.equal(storage.KTS_UNIFIED_SHARED_INPUT_V1,"","Cut must revoke shared original ticket");
assert.equal(storage.KTS_UNIFIED_CUT_SOURCE_HOLD_V1,"1","Cut hold must survive refresh");
assert.equal(cutStart.tach.value,"","Cut must clear old raw ticket in Tách Đài");
assert.equal(cutStart.dv.value,"","Cut must clear old raw ticket in Đá Vòng");
assert.equal(cutStart.ngang.value,ledgerTicket,"Cut must never mutate local Ngang ledger");
const afterF5=createSharedController(origTicket,ledgerTicket);
assert.equal(afterF5.tach.value,"","F5 must not resurrect cut ticket from cached Tách Đài");
assert.equal(storage.KTS_UNIFIED_SHARED_INPUT_V1,"","F5 must not resurrect source session");
assert.equal(afterF5.ngang.value,ledgerTicket,"F5 must preserve Ngang ledger for inspection");
afterF5.ngang.value=origTicket; // explicit working-source Undo event
afterF5.callbacks["kts:working-source"]({detail:{
  schema:"KTS_WORKING_SOURCE_V1",
  token:afterF5.ngangWindow.__KTS_UNIFIED_FRAME_TOKEN__,
  value:origTicket
}});
assert.equal(storage.KTS_UNIFIED_SHARED_INPUT_V1,origTicket,"Undo may explicitly restore raw source");
assert.equal(storage.KTS_UNIFIED_CUT_SOURCE_HOLD_V1,undefined,"Undo releases cut hold");
assert.equal(afterF5.tach.value,origTicket,"Undo may restore sibling source");
// A new legitimate raw ticket in another mode MUST NOT overwrite the Cut
// ledger of a sibling. Its original source and durable Undo receipt remain
// owned by the mode whose outputs have already been Cut.
const newTicket="2d 12 34 dx2n";
const ledgerOwner=createSharedController(origTicket,origTicket);
ledgerOwner.ngang.value=ledgerTicket;
ledgerOwner.callbacks["kts:working-source"]({detail:{
  schema:"KTS_WORKING_SOURCE_V1",
  token:ledgerOwner.ngangWindow.__KTS_UNIFIED_FRAME_TOKEN__,
  value:ledgerTicket
}});
ledgerOwner.tach.value=newTicket;
ledgerOwner.tach.events.input();
assert.equal(ledgerOwner.ngang.value,ledgerTicket,
  "new raw source in Tách Đài must not overwrite protected Ngang Cut ledger");
assert.equal(storage.KTS_UNIFIED_FRESH_DRAFT_AFTER_CUT_V1,"1",
  "explicit new ticket after sibling Cut must be marked independently of old ledger");
const freshAfterF5=createSharedController(newTicket,ledgerTicket);
assert.equal(freshAfterF5.tach.value,newTicket,
  "F5 must preserve explicitly typed new Tách Đài draft, not silently erase it");
assert.equal(freshAfterF5.ngang.value,ledgerTicket,
  "F5 must preserve Ngang protected Cut ledger while new draft remains");
assert.equal(storage.KTS_UNIFIED_SHARED_INPUT_V1,newTicket,
  "F5 must keep the distinct fresh draft in the session");
assert.equal(ledgerOwner.dv.value,newTicket,
  "normal new ticket must still share to unrelated Đá Vòng");
assert.equal(storage.KTS_UNIFIED_SHARED_INPUT_V1,newTicket,
  "new explicit input must be recorded independently of protected Cut ledger");
console.log("UNIFIED VERSIONED UX CACHE: PASS");
