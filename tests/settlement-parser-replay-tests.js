'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

function replayResult(exact, finalValue, engine='engine-now') {
  return {
    pass: exact,
    settlement:{ engine_version:engine, settlement_result:{ final_net:Number(finalValue), exact:{final_net:String(finalValue)} } },
    comparison:{ status:exact?'MATCH_EXACT':'MISMATCH', safe_to_promote:exact, totals:{ final_net:{status:exact?'MATCH_EXACT':'MISMATCH',local:Number(finalValue),reference:13.68,delta:Number(finalValue)-13.68} }, categories:[] }
  };
}
function makeCtx(parserImpl, regressionImpl) {
  const candidate = { id:'candidate:ev1', source_event_id:'ev1', state:'pending', case:{
    id:'regression:ev1', partner_role:'customer', scope:{scope_id:'scope:p1:2026-09-22:mn',partner_id:'p1',business_date:'2026-09-22',region:'mn'},
    config_snapshot:{total_percent:'100',refund_percent:'0'}, lottery_result_snapshot:{business_date:'2026-09-22',region:'mn',stations:[{code:'tg',prizes:{}}]},
    expected_reference:{totals:{xac:'18',qua_co:'13.68',payout:'0',final:'13.68'}},
    messages:[
      {id:'m1',raw_text:'tg 88 b 1n',canonical_payload:{region:'mn',parser_version:'old-v1',legs:[{code:'2CB',values:['88'],stake:'1',action:'b',position:null,station_codes:['tg'],inherited_values:false}]}},
      {id:'m2',raw_text:'cancelled',status:'cancelled',canonical_payload:{region:'mn',parser_version:'old-v1',legs:[{code:'2CB',values:['99'],stake:'1',station_codes:['tg']}]}}
    ]
  }};
  const event={id:'ev1',comparison_status:'MISMATCH',comparison:{status:'MISMATCH'},partner_id:'p1',business_date:'2026-09-22',region:'mn'};
  const parser=Object.assign({endpoint(){return '/api/settlement/parse';},async fetchCanonical(){throw new Error('not implemented');}},parserImpl||{});
  const regression=Object.assign({replayCase(){throw new Error('not implemented');}},regressionImpl||{});
  const candidates={STATES:{PENDING:'pending'},async listCandidates(){return [JSON.parse(JSON.stringify(candidate))];}};
  const runtime={async getHistory(){return [JSON.parse(JSON.stringify(event))];}};
  const ctx={console,globalThis:null,KTS_SETTLEMENT_REGRESSION_CANDIDATES:candidates,KTS_SETTLEMENT_SHADOW_RUNTIME:runtime,KTS_SETTLEMENT_PARSER_PROVIDER:parser,KTS_SETTLEMENT_REGRESSION_CASES:regression};ctx.globalThis=ctx;
  vm.createContext(ctx);vm.runInContext(fs.readFileSync('app/settlement-parser-replay.js','utf8'),ctx,{filename:'settlement-parser-replay.js'});
  return {api:ctx.KTS_SETTLEMENT_PARSER_REPLAY,candidate,event};
}

(async()=>{
  {
    let calls=0;
    const {api,candidate,event}=makeCtx({async fetchCanonical(){return {region:'mn',parser_version:'new-v2',legs:[{code:'2CB',values:['88'],stake:'1.0',action:'b',position:null,station_codes:['tg'],inherited_values:false}]};}},{replayCase(){calls++;return replayResult(true,'13.68');}});
    assert.strictEqual(api.version,'settlement-parser-replay-v2-attribution');
    assert.strictEqual(api.canonicalShape(candidate.case.messages[0].canonical_payload,'mn').legs[0].stake,'1');
    const r=await api.replayCandidate(candidate,event);
    assert.strictEqual(calls,2);
    assert.strictEqual(r.status,'CANONICAL_UNCHANGED_ENGINE_EXACT');
    assert.strictEqual(r.resolution_state,'ENGINE_PATH_EXACT_PARSER_UNCHANGED');
    assert.strictEqual(r.human_review_ready,true);
    assert.strictEqual(r.changed_message_count,0);
    assert.strictEqual(r.messages[1].status,'SKIPPED_CANCELLED');
    assert.strictEqual(r.captured_canonical_path.final_exact,'13.68');
    assert.strictEqual(r.parser_path_final_exact,'13.68');
    assert.strictEqual(r.money_path_changed,false);
  }
  {
    const {api,candidate,event}=makeCtx({async fetchCanonical(){return {region:'mn',parser_version:'new-v3',legs:[{code:'2CB',values:['89'],stake:'1',action:'b',position:null,station_codes:['tg'],inherited_values:false}]};}},{replayCase(kase){const v=kase.messages[0].canonical_payload.legs[0].values[0];return v==='89'?replayResult(true,'13.68'):replayResult(false,'14');}});
    const diff=api.canonicalDiff(candidate.case.messages[0].canonical_payload,{region:'mn',legs:[{code:'2CB',values:['89'],stake:'1',action:'b',station_codes:['tg']}]},'mn');
    assert(diff.some(x=>x.path==='legs[0].values'));
    const r=await api.replayCandidate(candidate,event);
    assert.strictEqual(r.status,'CANONICAL_CHANGED_REPLAY_EXACT');
    assert.strictEqual(r.resolution_state,'PARSER_CHANGE_RESOLVES_REFERENCE');
    assert.strictEqual(r.human_review_ready,true);
    assert.strictEqual(r.changed_message_count,1);
    assert.strictEqual(r.money_path_changed,true);
    assert.strictEqual(r.captured_canonical_path.reference_match_exact,false);
    assert.strictEqual(r.reference_match_exact,true);
  }
  {
    let calls=0;
    const {api,candidate,event}=makeCtx({async fetchCanonical(){throw new Error('PARSER_HTTP_500');}},{replayCase(){calls++;return replayResult(false,'14');}});
    const r=await api.replayCandidate(candidate,event);
    assert.strictEqual(r.status,'PARSER_REPLAY_ERROR');
    assert.strictEqual(r.resolution_state,'PARSER_PATH_ERROR');
    assert.strictEqual(r.error_count,1);
    assert.strictEqual(calls,1);
    assert.strictEqual(r.human_review_ready,false);
  }
  {
    const {api}=makeCtx({async fetchCanonical(){return {region:'mn',parser_version:'v4',legs:[{code:'2CB',values:['88'],stake:'1',action:'b',station_codes:['tg']}]};}},{replayCase(){return replayResult(false,'14','e4');}});
    const one=await api.replayCandidateId('candidate:ev1');
    assert.strictEqual(one.status,'CANONICAL_UNCHANGED_STILL_MISMATCH');
    assert.strictEqual(one.resolution_state,'PARSER_UNCHANGED_UNRESOLVED');
    const group=await api.replayGroup(['candidate:ev1','missing']);
    assert.strictEqual(group.total,2);assert.strictEqual(group.exact,0);assert.strictEqual(group.ready_for_human_review,0);assert.strictEqual(group.errors,1);
  }
  {
    const {api,candidate,event}=makeCtx({async fetchCanonical(){return {region:'mn',parser_version:'bad-new',legs:[{code:'2CB',values:['89'],stake:'1',action:'b',station_codes:['tg']}]};}},{replayCase(kase){return kase.messages[0].canonical_payload.legs[0].values[0]==='88'?replayResult(true,'13.68'):replayResult(false,'14.68');}});
    const r=await api.replayCandidate(candidate,event);
    assert.strictEqual(r.resolution_state,'PARSER_REGRESSION_RISK');
    assert.strictEqual(r.human_review_ready,false);
    const group=await api.replayGroup(['candidate:ev1']);
    assert.strictEqual(group.parser_regression_risks,1);
  }
  assert.strictEqual(makeCtx().api.classifyResolution({reference_match_exact:true},1,{reference_match_exact:false}),'PARSER_REGRESSION_RISK');
  console.log('settlement-parser-replay-tests: PASS');
})().catch(e=>{console.error(e);process.exit(1);});
