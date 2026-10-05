'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const state = {
  settlements: [{
    id:'scope:p1:2026-09-22:mn', partner_id:'p1', business_date:'2026-09-22', region:'mn',
    scope_status:'complete_unverified', comparison_status:'unverified',
    settlement_result:{total_xac:288,total_qua_co:218.88,total_payout:4650,refund_amount:0,final_net:-4431.12},
    category_rows:[{code:'DAT',xac:72,qua_co:54.72,hit_units:4,payout:3000},{code:'DAX',xac:216,qua_co:164.16,hit_units:3,payout:1650}]
  }]
};
const store = {
  STORES:{settlements:'settlements'},
  async get(name,id){return (state[name]||[]).find(x=>x.id===id)||null;},
  async saveSettlement(row){const i=state.settlements.findIndex(x=>x.id===row.id); if(i>=0)state.settlements[i]={...row};else state.settlements.push({...row}); return {...row};}
};
const ctx={console,globalThis:null,KTS_SETTLEMENT_STORE:store};ctx.globalThis=ctx;vm.createContext(ctx);
for(const file of ['app/settlement-shadow.js','app/settlement-shadow-runtime.js']) vm.runInContext(fs.readFileSync(file,'utf8'),ctx,{filename:file});

(async()=>{
  const R=ctx.KTS_SETTLEMENT_SHADOW_RUNTIME;
  const saved=await R.compareAndSave({partner_id:'p1',business_date:'2026-09-22',region:'mn',reference_snapshot:{totals:{xac:288,qua_co:218.88,payout:4650,final:-4431.12},categories:[{code:'DAT',xac:72,qua_co:54.72,hit_units:4,payout:3000},{code:'DAX',xac:216,qua_co:164.16,hit_units:3,payout:1650}]}});
  assert.strictEqual(saved.comparison.status,'MATCH_EXACT');
  assert.strictEqual(saved.comparison.safe_to_promote,true);
  assert.strictEqual(state.settlements[0].comparison_status,'MATCH_EXACT');
  assert.strictEqual(state.settlements[0].reference_app_snapshot.comparison.safe_to_promote,true);

  const loaded=await R.getComparison({partner_id:'p1',business_date:'2026-09-22',region:'mn'});
  assert.strictEqual(loaded.comparison.status,'MATCH_EXACT');

  state.settlements[0].scope_status='blocked';
  await assert.rejects(()=>R.compareAndSave({partner_id:'p1',business_date:'2026-09-22',region:'mn',reference_snapshot:{totals:{xac:288,qua_co:218.88,payout:4650,final:-4431.12}}}),/SETTLEMENT_SCOPE_BLOCKED/);
  console.log('settlement shadow runtime tests PASS');
})().catch(err=>{console.error(err);process.exit(1);});
