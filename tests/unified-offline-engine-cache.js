"use strict";
// Offline navigation safety gate. The parent app cache MUST prepare the nested
// Mobile root engine assets and register the root-scope service worker because
// app-scope SW cannot intercept ../ iframe navigation. Native Node; no network.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const root=path.resolve(__dirname,"..");
const html=fs.readFileSync(path.join(root,"app/index.html"),"utf8");
const appSW=fs.readFileSync(path.join(root,"app/sw.js"),"utf8");
const rootSW=fs.readFileSync(path.join(root,"sw.js"),"utf8");
const version=JSON.parse(fs.readFileSync(path.join(root,"app/version.json"),"utf8"));
const core=fs.readFileSync(path.join(root,"app/unified-core.js"),"utf8");
const engine=fs.readFileSync(path.join(root,"business_engine.generated.js"),"utf8");
const SHA="0a0e541680405bd685a52225d637246064ef59a9715ea4afa72f750c9095e487";
assert.equal(version.version,"1.0.28");
assert.equal(version.business_engine_sha256,SHA);
assert.ok(engine.includes(SHA));
assert.ok(core.includes("const UX_VERSION='"+version.version+"'"),
  "Unified core identity must follow actual candidate version");
assert.ok(html.includes("unified-core.js?ux="+version.version),
  "Unified HTML must load the same versioned JS as its metadata");
assert.match(html,/navigator\.serviceWorker\.register\('\.\.\/sw\.js',\{scope:'\.\.\/'\}\)/u);
assert.match(html,/navigator\.serviceWorker\.register\('\.\/sw\.js',\{scope:'\.\/'\}\)/u);
assert.match(html,/rootRegistration\.active/u);
assert.match(html,/CACHE_MISSING:/u);
assert.match(html,/ENGINE_CACHE_MISMATCH/u);
const start=html.search(/async function runDaVong\([^)]*\)\s*\{/u);
assert.ok(start>=0,'actual Da Vong entrypoint must exist');
const noReady=html.slice(start,html.indexOf("$('dvRun').addEventListener"));
assert.match(noReady,/msg\.includes\('ENGINE_NOT_READY'\)/u);
const failure=noReady.slice(noReady.indexOf("if(msg.includes"),noReady.indexOf("$('dvOutput').value=''",noReady.indexOf("if(msg.includes")));
assert.match(failure,/return;/u,"Unavailable engine must preserve existing row ledger");
function mockWorker(js,scopeUrl){
 const events=new Map(),entries=new Map();
 const cache={async addAll(paths){for(const p of paths){
   const uri=new URL(p,scopeUrl).href;
   entries.set(uri,{ok:true,url:uri,clone(){return this},async text(){return engine}});
 }},async put(req,response){entries.set(req.url,response)}};
 const allCaches=new Map([["test",cache]]);
 const caches={
   async open(){return cache},
   async match(req){return entries.get(typeof req==="string"?new URL(req,scopeUrl).href:req.url)||null},
   async keys(){return [...allCaches.keys()]},
   async delete(k){return allCaches.delete(k)}
 };
 const self={addEventListener(type,handler){events.set(type,handler)},
   skipWaiting(){return Promise.resolve()},clients:{claim(){return Promise.resolve()}}};
 vm.runInNewContext(js,{self,caches,URL,fetch:async()=>{throw Error("offline")},Response,
   console,Promise,setTimeout,clearTimeout},{timeout:5000});
 return {events,entries,caches};
}
(async()=>{
 const base="https://pilot.example/kts-grouped-pilot/tach-dai-mobile/";
 const app=mockWorker(appSW,base+"app/");
 let task;
 app.events.get("install")({waitUntil(promise){task=promise}});
 await task;
 for(const rel of ["../","../index.html","../sw.js",
   "../station_calendar.generated.js","../business_engine.generated.js",
   "./index.html","./unified-core.js?ux=1.0.28"]){
   assert.ok(app.entries.has(new URL(rel,base+"app/").href),"missing app precache "+rel);
 }
 const root=mockWorker(rootSW,base);
 root.events.get("install")({waitUntil(promise){task=promise}});
 await task;
 const request={url:base,mode:"navigate",method:"GET"};
 let response;
 root.events.get("fetch")({request,respondWith(promise){response=promise}});
 const offlinePage=await response;
 assert.ok(offlinePage,"root iframe HTML must resolve when offline");
 assert.equal(offlinePage.url,base);
 for(const rel of ["station_calendar.generated.js","business_engine.generated.js"]){
   const req={url:new URL(rel,base).href,mode:"no-cors",method:"GET"};
   let p;
   root.events.get("fetch")({request:req,respondWith(v){p=v}});
   assert.ok(await p,"root iframe must load cached "+rel+" offline");
 }
 console.log("UNIFIED OFFLINE ENGINE SW BOOTSTRAP: PASS");
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
