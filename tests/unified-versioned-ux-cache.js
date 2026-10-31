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
assert.equal(version,"1.0.29","duplicate approval candidate must advance without downgrade");
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
  assert.equal(saved.at(-1)[1],matching?"ngang":"tach",label+": forbidden mode persisted");
}
console.log("UNIFIED VERSIONED UX CACHE: PASS");
