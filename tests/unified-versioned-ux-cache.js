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
assert.equal(version,"1.0.21","release review only: version must advance without downgrade");
assert.equal(source,version,"HTML URL must uniquely identify new Unified JavaScript");
assert.equal(ux,version,"embedded UX version must match shell");
assert.ok(cache && cache.includes("v"+version+"-"),"service-worker cache key must advance");
assert.ok(sw.includes("'./unified-core.js?ux="+version+"'"),"offline precache must include versioned JS requested by HTML");
assert.ok(sw.includes("'./unified-core.js'"),"existing unversioned asset remains available");
assert.match(core,/if\(nativeOutput\) doc\.getElementById\(outputButtonId\)\?\.remove\(\)/u);
assert.match(core,/if\(output&&!nativeOutput&&!doc\.getElementById\('resultGroups'\)\)/u);
assert.equal(app.split("Unified "+version).length-1,1,"displayed Unified version must match metadata once");
console.log("UNIFIED VERSIONED UX CACHE: PASS");
