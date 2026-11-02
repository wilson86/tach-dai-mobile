"use strict";
// Contract only; browser acceptance requires explicit Windows local execution.
// Do not treat this suite as Chrome, Android or operator-money approval.
const test=require("node:test"),assert=require("node:assert/strict"),
 fs=require("node:fs"),path=require("node:path");
const p=x=>fs.readFileSync(path.join(__dirname,"..",x),"utf8");
const script=p("scripts/issue18-chrome-1033-clean-local-acceptance.js");
const ui=p("clean-aggregate-ui.js");
const root=p("sw.js"),unified=p("app/sw.js");
test("candidate is localhost-only and pinned to exact preview versions",()=>{
 assert.ok(script.includes("http://127.0.0.1:8769/app/"));
 assert.ok(script.includes("issue18-clean-aggregate-20261102"));
 for(const ver of ["2.0.40","1.0.39","1.0.33"])assert.ok(script.includes(ver));
 for(const sha of ["64aab5a828976d3d2d747460bc37e1b3ae0ce479",
                    "9d62c1a25de05f333e98572239378d5e0fe61754",
                    "a8d9a1180c79c26c61dc282aa204d4ec6ca683df"])
   assert.ok(script.includes(sha));
 assert.ok(script.includes("Chrome DevTools did not start"));
 assert.ok(script.includes("Chrome/"));
 assert.ok(script.includes("HEADLESS_REAL_CHROME_NOT_CHROME_GUEST"));
});
test("synthetic repeated blocks are not lost and all modes need explicit keep-all",()=>{
 for(const mark of ["Array.from({length:19}","Array.from({length:7}",
  "count,52","kept,52","removed,0","[19,7]","forwardAuthorized,false",
  "HOLD","GIỮ ĐỦ","Clear must invalidate","CLEAN_AGGREGATE_"])
  assert.ok(script.includes(mark),"missing "+mark);
 for(const mode of ["tach","ngang","davong"])assert.ok(script.includes("'"+mode+"'"));
 assert.ok(script.includes("CUT_ALL_BEFORE_F5")&&script.includes("UNDO_AFTER_F5")&&
           script.includes("CUT_A_NEW_B_F5"));
});
test("stale review cannot be reused after programmatic source edits",()=>{
 for(const id of ["clearBtn","sourceCutBtn","undoBtn","cutBtn","dvClear","dvSourceCut","dvCutSelection"])
   assert.ok(ui.includes('"'+id+'"'),id);
 assert.ok(ui.includes('output.addEventListener("copy"'));
 assert.ok(ui.includes('event.preventDefault();reset();'));
 assert.ok(ui.includes('snapshot.raw!==input.value'));
});
test("WIP caches include review assets and force a changed cache identity",()=>{
 for(const asset of ["clean-aggregate-review.js","clean-aggregate-ui.js"]){
  assert.ok(root.includes(asset));assert.ok(unified.includes(asset));
 }
 assert.ok(root.includes("clean-r2"));
 assert.ok(unified.includes("clean-r2"));
});
test("review driver cannot dispatch, deploy, install or clean old evidence",()=>{
 for(const forbidden of ["npm install","gh workflow run","firebase deploy","wrangler publish",
                         "rmSync(","rmdirSync(","execSync("])assert.ok(!script.includes(forbidden),forbidden);
 assert.ok(script.includes("KEEP_UNIQUE_EVIDENCE"));
});
