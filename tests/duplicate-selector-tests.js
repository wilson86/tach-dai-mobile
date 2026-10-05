const fs=require('fs');
const vm=require('vm');
const assert=require('assert');
vm.runInThisContext(fs.readFileSync('business_engine.generated.js','utf8'));
const html=fs.readFileSync('index.html','utf8');
assert(html.includes('function assertNoDuplicateBetSelectors(groups)'));
assert(html.includes("sau ${first.selector}${first.amount} phải có số mới trước ${bet.selector}${bet.amount}"));
function guard(groups){
  for(const group of groups||[]){
    const seen=new Map();
    for(const bet of group.bets||[]){
      const key=String(bet.selector||'').toLowerCase();
      if(seen.has(key)) throw new Error('duplicate selector');
      seen.set(key,bet);
    }
  }
  return groups;
}
assert.throws(()=>guard(KTS_BUSINESS_ENGINE.parseBetPayloadAst('322 b5n b30n')),/duplicate selector/);
assert.throws(()=>guard(KTS_BUSINESS_ENGINE.parseBetPayloadAst('322 b 5n b 30n')),/duplicate selector/);
assert.doesNotThrow(()=>guard(KTS_BUSINESS_ENGINE.parseBetPayloadAst('322 b5n da5n')));
assert.doesNotThrow(()=>guard(KTS_BUSINESS_ENGINE.parseBetPayloadAst('322 b5n 123 b30n')));
assert.strictEqual(KTS_BUSINESS_ENGINE.ENGINE_SHA256,'6ce6fca5adbaaf7604e21ac91e0fcb7759201b53afd0d7d1d5ef2a9bf546837c');
console.log('duplicate-selector-tests PASS');
