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
console.log("UNIFIED VERSIONED UX CACHE: PASS");
