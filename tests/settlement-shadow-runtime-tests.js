'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const state = {
  partners:[{id:'p1',name:'Hiền',role:'customer'}],
  settlements: [{
    id:'scope:p1:2026-09-22:mn', partner_id:'p1', business_date:'2026-09-22', region:'mn',
    scope_status:'complete_unverified', comparison_status:'unverified', engine_version:'engine-test',
    config_snapshot:{version:3,effective_from_date:'2026-09-01',total_percent:'100'},
    lottery_result_snapshot:{fingerprint:'kq-v1',verification_status:'verified',stations:[{code:'tg',prizes:{G8:['75']}}]},
    settlement_result:{total_xac:288,total_qua_co:218.88,total_payout:4650,refund_amount:0,final_net:-4431.12},
    category_rows:[{code:'DAT',xac:72,qua_co:54.72,hit_units:4,payout:3000},{code:'DAX',xac:216,qua_co:164.16,hit_units:3,payout:1650}],
    message_ids:['m1','m2'],
    message_breakdown:[
      {message_id:'m1',category_rows:[{code:'DAT',xac:72,qua_co:54.72,hit_units:4,payout:3000}]},
      {message_id:'m2',category_rows:[{code:'DAX',xac:216,qua_co:164.16,hit_units:3,payout:1650}]}
    ]
  }],
  messages:[
    {id:'m1',raw_text:'tg 75 32 da 1n',region:'mn',status:'settled_unverified',canonical_version:'v1',canonical_payload:{region:'mn',legs:[{code:'DAT',values:['75','32'],stake:'1'}]}},
    {id:'m2',raw_text:'2d 75 42 dx 1n',region:'mn',status:'settled_unverified',canonical_version:'v1',canonical_payload:{region:'mn',legs:[{code:'DAX',values:['75','42'],stake:'1'}]}}
  ],
  shadow_events:[]
};
const store = {
  STORES:{partners:'partners',settlements:'settlements',messages:'messages',shadowEvents:'shadow_events'},
  async get(name,id){return (state[name]||[]).find(x=>x.id===id)||null;},
  async getAll(name){return (state[name]||[]).map(x=>JSON.parse(JSON.stringify(x)));},
  async saveSettlement(row){const i=state.settlements.findIndex(x=>x.id===row.id); if(i>=0)state.settlements[i]={...row};else state.settlements.push({...row}); return {...row};},
  async saveShadowEvent(row){
    const event={id:`ev${state.shadow_events.length+1}`,observed_at:`2026-10-06T12:00:0${state.shadow_events.length}Z`,...JSON.parse(JSON.stringify(row))};
    state.shadow_events.push(event);
    return {event,changed:true,previous:state.shadow_events.length>1?state.shadow_events[state.shadow_events.length-2]:null};
  },
  async listShadowEvents(scope){
    return state.shadow_events.filter(x=>x.partner_id===scope.partner_id&&x.business_date===scope.business_date&&x.region===scope.region).map(x=>JSON.parse(JSON.stringify(x)));
  }
};
const ctx={console,globalThis:null,KTS_SETTLEMENT_STORE:store};ctx.globalThis=ctx;vm.createContext(ctx);
for(const file of ['app/settlement-shadow.js','app/settlement-shadow-runtime.js']) vm.runInContext(fs.readFileSync(file,'utf8'),ctx,{filename:file});

(async()=>{
  const R=ctx.KTS_SETTLEMENT_SHADOW_RUNTIME;
  assert.strictEqual(R.version,'settlement-shadow-runtime-v5-replay-role');
  const saved=await R.compareAndSave({partner_id:'p1',business_date:'2026-09-22',region:'mn',trigger:'MANUAL_COMPARE',reason:'operator:test',reference_snapshot:{totals:{xac:288,qua_co:218.88,payout:4650,final:-4431.12},categories:[{code:'DAT',xac:72,qua_co:55.72,hit_units:4,payout:3000},{code:'DAX',xac:216,qua_co:164.16,hit_units:3,payout:1650}]}});
  assert.strictEqual(saved.comparison.status,'MISMATCH');
  assert.strictEqual(saved.comparison.safe_to_promote,false);
  assert.strictEqual(state.settlements[0].comparison_status,'MISMATCH');
  assert.strictEqual(state.shadow_events.length,1);
  assert.strictEqual(state.shadow_events[0].trigger,'MANUAL_COMPARE');
  assert.strictEqual(state.shadow_events[0].reason,'operator:test');
  assert.strictEqual(state.shadow_events[0].local_snapshot.partner_role,'customer');
  assert.strictEqual(state.shadow_events[0].local_snapshot.engine_version,'engine-test');
  assert.strictEqual(state.shadow_events[0].local_snapshot.config_version,3);
  assert.strictEqual(state.shadow_events[0].local_snapshot.config_snapshot.total_percent,'100');
  assert.strictEqual(state.shadow_events[0].local_snapshot.result_fingerprint,'kq-v1');
  assert.strictEqual(state.shadow_events[0].local_snapshot.lottery_result_snapshot.stations[0].code,'tg');
  assert.strictEqual(state.shadow_events[0].local_snapshot.messages.length,2);
  assert.strictEqual(state.shadow_events[0].local_snapshot.messages[0].raw_text,'tg 75 32 da 1n');
  assert.strictEqual(state.shadow_events[0].local_snapshot.messages[0].canonical_payload.legs[0].code,'DAT');
  assert.strictEqual(state.shadow_events[0].comparison.status,'MISMATCH');

  const loaded=await R.getComparison({partner_id:'p1',business_date:'2026-09-22',region:'mn'});
  assert.strictEqual(loaded.comparison.status,'MISMATCH');

  const diagnosed=await R.getDiagnostics({partner_id:'p1',business_date:'2026-09-22',region:'mn'});
  assert.strictEqual(diagnosed.diagnostics.category_issues.length,1);
  assert.strictEqual(diagnosed.diagnostics.category_issues[0].code,'DAT');
  assert.strictEqual(diagnosed.diagnostics.category_issues[0].messages.length,1);
  assert.strictEqual(diagnosed.diagnostics.category_issues[0].messages[0].id,'m1');
  assert.strictEqual(diagnosed.diagnostics.category_issues[0].messages[0].raw_text,'tg 75 32 da 1n');

  const replay1=await R.getReplayCase({partner_id:'p1',business_date:'2026-09-22',region:'mn'});
  assert.strictEqual(replay1.format,'kts-shadow-replay-case-v1');
  assert.strictEqual(replay1.scope.scope_id,'scope:p1:2026-09-22:mn');
  assert.strictEqual(replay1.partner_role,'customer');
  assert.strictEqual(replay1.messages.length,2);
  assert.strictEqual(replay1.config_snapshot.version,3);
  assert.strictEqual(replay1.lottery_result_snapshot.fingerprint,'kq-v1');
  assert.strictEqual(replay1.expected_comparison_status,'MISMATCH');

  state.settlements[0].settlement_result={...state.settlements[0].settlement_result,total_qua_co:219.88,final_net:-4430.12};
  state.settlements[0].result_snapshot={...state.settlements[0].settlement_result};
  state.settlements[0].lottery_result_snapshot={fingerprint:'kq-v2',verification_status:'verified',stations:[{code:'tg',prizes:{G8:['76']}}]};
  const second=await R.compareAndSave({partner_id:'p1',business_date:'2026-09-22',region:'mn',trigger:'AUTO_RECALCULATEDATEREGION',reason:'shadow-guard:recalculateDateRegion',reference_snapshot:saved.reference});
  assert.strictEqual(second.comparison.status,'MISMATCH');
  assert.strictEqual(state.shadow_events.length,2);
  assert.strictEqual(state.shadow_events[1].trigger,'AUTO_RECALCULATEDATEREGION');
  assert.strictEqual(state.shadow_events[1].local_snapshot.result_fingerprint,'kq-v2');
  const history=await R.getHistory({partner_id:'p1',business_date:'2026-09-22',region:'mn'});
  assert.strictEqual(history.length,2);
  assert.strictEqual(history[0].id,'ev1');
  assert.strictEqual(history[1].id,'ev2');
  const firstReplay=await R.getReplayCase({partner_id:'p1',business_date:'2026-09-22',region:'mn',event_id:'ev1'});
  assert.strictEqual(firstReplay.lottery_result_snapshot.fingerprint,'kq-v1');
  assert.strictEqual(firstReplay.partner_role,'customer');
  const latestReplay=await R.getReplayCase({partner_id:'p1',business_date:'2026-09-22',region:'mn'});
  assert.strictEqual(latestReplay.lottery_result_snapshot.fingerprint,'kq-v2');

  state.settlements[0].scope_status='blocked';
  await assert.rejects(()=>R.compareAndSave({partner_id:'p1',business_date:'2026-09-22',region:'mn',reference_snapshot:{totals:{xac:288,qua_co:218.88,payout:4650,final:-4431.12}}}),/SETTLEMENT_SCOPE_BLOCKED/);
  assert.strictEqual(state.shadow_events.length,2,'blocked scope must not create false comparison evidence');
  console.log('settlement shadow runtime tests PASS');
})().catch(err=>{console.error(err);process.exit(1);});
