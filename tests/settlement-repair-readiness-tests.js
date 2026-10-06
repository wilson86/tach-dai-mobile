'use strict';
const fs=require('fs');const vm=require('vm');const assert=require('assert');

function candidate(id='c1'){return {id,state:'pending',case:{scope:{partner_id:'p1',business_date:'2026-09-22',region:'mn'}}};}
function replay(exact,delta=0){return {pass:exact,settlement:{engine_version:'engine-now'},comparison:{status:exact?'MATCH_EXACT':'MISMATCH',safe_to_promote:exact,totals:{final_net:{status:exact?'MATCH_EXACT':'MISMATCH',delta}}}};}
function makeCtx(options={}){
  const rows=options.rows||[candidate()];
  const candidates={STATES:{PENDING:'pending'},async listCandidates(){return JSON.parse(JSON.stringify(rows));}};
  const regression={replayCase:c=>options.replay?options.replay(c):replay(true,0)};
  const parserReplay=options.noParser?null:{async replayCandidateId(id){if(options.parserError)throw new Error(options.parserError);return options.parserResult||{candidate_id:id,resolution_state:'ENGINE_PATH_EXACT_PARSER_UNCHANGED',human_review_ready:true,reference_match_exact:true,status:'CANONICAL_UNCHANGED_ENGINE_EXACT'};}};
  const ctx={console,globalThis:null,KTS_SETTLEMENT_REGRESSION_CANDIDATES:candidates,KTS_SETTLEMENT_REGRESSION_CASES:regression,KTS_SETTLEMENT_PARSER_REPLAY:parserReplay};ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync('app/settlement-repair-readiness.js','utf8'),ctx,{filename:'settlement-repair-readiness.js'});return ctx.KTS_SETTLEMENT_REPAIR_READINESS;
}
(async()=>{
  const R=makeCtx();assert.strictEqual(R.version,'settlement-repair-readiness-v2-bulk');
  const local=R.localAssessment(candidate(),{replayCase(){return replay(true,0);}});assert.strictEqual(local.status,'ENGINE_EXACT');assert.strictEqual(local.exact,true);
  const pending=R.combineAssessment(local,null);assert.strictEqual(pending.status,'ENGINE_EXACT_PARSER_UNCHECKED');assert.strictEqual(pending.ready_for_human_confirmation,false);
  const ready=R.combineAssessment(local,{resolution_state:'ENGINE_PATH_EXACT_PARSER_UNCHANGED',human_review_ready:true,reference_match_exact:true,status:'CANONICAL_UNCHANGED_ENGINE_EXACT'});assert.strictEqual(ready.status,'READY_HUMAN_CONFIRM');assert.strictEqual(ready.ready_for_human_confirmation,true);
  const risk=R.combineAssessment(local,{resolution_state:'PARSER_REGRESSION_RISK',human_review_ready:false,reference_match_exact:false});assert.strictEqual(risk.status,'PARSER_REGRESSION_RISK');assert.strictEqual(risk.ready_for_human_confirmation,false);
  const unresolvedLocal=R.localAssessment(candidate(),{replayCase(){return replay(false,1);}});const unresolved=R.combineAssessment(unresolvedLocal,null);assert.strictEqual(unresolved.status,'UNRESOLVED');
  const errorLocal=R.localAssessment(candidate(),{replayCase(){throw new Error('boom');}});assert.strictEqual(errorLocal.status,'ENGINE_REPLAY_ERROR');
  const summary=R.summarize([ready,pending,risk,unresolved,R.combineAssessment(errorLocal,null)]);assert.strictEqual(summary.total,5);assert.strictEqual(summary.ready,1);assert.strictEqual(summary.parser_unchecked,1);assert.strictEqual(summary.parser_risk,1);assert.strictEqual(summary.errors,1);assert.strictEqual(summary.blocked,4);assert.strictEqual(summary.all_ready,false);
  assert.strictEqual(R.summarize([ready]).all_ready,true);
  const queue=await makeCtx().loadLocalQueue();assert.strictEqual(queue.length,1);assert.strictEqual(queue[0].assessment.status,'ENGINE_EXACT_PARSER_UNCHECKED');
  const checked=await makeCtx().checkParser('c1');assert.strictEqual(checked.assessment.status,'READY_HUMAN_CONFIRM');assert.strictEqual(checked.parser_skipped,false);
  const skipped=await makeCtx({replay(){return replay(false,2);}}).checkParser('c1');assert.strictEqual(skipped.parser_skipped,true);assert.strictEqual(skipped.assessment.status,'UNRESOLVED');
  const parserErr=R.combineAssessment(local,{resolution_state:'PARSER_PATH_ERROR',status:'PARSER_REPLAY_ERROR',error:'http'});assert.strictEqual(parserErr.status,'PARSER_ERROR');
  const bulkReady=await makeCtx().checkParserRows(await makeCtx().loadLocalQueue());assert.strictEqual(bulkReady.length,1);assert.strictEqual(bulkReady[0].assessment.status,'READY_HUMAN_CONFIRM');
  const Rerr=makeCtx({parserError:'PARSER_HTTP_500'});const bulkErr=await Rerr.checkParserRows(await Rerr.loadLocalQueue());assert.strictEqual(bulkErr[0].assessment.status,'PARSER_ERROR');
  const Runresolved=makeCtx({replay(){return replay(false,2);}});const bulkSkip=await Runresolved.checkParserRows(await Runresolved.loadLocalQueue());assert.strictEqual(bulkSkip[0].assessment.status,'UNRESOLVED');
  const report=R.readinessReport([{candidate:candidate(),assessment:ready}]);assert.strictEqual(report.format,'kts-repair-readiness-report-v2-bulk');assert.strictEqual(report.qualification_state,'READY_FOR_OPERATOR_REVIEW');assert.strictEqual(report.summary.ready,1);assert.strictEqual(report.items[0].ready_for_human_confirmation,true);
  const blockedReport=R.readinessReport([{candidate:candidate(),assessment:pending}]);assert.strictEqual(blockedReport.qualification_state,'BLOCKED_PENDING_REPAIR');
  console.log('settlement-repair-readiness-tests: PASS');
})().catch(e=>{console.error(e);process.exit(1);});
