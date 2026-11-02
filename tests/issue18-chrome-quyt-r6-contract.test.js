"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const run=fs.readFileSync(path.resolve(__dirname,"../scripts/issue18-chrome-quyt-r6-local-acceptance.js"),"utf8");
test("isolated Windows localhost and old evidence retained",()=>{
 assert.ok(run.includes("http://127.0.0.1:8772/app/"));
 assert.ok(run.includes("C:\\\\KTS-QA\\\\issue18-quyt-r6-8772"));
 assert.ok(run.includes("chrome-quyt-r6-acceptance-"));
 assert.ok(run.includes("KEEP_UNIQUE_EVIDENCE"));
 assert.ok(run.includes("HEADLESS_REAL_CHROME_NOT_CHROME_GUEST"));
});
test("SHA-bound source manifest and delivered JS must be compared",()=>{
 assert.ok(run.includes("SOURCE_MANIFEST.json"));
 assert.ok(run.includes("rev-parse','HEAD"));
 assert.ok(run.includes("verifyStageAssets(root)"));
 assert.ok(run.includes("sha256(Buffer.from(await request.arrayBuffer()))"));
 assert.ok(run.includes("source_manifest=sourceManifest"));
 assert.ok(run.includes("sha_bound_js"));
 assert.ok(run.includes("quyt-r10"));
});
test("actual Chrome source-bound Quyt GROUP-THEN-FACTOR oracle and HOLD",()=>{
 for(const expected of ["QUYT_AGGREGATE_THEN_RATE_","'1,067'","'1,05'",
  "'43 b3n'","'43 b214n'","DUPLICATE_OPERATOR_CONFIRMATION_REQUIRED",
  "SOURCE_OUTPUT_EXPOSURE_MISMATCH_HOLD","cleanCore:win.KTSCleanAggregate",
  "prepareGrouped(","'davong'","'ngang'","'tach'"]){
  assert.ok(run.includes(expected),expected);
 }
});
test("legacy Cut F5 Undo and synthetic 52 groups retained",()=>{
 for(const s of ["CLEAN_AGGREGATE_","CUT_ALL_BEFORE_F5",
  "UNDO_AFTER_F5","CUT_A_NEW_B_F5","length:19","length:7"]){
   assert.ok(run.includes(s),s);
 }
});
test("no paid CI, no real send, no deletes of older profiles",()=>{
 for(const forbidden of ["gh workflow run","npm install","firebase deploy","wrangler publish",
  "rmSync(","rmdirSync(","shutil.rmtree","sendTelegram("]){
  assert.ok(!run.includes(forbidden),forbidden);
 }
});
