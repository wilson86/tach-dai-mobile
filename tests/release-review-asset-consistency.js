"use strict";
// Review-only asset-identity gate: no browser/network, no deploy.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const rootHtml=read("index.html"),rootSW=read("sw.js");
const rootVersion=JSON.parse(read("version.json"));
const unifiedHtml=read("app/index.html"),unifiedSW=read("app/sw.js");
const unifiedCore=read("app/unified-core.js");
const unifiedVersion=JSON.parse(read("app/version.json"));
const engine=read("business_engine.generated.js"),calendar=read("station_calendar.generated.js");
const SHA="0a0e541680405bd685a52225d637246064ef59a9715ea4afa72f750c9095e487";
const MOBILE="2.0.40",UNIFIED="1.0.33";
const issue18StaleUpdateUi=rootHtml;
assert.ok(issue18StaleUpdateUi.includes("HOLD: Engine chưa đồng bộ."),"stale engine must show update action");
assert.ok(issue18StaleUpdateUi.includes("HOLD: Manifest/engine chưa đồng bộ."),"stale root version hash must show HOLD");
assert.ok(issue18StaleUpdateUi.includes('if (res.ok) {'),"failed version fetch must not suppress service worker update");
assert.ok(issue18StaleUpdateUi.includes("if (swRegistration) await swRegistration.update()"),"sw update should remain reachable");

assert.equal(rootVersion.version,MOBILE);
assert.equal(unifiedVersion.version,UNIFIED);
assert.equal(rootVersion.business_engine_sha256,SHA);
assert.equal(unifiedVersion.business_engine_sha256,SHA);
assert.ok(engine.includes(SHA));
for(const filename of ['quyt-bao-review.js','quyt-bao-review-ui.js']){
 assert.ok(read(filename).length>500,'Quyt review asset must exist');
 assert.ok(rootSW.includes('"./'+filename+'"'),'root SW precache missing '+filename);
 assert.ok(unifiedSW.includes("'../"+filename+"'"),'Unified precache missing '+filename);
 assert.ok(rootHtml.includes('src="./'+filename+'"'),'Mobile HTML missing '+filename);
 assert.ok(unifiedHtml.includes('src="../'+filename+'"'),'Unified HTML missing '+filename);
}

for(const filename of ['clean-aggregate-review.js','clean-aggregate-ui.js']){
  assert.ok(read(filename).length>300,'review-only clean asset must be present');
  assert.ok(rootSW.includes('"./'+filename+'"'),'Mobile SW must precache '+filename);
  assert.ok(unifiedSW.includes("'../"+filename+"'"),'Unified SW must precache '+filename);
  assert.ok(rootHtml.includes('src="./'+filename+'"'),'Mobile HTML must load '+filename);
  assert.ok(unifiedHtml.includes('src="../'+filename+'"'),'Unified must load '+filename);
}

assert.ok(calendar.length>0);
assert.ok(rootHtml.includes('const APP_VERSION = "'+MOBILE+'"'));
assert.ok(rootHtml.includes("v"+MOBILE));
const rootCache=(rootSW.match(/^const CACHE_NAME = "([^"]+)";$/mu)||[])[1];
assert.equal(rootCache,'tach-dai-mobile-v'+MOBILE+'-owner-singleton-dx-reject-clean-r2-quyt-r10',
  'root SW cache must identify the approved singleton-DX candidate, not an earlier duplicate-confirmation build');
assert.ok(rootSW.includes('JSON.stringify({version:"'+MOBILE+'"})'));
assert.ok(unifiedHtml.includes("Unified "+UNIFIED));
assert.ok(unifiedHtml.includes('./unified-core.js?ux='+UNIFIED));
assert.ok(unifiedHtml.includes('kts-tach-unified-v'+UNIFIED+'-owner-singleton-dx-0a0e54-clean-r2-quyt-r10'));
assert.ok(unifiedCore.includes("const UX_VERSION='"+UNIFIED+"'"));
assert.ok(unifiedSW.includes("kts-tach-unified-v"+UNIFIED+"-owner-singleton-dx-0a0e54"));
assert.ok(unifiedSW.includes("'./unified-core.js?ux="+UNIFIED+"'"));
assert.ok(unifiedSW.includes("'../business_engine.generated.js'"));
assert.ok(unifiedSW.includes("'../station_calendar.generated.js'"));
assert.ok(unifiedSW.includes("'../index.html'"));
assert.ok(unifiedSW.includes("'../sw.js'"));
assert.match(unifiedHtml,/CACHE_MISSING:/u);
assert.match(unifiedHtml,/ENGINE_CACHE_MISMATCH/u);
assert.ok(rootSW.includes('k.startsWith("tach-dai-mobile-")'));
assert.ok(unifiedSW.includes("k.startsWith('kts-tach-unified-')"));
assert.ok(unifiedHtml.includes('navigator.serviceWorker.register(\'../sw.js\''));
assert.ok(unifiedHtml.includes('navigator.serviceWorker.register(\'./sw.js\''));
const rootManifest=JSON.parse(read("manifest.webmanifest"));
const unifiedManifest=JSON.parse(read("app/manifest.webmanifest"));
assert.equal(rootManifest.start_url,"./index.html");
assert.equal(unifiedManifest.scope,"./");
assert.equal(unifiedManifest.start_url,"./");
assert.ok(unifiedHtml.includes('https://wilson86.github.io/tach-dai-ngang/'),
  "Ngang iframe authority preserved; paired release separately reviewed");
assert.ok(!rootHtml.includes("v2.0.30</span>"),"old published label not carried into candidate");
assert.ok(!unifiedHtml.includes('unified-core.js?ux=1.0.18'));
console.log("RELEASE REVIEW ASSET CONSISTENCY — MOBILE + UNIFIED PASS");
