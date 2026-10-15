"use strict";
// Source-level integration: Unified may share NORMAL raw wager input between
// child frames, but never serialize one child's local-only exact-output ledger
// into sibling frames or overwrite a restored ledger at initial attach.
// Runs offline under Node, without browser, live customer data or network.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const source=fs.readFileSync(path.join(__dirname,"../app/unified-core.js"),"utf8");
const marker="// Unified source-input authority:";
const start=source.indexOf(marker);
assert.ok(start>0,"Shared-input section must exist");
const install=source.slice(start);
assert.ok(install.includes("installUnifiedSharedInput"));

const PREFIX="[[KTS_EXACT_OUTPUT_LEDGER_V1]]\n";
const raw="2d 89 98 b5n dx2,5n";
const newer="2d 219 b5n";
const tachLedger=PREFIX+JSON.stringify({schema:"KTS_EXACT_OUTPUT_LEDGER_V1",
  app:"tach-dai-mobile",engine:"TEST_ENGINE",region:"mn",date:"2026-10-15",
  origin:raw,rows:[{id:"1:1:row",sourceLine:1,text:"bt 89 98 b5n"}]});
const ngangLedger=PREFIX+JSON.stringify({schema:"KTS_EXACT_OUTPUT_LEDGER_V1",
  app:"tach-dai-ngang",engine:"TEST_ENGINE",region:"mn",date:"2026-10-15",
  origin:raw,rows:[{id:"1:1:row",sourceLine:1,text:"2d 89 98 b2n"}]});

function input(value){
  return{value,events:Object.create(null),addEventListener(name,fn){
    (this.events[name]||= []).push(fn);
  },trigger(name){
    for(const fn of this.events[name]||[]) fn({target:this});
  }};
}
function makeFrame(el){
  const win={events:Object.create(null),addEventListener(name,fn){
    (this.events[name]||=[]).push(fn);
  },emit(name,detail){for(const fn of this.events[name]||[])fn({detail});}};
  return {contentDocument:{getElementById(id){return id==="input"?el:null}},
    contentWindow:win,addEventListener(){}};
}
function build({tachValue=raw,ngangValue=raw,sessionValue=raw,davongValue=raw}={}){
  const tach=input(tachValue),ngang=input(ngangValue),davong=input(davongValue);
  const tachFrame=makeFrame(tach),ngangFrame=makeFrame(ngang);
  const store=new Map([["KTS_UNIFIED_SHARED_INPUT_V1",sessionValue]]);
  const sessionStorage={getItem(k){return store.get(k)||null},
    setItem(k,v){store.set(k,String(v))}};
  let mode="tach";
  const tabs={addEventListener(){}};
  const doc={readyState:"complete",
    getElementById(id){return {tachFrame,ngangFrame,dvInput:davong}[id]||null;},
    querySelector(selector){
      if(selector===".tab.active")return {dataset:{mode}};
      if(selector===".tabs")return tabs;
      return null;
    }};
  const context={document:doc,sessionStorage,console,
    setTimeout(fn){fn();},Date,Math};
  vm.runInNewContext(install,context,{timeout:5000});
  return {tach,ngang,davong,tachFrame,ngangFrame,store,
    setMode(next){mode=next;},shared(){return store.get("KTS_UNIFIED_SHARED_INPUT_V1")}};
}
{
  const t=build();
  t.tach.value=newer;t.tach.trigger("input");
  assert.equal(t.shared(),newer,"normal input publishes to session");
  assert.equal(t.ngang.value,newer,"normal raw source shares to Ngang");
  assert.equal(t.davong.value,newer,"normal raw source shares to Đá Vòng");
}
{
  const t=build();
  const win=t.tachFrame.contentWindow;
  t.tach.value=tachLedger;
  win.emit("kts:working-source",{schema:"KTS_WORKING_SOURCE_V1",
    token:win.__KTS_UNIFIED_FRAME_TOKEN__,value:tachLedger});
  assert.equal(t.tach.value,tachLedger,"owner iframe keeps its exact ledger");
  assert.equal(t.ngang.value,raw,"DX ledger MUST NOT overwrite Ngang input");
  assert.equal(t.davong.value,raw,"DX ledger MUST NOT overwrite Đá Vòng input");
  assert.equal(t.shared(),raw,"serialized ledger MUST NOT persist in shared session");
  t.setMode("ngang");
}
{
  const t=build({tachValue:raw,ngangValue:ngangLedger,sessionValue:raw});
  assert.equal(t.ngang.value,ngangLedger,
    "restored Ngang ledger must survive Unified initial attach");
  assert.equal(t.tach.value,raw,
    "Ngang ledger must not propagate to fresh Mobile iframe");
  assert.equal(t.shared(),raw,
    "restored ledger must not become shared raw-source authority");
}
{
  const t=build();
  t.ngang.value=ngangLedger;t.ngang.trigger("change");
  assert.equal(t.ngang.value,ngangLedger,
    "local ledger must not disappear from owner iframe on change");
  assert.equal(t.tach.value,raw,
    "local-only ledger text must not appear in sibling iframe");
  assert.equal(t.shared(),raw,"change event must not persist ledger as raw");
}
console.log("UNIFIED MODE-LOCAL LEDGER SHARING: PASS");
