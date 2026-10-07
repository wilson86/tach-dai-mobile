'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');

function result(){
  return {id:'2026-09-22:mb',business_date:'2026-09-22',region:'mb',complete:true,stations:[{code:'mb',prizes:{
    DB:['31922'],G1:['12361'],G2:['10001','20002'],G3:['30003','40004','50005','60006','70007','80008'],
    G4:['90009','11110','22211','33312'],G5:['44592','55514','66615','77716','88817','99918'],G6:['192','319','561'],G7:['92','20','30','40']
  }}]};
}
function cfg(partner,commission,win){
  const p=()=>({commission:String(commission),win:String(win)});
  return {partner_id:partner,version:1,effective_from_date:'2026-01-01',commission_type:'ratio',total_percent:'100',refund_percent:'0',
    mb_xien_234:false,tinh_ui:false,region_terms:{mb:{total_percent:'100',refund_percent:'0'}},
    region_pricing:{mb:{'2CB':p(),'2CD':p(),'2CB8':p(),DAT:p(),'3CB':p(),'3CB7':p(),'3CDD':p(),'4C':p()}}};
}
const configs={a:cfg('a','0.50','1'),b:cfg('b','0.80','10')};
const state={
 messages:[
   {id:'ma',partner_id:'a',business_date:'2026-09-22',region:'mb',raw_text:'92 b 1n',status:'parsed_waiting_result',canonical_payload:{region:'mb',legs:[{code:'2CB',values:['92'],stake:'1'}]}},
   {id:'mb',partner_id:'b',business_date:'2026-09-22',region:'mb',raw_text:'92 b 1n',status:'parsed_waiting_result',canonical_payload:{region:'mb',legs:[{code:'2CB',values:['92'],stake:'1'}]}}
 ],settlements:[],results:[result()],partners:[{id:'a',name:'A',role:'customer'},{id:'b',name:'B',role:'customer'}]
};
const store={
 STORES:{messages:'messages',settlements:'settlements',results:'results',partners:'partners'},
 async getAll(n){return (state[n]||[]).map(x=>({...x}));},
 async get(n,k){return (state[n]||[]).find(x=>x.id===k)||null;},
 async resolveConfigForDate(partner){return JSON.parse(JSON.stringify(configs[partner]));},
 async saveSettlement(row){const i=state.settlements.findIndex(x=>x.id===row.id);if(i>=0)state.settlements[i]={...row};else state.settlements.push({...row});return {...row};},
 async saveMessage(row){return {...row};}
};
const ctx={console,globalThis:null,KTS_SETTLEMENT_STORE:store};ctx.globalThis=ctx;vm.createContext(ctx);
for(const file of ['app/settlement-engine.js','app/settlement-mb-rules.js','app/settlement-evaluator.js','app/settlement-feature-gates.js','app/settlement-runtime.js','app/settlement-pipeline.js'])
  vm.runInContext(fs.readFileSync(file,'utf8'),ctx,{filename:file});

(async()=>{
 const P=ctx.KTS_SETTLEMENT_PIPELINE;
 const a=await P.settleScope({partner_id:'a',business_date:'2026-09-22',region:'mb'});
 const b=await P.settleScope({partner_id:'b',business_date:'2026-09-22',region:'mb'});
 assert.deepStrictEqual(Array.from(a.settlement.message_ids),['ma']);
 assert.deepStrictEqual(Array.from(b.settlement.message_ids),['mb']);
 assert.strictEqual(a.settlement.config_snapshot.partner_id,'a');
 assert.strictEqual(b.settlement.config_snapshot.partner_id,'b');
 assert.notStrictEqual(a.settlement.result_snapshot.total_qua_co,b.settlement.result_snapshot.total_qua_co);
 assert.notStrictEqual(a.settlement.result_snapshot.total_payout,b.settlement.result_snapshot.total_payout);
 assert.strictEqual(state.settlements.length,2);
 assert(state.settlements.some(x=>x.id==='scope:a:2026-09-22:mb'));
 assert(state.settlements.some(x=>x.id==='scope:b:2026-09-22:mb'));
 console.log('settlement-partner-config-isolation-tests: PASS');
})().catch(e=>{console.error(e);process.exit(1);});
