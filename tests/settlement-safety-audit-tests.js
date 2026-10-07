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

  // Previously settled money must be zeroed immediately if KQXS later becomes conflict.
  {
    const store=makeStore([msg('ma')]); const P=load(store);
    const first=await P.settleScope({partner_id:'a',business_date:'2026-09-22',region:'mb',result_snapshot:result()});
    assert.notStrictEqual(first.settlement.result_snapshot.total_xac,0,'precondition: scope must have settled money before conflict');
    const conflicted=await P.settleScope({
      partner_id:'a',business_date:'2026-09-22',region:'mb',
      result_snapshot:result({verification_status:'conflict',verified:false,verification_reason:'KQXS_SOURCE_CONFLICT'})
    });
    assert.strictEqual(conflicted.status,'blocked');
    assert.strictEqual(conflicted.reason,'KQXS_SOURCE_CONFLICT');
    assert.strictEqual(store.state.settlements.length,1,'conflict must replace the deterministic scope settlement');
    assert.strictEqual(store.state.settlements[0].scope_status,'blocked');
    assert.strictEqual(store.state.settlements[0].result_snapshot.total_xac,0,'stale settled money must be zeroed');
    assert.strictEqual(store.state.settlements[0].result_snapshot.total_qua_co,0);
    assert.strictEqual(store.state.settlements[0].result_snapshot.total_payout,0);
    assert.strictEqual(store.state.settlements[0].result_snapshot.final_net,0);
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
  assert(ui.includes('const saveScope = Object.freeze'), 'save must freeze partner/date/region at click time');
  const saveMessageStart = ui.indexOf('async function saveMessage()');
  const earlyMessageLock = ui.indexOf('savingMessage = true;', saveMessageStart);
  const configPreflight = ui.indexOf('await store.resolveConfigForDate', saveMessageStart);
  assert(earlyMessageLock > saveMessageStart && configPreflight > earlyMessageLock, 'message save lock must be claimed before config preflight');
  assert(ui.includes('const saveDraftSignature = configEditorSignature()'), 'config save must snapshot the editor before async work');
  assert(ui.includes('tránh tin dùng nhầm bảng giá'), 'config save must refuse while a message is being saved');
  assert(ui.includes('tin dùng đúng bảng giá'), 'message save must refuse while config is being saved');
  assert(ui.includes("cachedTemplate = pendingConfigTemplate"), 'nearest-config apply must scope cached template to the selected partner');
  assert(ui.includes('const sameMessageDraft = sameMessageScope'), 'nearest-config apply must snapshot message scope/draft before auto-save');
  assert(ui.includes('Tin/phạm vi hiện tại đã đổi nên hệ thống không tự lưu tin.'), 'changed draft/scope must suppress automatic message save');
  assert(ui.includes('configEditorSignature() === saveDraftSignature'), 'late config completion must not clear a changed editor');
  assert(ui.includes('business_date: saveScope.business_date'));
  assert(ui.includes('region: saveScope.region'));
  assert(ui.includes('const editorStillMatches = sameSaveScope()'), 'late parser response must not clear a new draft/scope');
  assert(ui.includes("Bạn đã đổi phạm vi hoặc ô nhập; nội dung hiện tại được giữ nguyên."));

  const releaseStart=ui.indexOf('const releaseMessageSave = () => {');
  assert(releaseStart>=0,'message save release helper required');
  const releaseEnd=ui.indexOf('};',releaseStart);
  const releaseBody=ui.slice(releaseStart,releaseEnd);
  assert(releaseBody.includes('savingMessage = false'),'release helper must clear save lock');
  assert(releaseBody.includes('button.disabled = false'),'release helper must restore save button');
  assert(!releaseBody.includes('releaseMessageSave();'),'release helper must not recurse');
  
  assert(ui.includes("let pendingConfigBusinessDate = ''"),'pending config cache must track target date');
  assert(ui.includes('pendingConfigBusinessDate === businessDate'),'cached config template must match current message date');

  assert(ui.includes('let configLoadEpoch = 0'),'config loader must have stale-request epoch guard');
  assert(ui.includes('const epoch = ++configLoadEpoch'));
  assert(ui.includes('epoch === configLoadEpoch'));
  assert(ui.includes("currentPartnerId() === partnerId"));
  assert(ui.includes("String($('effectiveDate').value || today()) === date"));
  assert(ui.includes('Đối tác/ngày đã đổi trong lúc chuẩn bị thiết lập'));
  assert(ui.includes('Đối tác/ngày/miền đã đổi. Không áp dụng bảng giá của phạm vi cũ.'));

  assert(ui.includes("if (sameSaveScope()) setMissingConfigAction(false, '', null, businessDate)"));
  assert(ui.includes('Đối tác/ngày/miền đã đổi trong lúc kiểm tra bảng giá. Tin cũ chưa được lưu.'));

  const pipelineSource=fs.readFileSync('app/settlement-pipeline.js','utf8');
  assert(pipelineSource.includes('const scopeSettlementQueues = new Map()'));
  assert(pipelineSource.includes('function settleScope(input)'));
  assert(pipelineSource.includes('scopeSettlementQueues.set(key, tracked)'));

  console.log('settlement-safety-audit-tests: PASS');
})().catch(e=>{console.error(e);process.exit(1);});
