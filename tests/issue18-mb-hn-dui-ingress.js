"use strict";
// Issue #18: source-bound Node regression for narrowly-scoped MB HN and DUI
// spellings. Fixtures are entirely synthetic, never customer source.
// This checks parser admission with the real generated business engine but
// stubs unrelated UI punctuation/calendar helpers; it is NOT Chrome/Router QA.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const root=path.join(__dirname,"..");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const generated=fs.readFileSync(path.join(root,"business_engine.generated.js"),"utf8");
const engineWorld={};
vm.runInNewContext(generated,engineWorld,{filename:"business_engine.generated.js"});
const engine=engineWorld.KTS_BUSINESS_ENGINE;
assert.ok(engine&&/^[a-f0-9]{64}$/u.test(engine.ENGINE_SHA256),"real generated engine loaded");
function extract(begin,end){
  const a=html.indexOf(begin),b=html.indexOf(end,a+begin.length);
  assert.ok(a>=0&&b>a,"embedded function boundary available: "+begin);
  return html.slice(a,b);
}
const code=extract("function normalizeInput(s){","function normalizeSenderName(s){")+"\n"+
  extract("function validateCheckOnlyLine(line,region,stations){","function splitNumberGroups(rest){");
const world={
  KTS_BUSINESS_ENGINE:engine,
  stripInvisible:s=>s,
  normalizeFullStationNames:s=>s,
  normalizeContextualBlStationSlots:s=>s,
  normalizeNumericBetSeparators:s=>s,
  normalizeBetGrammarSeparators:s=>s,
  normalizeDuplicateAmountSuffix:s=>s,
  assertBusinessEnginePinned:()=>assert.equal(engine.ENGINE_SHA256,
    "0a0e541680405bd685a52225d637246064ef59a9715ea4afa72f750c9095e487"),
  isNumberToken:t=>engine.isNumberToken(t),
  validateBetPayload:rest=>{
    engine.parseBetPayloadAst(rest);
    for(const {amount} of engine.extractStakeOccurrences(rest))
      assert.ok(engine.parseMoney(amount).halfUnits>0);
    return true;
  },
  validateSingletonTwoStationDx:()=>{},
  validateStationVsDaSyntax:()=>{},
  extractBetTypes:()=>[]
};
vm.createContext(world);
vm.runInContext(code,world,{filename:"embedded-issue18-functions.js"});
let assertions=0;
function admitted(text,region="mb"){
  assert.equal(world.validateCheckOnlyLine(text,region,[]),true,text);
  assertions++;
}
function rejected(text,region="mb"){
  assert.throws(()=>world.validateCheckOnlyLine(text,region,[]),undefined,text);
  assertions++;
}
function normalized(input,want){
  assert.equal(world.normalizeInput(input),want);
  assertions++;
}
const hn="hn 21 34 47 b10n 58 dui 12n 63 74 b5n";
const mb="mb 12 dd5n b3n 48 b7n";
admitted(hn);
admitted("21 34 b10n 58 dui12n");
admitted(mb);
admitted(hn);
normalized(hn,"mb 21 34 47 b10n 58 duoi 12n 63 74 b5n");
normalized("98 dui100n","98 duoi100n");
normalized("43 duix100n","43 duix100n");
normalized("43 dui","43 dui");
normalized("43 nhan100n","43 nhan100n");
normalized("43 hn b10n","43 hn b10n");
rejected("hn 43 b10n","mn");
rejected("hn 43 b10n","mt");
rejected("hnx 43 b10n");
rejected("43 b10n 98 duix100n");
rejected("43 b10n 98 dui");
rejected("43 b10n 98 chui100n");
rejected("hn 43 43 b10n"); // canonical duplicate-number policy not bypassed
console.log("ISSUE18_MB_HN_DUI_SOURCE_BOUND_NODE_PASS "+assertions+" assertions; browser/Router/Ngang NOT_RUN");
