'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

function makeCtx(parserImpl, regressionImpl) {
  const candidate = {
    id:'candidate:ev1', source_event_id:'ev1', state:'pending',
    case:{
      id:'regression:ev1', partner_role:'customer',
      scope:{ scope_id:'scope:p1:2026-09-22:mn', partner_id:'p1', business_date:'2026-09-22', region:'mn' },
      config_snapshot:{ total_percent:'100', refund_percent:'0' },
      lottery_result_snapshot:{ business_date:'2026-09-22', region:'mn', stations:[{code:'tg',prizes:{}}] },
      expected_reference:{ totals:{ xac:'18', qua_co:'13.68', payout:'0', final:'13.68' } },
      messages:[
        { id:'m1', raw_text:'tg 88 b 1n', canonical_payload:{ region:'mn', parser_version:'old-v1', legs:[{code:'2CB',values:['88'],stake:'1',action:'b',position:null,station_codes:['tg'],inherited_values:false}] } },
        { id:'m2', raw_text:'cancelled', status:'cancelled', canonical_payload:{ region:'mn', parser_version:'old-v1', legs:[{code:'2CB',values:['99'],stake:'1',station_codes:['tg']}] } }
      ]
    }
  };
  const event = { id:'ev1', comparison_status:'MISMATCH', comparison:{status:'MISMATCH'}, partner_id:'p1', business_date:'2026-09-22', region:'mn' };
  const parser = Object.assign({
    endpoint(){ return '/api/settlement/parse'; },
    async fetchCanonical(){ throw new Error('not implemented'); }
  }, parserImpl || {});
  const regression = Object.assign({ replayCase(){ throw new Error('not implemented'); } }, regressionImpl || {});
  const candidates = { STATES:{PENDING:'pending'}, async listCandidates(){ return [JSON.parse(JSON.stringify(candidate))]; } };
  const runtime = { async getHistory(){ return [JSON.parse(JSON.stringify(event))]; } };
  const ctx = { console, globalThis:null, KTS_SETTLEMENT_REGRESSION_CANDIDATES:candidates, KTS_SETTLEMENT_SHADOW_RUNTIME:runtime, KTS_SETTLEMENT_PARSER_PROVIDER:parser, KTS_SETTLEMENT_REGRESSION_CASES:regression };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('app/settlement-parser-replay.js','utf8'), ctx, {filename:'settlement-parser-replay.js'});
  return { ctx, api:ctx.KTS_SETTLEMENT_PARSER_REPLAY, candidate, event };
}

(async()=>{
  {
    const {api,candidate,event} = makeCtx({ async fetchCanonical(){ return { region:'mn', parser_version:'new-v2', legs:[{code:'2CB',values:['88'],stake:'1.0',action:'b',position:null,station_codes:['tg'],inherited_values:false}] }; } }, {
      replayCase(kase){
        assert.strictEqual(kase.messages[0].canonical_payload.parser_version,'new-v2');
        return { pass:true, settlement:{engine_version:'engine-now'}, comparison:{status:'MATCH_EXACT',safe_to_promote:true,totals:{final_net:{status:'MATCH_EXACT',local:13.68,reference:13.68,delta:0}},categories:[]} };
      }
    });
    assert.strictEqual(api.version,'settlement-parser-replay-v1');
    const shape = api.canonicalShape(candidate.case.messages[0].canonical_payload,'mn');
    assert.strictEqual(shape.legs[0].stake,'1');
    const r = await api.replayCandidate(candidate,event);
    assert.strictEqual(r.status,'CANONICAL_UNCHANGED_ENGINE_EXACT');
    assert.strictEqual(r.changed_message_count,0);
    assert.strictEqual(r.error_count,0);
    assert.strictEqual(r.reference_match_exact,true);
    assert.strictEqual(r.messages[0].status,'CANONICAL_UNCHANGED');
    assert.strictEqual(r.messages[1].status,'SKIPPED_CANCELLED');
    assert.strictEqual(r.current_engine_version,'engine-now');
  }
  {
    const {api,candidate,event} = makeCtx({ async fetchCanonical(){ return { region:'mn', parser_version:'new-v3', legs:[{code:'2CB',values:['89'],stake:'1',action:'b',position:null,station_codes:['tg'],inherited_values:false}] }; } }, {
      replayCase(kase){
        assert.deepStrictEqual(Array.from(kase.messages[0].canonical_payload.legs[0].values),['89']);
        return { pass:true, settlement:{engine_version:'engine-now'}, comparison:{status:'MATCH_EXACT',safe_to_promote:true,totals:{final_net:{status:'MATCH_EXACT',delta:0}},categories:[]} };
      }
    });
    const diff = api.canonicalDiff(candidate.case.messages[0].canonical_payload, {region:'mn',legs:[{code:'2CB',values:['89'],stake:'1',action:'b',station_codes:['tg']}]}, 'mn');
    assert(diff.some(x=>x.path==='legs[0].values'));
    const r = await api.replayCandidate(candidate,event);
    assert.strictEqual(r.status,'CANONICAL_CHANGED_REPLAY_EXACT');
    assert.strictEqual(r.changed_message_count,1);
    assert.strictEqual(r.messages[0].changed,true);
    assert(r.messages[0].differences.some(x=>x.path==='legs[0].values'));
  }
  {
    let replayCalled = false;
    const {api,candidate,event} = makeCtx({ async fetchCanonical(){ throw new Error('PARSER_HTTP_500'); } }, { replayCase(){ replayCalled=true; } });
    const r = await api.replayCandidate(candidate,event);
    assert.strictEqual(r.status,'PARSER_REPLAY_ERROR');
    assert.strictEqual(r.error_count,1);
    assert.strictEqual(replayCalled,false);
    assert(r.messages[0].error.includes('PARSER_HTTP_500'));
  }
  {
    const {api} = makeCtx({ async fetchCanonical(){ return {region:'mn',parser_version:'v4',legs:[{code:'2CB',values:['88'],stake:'1',action:'b',station_codes:['tg']}]}; } }, {
      replayCase(){ return { pass:false, settlement:{engine_version:'e4'}, comparison:{status:'MISMATCH',safe_to_promote:false,totals:{final_net:{status:'MISMATCH',local:14,reference:13.68,delta:.32}},categories:[]} }; }
    });
    const one = await api.replayCandidateId('candidate:ev1');
    assert.strictEqual(one.status,'CANONICAL_UNCHANGED_STILL_MISMATCH');
    assert.strictEqual(one.current_final_delta,.32);
    const group = await api.replayGroup(['candidate:ev1','missing']);
    assert.strictEqual(group.total,2);
    assert.strictEqual(group.exact,0);
    assert.strictEqual(group.errors,1);
    assert(group.results[1].error.includes('CANDIDATE_NOT_FOUND'));
  }
  console.log('settlement-parser-replay-tests: PASS');
})().catch(e=>{console.error(e);process.exit(1);});
