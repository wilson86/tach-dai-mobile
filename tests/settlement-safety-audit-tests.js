'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');

function result(overrides={}) {
  return Object.assign({
    id:'2026-09-22:mb',business_date:'2026-09-22',region:'mb',complete:true,
    verification_status:'verified',verified:true,
    stations:[{code:'mb',prizes:{
      DB:['31922'],G1:['12361'],G2:['10001','20002'],G3:['30003','40004','50005','60006','70007','80008'],
      G4:['90009','11110','22211','33312'],G5:['44592','55514','66615','77716','88817','99918'],G6:['192','319','561'],G7:['92','20','30','40']
    }}]
  }, overrides);
}
function cfg(partner='a'){
  const p=()=>({commission:'0.76',win:'1'});
  return {partner_id:partner,version:1,effective_from_date:'2026-01-01',commission_type:'ratio',
    region_terms:{mb:{total_percent:'100',refund_percent:'0'}},mb_xien_234:false,tinh_ui:false,
    region_pricing:{mb:{'2CB':p(),'2CD':p(),'2CB8':p(),DAT:p(),'3CB':p(),'3CB7':p(),'3CDD':p(),'4C':p()}}};
}
function makeStore(messages=[], options={}) {
  const state={messages:messages.map(x=>({...x})),settlements:[],results:[result()],partners:[{id:'a',role:'customer'},{id:'b',role:'customer'}]};
  const STORES={messages:'messages',settlements:'settlements',results:'results',partners:'partners'};
  return {
    STORES,state,
    async getAll(n){return (state[n]||[]).map(x=>({...x}));},
    async get(n,k){return (state[n]||[]).find(x=>x.id===k)||null;},
    async resolveConfigForDate(partner,date){
      if(options.noConfig) throw new Error('NO_CONFIG_FOR_BUSINESS_DATE');
      return cfg(options.configPartner || partner);
    },
    async saveSettlement(row){const i=state.settlements.findIndex(x=>x.id===row.id);if(i>=0)state.settlements[i]={...row};else state.settlements.push({...row});return {...row};},
    async saveMessage(row){const v={...row,id:row.id||'saved-'+(state.messages.length+1)};const i=state.messages.findIndex(x=>x.id===v.id);if(i>=0)state.messages[i]=v;else state.messages.push(v);return {...v};}
  };
}
function load(store){
  const ctx={console,globalThis:null,KTS_SETTLEMENT_STORE:store};ctx.globalThis=ctx;vm.createContext(ctx);
  for(const f of ['app/settlement-engine.js','app/settlement-mb-rules.js','app/settlement-evaluator.js','app/settlement-feature-gates.js','app/settlement-runtime.js','app/settlement-pipeline.js'])
    vm.runInContext(fs.readFileSync(f,'utf8'),ctx,{filename:f});
  return ctx.KTS_SETTLEMENT_PIPELINE;
}
const msg=(id,partner='a')=>({id,partner_id:partner,business_date:'2026-09-22',region:'mb',raw_text:'92 b 1n',status:'parsed_waiting_result',canonical_payload:{region:'mb',legs:[{code:'2CB',values:['92'],stake:'1'}]}});

(async()=>{
  // Cross-partner message injection must never settle under another partner's price table.
  {
    const s=makeStore([msg('mb','b')]); const P=load(s);
    const out=await P.settleScope({partner_id:'a',business_date:'2026-09-22',region:'mb',messages:[msg('mb','b')],result_snapshot:result()});
    assert.strictEqual(out.status,'blocked'); assert.match(out.reason,/MESSAGE_SCOPE_MISMATCH/);
    assert.strictEqual(out.settlement.result_snapshot.total_xac,0);
  }

  // A resolved config with the wrong owner is also fail-closed.
  {
    const s=makeStore([msg('ma')],{configPartner:'b'}); const P=load(s);
    const out=await P.settleScope({partner_id:'a',business_date:'2026-09-22',region:'mb',result_snapshot:result()});
    assert.strictEqual(out.status,'blocked'); assert.strictEqual(out.reason,'CONFIG_PARTNER_MISMATCH');
  }

  // Conflicting sources are visible/auditable but must produce zero settlement money.
  {
    const s=makeStore([msg('ma')]); const P=load(s);
    const out=await P.settleScope({partner_id:'a',business_date:'2026-09-22',region:'mb',result_snapshot:result({verification_status:'conflict',verified:false,verification_reason:'KQXS_SOURCE_CONFLICT'})});
    assert.strictEqual(out.status,'blocked'); assert.strictEqual(out.reason,'KQXS_SOURCE_CONFLICT');
    assert.strictEqual(out.settlement.result_snapshot.total_xac,0);
  }

  // A result snapshot from another date/region cannot be reused by mistake.
  {
    const s=makeStore([msg('ma')]); const P=load(s);
    const out=await P.settleScope({partner_id:'a',business_date:'2026-09-22',region:'mb',result_snapshot:result({business_date:'2026-09-21'})});
    assert.strictEqual(out.status,'blocked'); assert.strictEqual(out.reason,'KQXS_SCOPE_MISMATCH');
  }

  // Missing pricing config is checked before any parser/network call and saves nothing.
  {
    const s=makeStore([],{noConfig:true}); const P=load(s); let parserCalls=0;
    await assert.rejects(()=>P.parseAndSaveMessage({
      partner_id:'a',business_date:'2026-09-22',region:'mb',raw_text:'92 b 1n',
      parser_provider:{fetchCanonical:async()=>{parserCalls++;return {region:'mb',legs:[]};}}
    }),/NO_CONFIG_FOR_BUSINESS_DATE/);
    assert.strictEqual(parserCalls,0); assert.strictEqual(s.state.messages.length,0);
  }

  // Same raw text remains legal after the previous submission completes; dedupe is only in-flight UI safety.
  const ui=fs.readFileSync('app/settlement-ui.js','utf8');
  assert(ui.includes('if (savingMessage)'));
  assert(ui.includes('button.disabled = true'));
  assert(ui.includes('Intentionally retyping/pasting the same line after this completes still'));

  console.log('settlement-safety-audit-tests: PASS');
})().catch(e=>{console.error(e);process.exit(1);});
