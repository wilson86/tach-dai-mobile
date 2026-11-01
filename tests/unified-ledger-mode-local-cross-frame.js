"use strict";
// Same-origin synthetic frame regression: normal input may be shared, but a Cut
// ledger is immutable mode-local state and must not be replayed to siblings.
// No browser account, external calls, real customer data or output mutation.
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const source=fs.readFileSync(path.join(__dirname,"../app/unified-core.js"),"utf8");
const marker="// Unified source-input authority:";
const start=source.indexOf(marker);
assert.ok(start>0,"Shared-input section must exist");
const install=source.slice(start);
assert.ok(install.includes("installUnifiedSharedInput"));
const guardSource=(source.match(/function checkUnifiedNgangFrame\(frame\)\{[\s\S]*?\n\}/u)||[])[0];
assert.ok(guardSource,"Exact engine gate missing");
const checkUnifiedNgangFrame=(new Function("return ("+guardSource+")"))();

const EXPECTED_ENGINE="0a0e541680405bd685a52225d637246064ef59a9715ea4afa72f750c9095e487";
const PREFIX="[[KTS_EXACT_OUTPUT_LEDGER_V1]]\n";
const raw="2d 89 98 b5n dx2,5n";
const newer="2d 219 b5n";
const tachLedger=PREFIX+JSON.stringify({schema:"KTS_EXACT_OUTPUT_LEDGER_V1",
  app:"tach-dai-mobile",engine:EXPECTED_ENGINE,region:"mn",date:"2026-10-15",
  origin:raw,rows:[{id:"1:1:row",sourceLine:1,text:"bt 89 98 b5n"}]});
const ngangLedger=PREFIX+JSON.stringify({schema:"KTS_EXACT_OUTPUT_LEDGER_V1",
  app:"tach-dai-ngang",engine:EXPECTED_ENGINE,region:"mn",date:"2026-10-15",
  origin:raw,rows:[{id:"1:1:row",sourceLine:1,text:"2d 89 98 b2n"}]});

function input(value){
  return{value,events:Object.create(null),addEventListener(name,fn){
    (this.events[name]||=[]).push(fn);
  },trigger(name){for(const fn of this.events[name]||[])fn({target:this});}};
}
function makeFrame(el,{ngang=false}={}){
  const win={events:Object.create(null),addEventListener(name,fn){
    (this.events[name]||=[]).push(fn);
  },emit(name,detail){for(const fn of this.events[name]||[])fn({detail});}};
  if(ngang){
    win.KTS_BUSINESS_ENGINE={ENGINE_SHA256:EXPECTED_ENGINE};
    win.validateCheckOnlyLine=()=>{};
    win.processLine=()=>{};
  }
  return {contentDocument:{getElementById(id){return id==="input"?el:null}},
    contentWindow:win,addEventListener(){}};
}
function build({tachValue=raw,ngangValue=raw,sessionValue=raw,davongValue=raw,held=false}={}){
  const tach=input(tachValue),ngang=input(ngangValue),davong=input(davongValue);
  const tachFrame=makeFrame(tach),ngangFrame=makeFrame(ngang,{ngang:true});
  const store=new Map([["KTS_UNIFIED_SHARED_INPUT_V1",sessionValue]]);
  if(held)store.set("KTS_UNIFIED_CUT_SOURCE_HOLD_V1","1");
  const sessionStorage={getItem(k){return store.has(k)?store.get(k):null},
    setItem(k,v){store.set(k,String(v))},removeItem(k){store.delete(k)}};
  let mode="tach";
  const tabs={addEventListener(){}};
  const doc={readyState:"complete",
    getElementById(id){return {tachFrame,ngangFrame,dvInput:davong}[id]||null;},
    querySelector(selector){
      if(selector===".tab.active")return {dataset:{mode}};
      if(selector===".tabs")return tabs;
      return null;
    }};
  vm.runInNewContext(install,{document:doc,sessionStorage,console,
    setTimeout(fn){fn();},Date,Math,checkUnifiedNgangFrame},{timeout:5000});
  return {tach,ngang,davong,tachFrame,ngangFrame,store,
    setMode(next){mode=next;},
    shared(){return store.get("KTS_UNIFIED_SHARED_INPUT_V1");},
    cutHold(){return store.get("KTS_UNIFIED_CUT_SOURCE_HOLD_V1");}};
}
{
  const t=build();
  t.tach.value=newer;t.tach.trigger("input");
  assert.equal(t.shared(),newer,"normal input publishes to session");
  assert.equal(t.ngang.value,newer,"normal raw source shares to Ngang with matching engine");
  assert.equal(t.davong.value,newer,"normal raw source shares to Da Vong");
}
{
  const t=build();
  const win=t.tachFrame.contentWindow;
  t.tach.value=tachLedger;
  win.emit("kts:working-source",{schema:"KTS_WORKING_SOURCE_V1",
    token:win.__KTS_UNIFIED_FRAME_TOKEN__,value:tachLedger});
  assert.equal(t.tach.value,tachLedger,"owner Tách Đài keeps its protected ledger");
  assert.equal(t.ngang.value,"","Cut must revoke prior raw from Ngang");
  assert.equal(t.davong.value,"","Cut must revoke prior raw from Da Vong");
  assert.equal(t.shared(),"","Cut raw must NOT persist in the shared source session");
  assert.equal(t.cutHold(),"1","Cut hold survives F5");
  // Distinct operator-typed new ticket is legitimate, but may never overwrite
  // another mode's exact-output ledger or its durable Undo receipt.
  t.ngang.value=newer;t.ngang.trigger("input");
  assert.equal(t.tach.value,tachLedger,"new Ngang ticket cannot replace Tách Đài Cut ledger");
  assert.equal(t.shared(),newer,"explicit fresh ticket can be shared");
  assert.equal(t.davong.value,newer,"fresh ticket may propagate to non-ledger sibling");
  assert.equal(t.cutHold(),undefined,"explicit edit clears F5 replay hold");
}
{
  const t=build({tachValue:raw,ngangValue:ngangLedger,sessionValue:raw});
  assert.equal(t.ngang.value,ngangLedger,"rehydrated Ngang ledger must remain untouched");
  assert.equal(t.tach.value,"","restored Ngang ledger revokes stale sibling source");
  assert.equal(t.davong.value,"","restored Ngang ledger revokes Da Vong stale source");
  assert.equal(t.shared(),"","restore must not replay cut source into session");
  assert.equal(t.cutHold(),"1","restore must mark Cut hold");
}
{
  const t=build();
  t.ngang.value=ngangLedger;t.ngang.trigger("change");
  assert.equal(t.ngang.value,ngangLedger,"ledger change does not destroy owner input");
  assert.equal(t.tach.value,"","local ledger Cut revokes stale sibling wager");
  assert.equal(t.shared(),"","ledger must not appear as raw shared source");
  t.ngang.value=newer;t.ngang.trigger("input");
  assert.equal(t.shared(),newer,"explicit Undo/edit can restore shared raw source");
  assert.equal(t.cutHold(),undefined,"Undo/edit releases Cut hold");
  assert.equal(t.tach.value,newer,"Undo/edit propagates to available sibling");
}
{
  const t=build({tachValue:raw,ngangValue:ngangLedger,sessionValue:raw,held:true});
  assert.equal(t.ngang.value,ngangLedger,"F5 must preserve protected Ngang ledger");
  assert.equal(t.tach.value,"","F5 must not resurrect stale source in Tách Đài");
  assert.equal(t.shared(),"","F5 must keep Cut raw revoked from session");
}
console.log("UNIFIED MODE-LOCAL CUT LEDGER SHARING: PASS");
