'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {inspect,MARKERS,SHOTS}=require('../scripts/issue18-1032-evidence-review.js');
const PIN={KTS:'79680f4dc65e07ddd17f90e448a2f4236d240452',Mobile:'5cd748700e60d5c682b77a8d99a9130faeb6102f',Ngang:'f35245f537977cfde3399079122cd4e6f9d84725'};
const ENGINE='0a0e541680405bd685a52225d637246064ef59a9715ea4afa72f750c9095e487';
function fixture(){
  const checks=MARKERS.map(label=>({label,value:{}}));
  const named=Object.fromEntries(checks.map(x=>[x.label,x.value]));
  named.REAL_CHROME_SW.controller='http://127.0.0.1:8768/app/sw.js';
  named.REAL_CHROME_SW.cacheKeys=['cache-a','cache-b','cache-c'];
  named.RUNTIME_ENGINE_AND_ALIAS.mobileSha=ENGINE;
  named.RUNTIME_ENGINE_AND_ALIAS.ngangSha=ENGINE;
  named.RUNTIME_ENGINE_AND_ALIAS.mobileAlias='mb 43 b10n 98 duoi100n';
  named.RUNTIME_ENGINE_AND_ALIAS.ngangAlias='mb 43 b10n 98 duoi100n';
  for(const m of ['tach','ngang','davong']){
    named['VALID_HN_DUI_'+m].outputLines=4;
    named['DUPLICATE_PHYSICAL_LINE_'+m].outputLines=2;
    named['MIXED_INVALID_'+m].rows=0;
  }
  named.CUT_ALL_BEFORE_F5.rows=0;
  named.CUT_ALL_AFTER_F5.rows=0; named.CUT_ALL_AFTER_F5.mode='ngang';
  named.UNDO_AFTER_F5.originalRestored=true;
  named.UNDO_AFTER_F5.output='2d 52 68 dx2.5n\n2d 52 68 dx2.5n';
  named.CUT_A_NEW_B_F5.draftPersisted=true;
  named.CUT_A_NEW_B_F5.cutALedgerRows=0;
  return {source:{...PIN},preview:'http://127.0.0.1:8768/app/',chrome:'PASS_SCOPED_HEADLESS_CHROME',
    chromeVersion:'Chrome/156.0.8078.74',unifiedVersion:{version:'1.0.32'},
    production:'NO_GO',android:'NOT_RUN',cost_usd:0,checks,screenshots:[...SHOTS]};
}
function value(f,label){return f.checks.find(x=>x.label===label).value}
function rejects(label,alter,pattern){
  test(label,()=>{const x=fixture();alter(x);assert.throws(()=>inspect(x),pattern)});
}
test('complete synthetic receipt qualifies ONLY scoped evidence, never release',()=>{
  const result=inspect(fixture());
  assert.equal(result.status,'PASS_SCOPED_RECEIPT_CONSISTENCY_ONLY');
  assert.equal(result.release,'NO_GO');
  assert.equal(result.chromeGuest,'NOT_RUN');
  assert.equal(result.android,'NOT_RUN');
  assert.equal(result.humanMoneyOracle,'NOT_RUN');
  assert.equal(result.checks,MARKERS.length);
  assert.equal(result.screenshots,7);
});
rejects('wrong app SHA must not inherit old Chrome receipt',x=>x.source.Mobile='6cb03a5301ea121b6e474a6d40fa6e656c27818a',/SOURCE_SHA_MISMATCH/);
rejects('wrong runtime engine cannot be passed by UI label',x=>value(x,'RUNTIME_ENGINE_AND_ALIAS').ngangSha='0'.repeat(64),/EXECUTED_ENGINE_SHA_MISMATCH/);
rejects('missing browser cache scope fails',x=>value(x,'REAL_CHROME_SW').controller=null,/SW_CONTROLLER_MISMATCH/);
rejects('missing a mode result fails',x=>x.checks=x.checks.filter(t=>t.label!=='VALID_HN_DUI_davong'),/MISSING_OR_DUPLICATE_CHECK/);
rejects('invalid mixed source showing partial row fails',x=>value(x,'MIXED_INVALID_ngang').rows=1,/PARTIAL_RESULT_EXPOSED/);
rejects('F5 replay of Cut row fails',x=>value(x,'CUT_ALL_AFTER_F5').rows=1,/CUT_F5_REPLAY_OR_TAB_DRIFT/);
rejects('Undo cannot double half-unit stakes',x=>value(x,'UNDO_AFTER_F5').output='2d 52 68 dx5n\n2d 52 68 dx5n',/UNDO_AMOUNT_OR_COUNT_MISMATCH/);
rejects('crossmode new draft cannot disappear',x=>value(x,'CUT_A_NEW_B_F5').draftPersisted=false,/CROSS_MODE_B_OR_A_MISMATCH/);
rejects('production approval must never be inferred',x=>x.production='GO',/RELEASE_BOUNDARY_MISSING/);
rejects('Chrome must report exact pinned version',x=>x.unifiedVersion={version:'1.0.31'},/UNIFIED_VERSION_MISMATCH/);
rejects('duplicate fixture records are not acceptable evidence',x=>x.checks.push({label:'CUT_ALL_BEFORE_F5',value:{rows:0}}),/MISSING_OR_DUPLICATE_CHECK/);
