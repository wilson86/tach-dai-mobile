'use strict';
const fs=require('fs');const vm=require('vm');const assert=require('assert');
const H='a'.repeat(64);
function message(id='m1',opts={}){return {id,partner_id:'p1',business_date:'2026-09-22',region:opts.region||'mn',status:opts.status||'active',parser_error:opts.parser_error||null,canonical_payload:opts.noCanonical?null:{parser_identity:opts.noIdentity?null:{identity_sha256:opts.hash||H},legs:[{code:'2CB'}]}};}
function settlement(opts={}){return {id:'scope:p1:2026-09-22:mn',partner_id:'p1',business_date:'2026-09-22',region:'mn',scope_status:'complete',lottery_result_snapshot:{verification_status:opts.verify||'verified',strict_evidence_valid:opts.evidenceValid!==false},config_snapshot:{tinh_ui:opts.ui===true},category_rows:opts.ui?[{code:'UI'}]:[{code:'2CB'}]};}
function observationFor(settlements,options){const scopes=(settlements||[]).map(s=>({partner_id:s.partner_id,business_date:s.business_date,region:s.region,result_verification_status:s.lottery_result_snapshot&&s.lottery_result_snapshot.verification_status||'unverified',result_verification_evidence_valid:Boolean(s.lottery_result_snapshot&&s.lottery_result_snapshot.strict_evidence_valid),result_verification_reason:s.lottery_result_snapshot&&s.lottery_result_snapshot.strict_evidence_valid?'': 'KQXS_STRICT_EVIDENCE_MISSING'}));const cand=options.candidate_summary||{pending:0};const reg=options.regression_summary||{total:0,failed:0};const duration=Number(options.required_observation_days||0)>0;const ready=scopes.length>0&&duration&&cand.pending===0&&reg.failed===0;const blockers=[];if(!duration)blockers.push('OBSERVATION_DURATION_NOT_CONFIGURED');if(cand.pending)blockers.push('REGRESSION_CANDIDATE_PENDING:'+cand.pending);return {promotion_ready:ready,exact_days:ready?1:0,counts:{total:scopes.length,exact:ready?scopes.length:0,missing_scopes:0},scopes,blockers};}
function makeCtx(opts={}){
  const settlements=opts.settlements||[settlement()];const messages=opts.messages||[message()];const candidatesRows=opts.candidates||[];const reg=opts.regression||{total:1,passed:1,failed:0,pass:true,results:[]};
  const store={STORES:{settlements:'settlements',messages:'messages'},async getAll(name){return JSON.parse(JSON.stringify(name==='settlements'?settlements:messages));}};
  const observation={buildObservation:(s,o)=>observationFor(s,o)};
  const regression={async runPinnedCases(){return JSON.parse(JSON.stringify(reg));}};
  const candidates={STATES:{PENDING:'pending'},async listCandidates(){return JSON.parse(JSON.stringify(candidatesRows));}};
  const readiness={async loadLocalQueue(){return (opts.readinessRows||[]).map(x=>JSON.parse(JSON.stringify(x)));},async checkParserRows(rows){return rows;},readinessReport(rows){const ready=rows.filter(x=>x.assessment&&x.assessment.ready_for_human_confirmation).length;return {format:'r',summary:{total:rows.length,ready,blocked:rows.length-ready,all_ready:rows.length>0&&ready===rows.length},items:rows};}};
  const parserProvider={async fetchIdentity(){if(opts.backendError)throw new Error(opts.backendError);const hash=opts.backendHash||H;return {api_version:'kts-settlement-api-v1',identity_contract:'kts-parser-identity-v1',identities:{mb:{identity_sha256:hash},mn_mt:{identity_sha256:hash}}};}};
  const ctx={console,globalThis:null,KTS_SETTLEMENT_STORE:store,KTS_SETTLEMENT_OBSERVATION:observation,KTS_SETTLEMENT_REGRESSION_CASES:regression,KTS_SETTLEMENT_REGRESSION_CANDIDATES:candidates,KTS_SETTLEMENT_REPAIR_READINESS:readiness,KTS_SETTLEMENT_PARSER_PROVIDER:parserProvider};ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync('app/settlement-qualification-dashboard.js','utf8'),ctx,{filename:'settlement-qualification-dashboard.js'});return ctx.KTS_SETTLEMENT_QUALIFICATION;
}
(async()=>{
  const Q=makeCtx();assert.strictEqual(Q.version,'settlement-qualification-dashboard-v4-strict-kqxs-evidence');
  let kg=Q.kqxsVerificationGate({scopes:[{partner_id:'p',business_date:'2026-09-22',region:'mn',result_verification_status:'verified',result_verification_evidence_valid:true}]});assert.strictEqual(kg.met,true);assert.strictEqual(kg.verified,1);
  kg=Q.kqxsVerificationGate({scopes:[{partner_id:'p',business_date:'2026-09-22',region:'mn',result_verification_status:'verified',result_verification_evidence_valid:false,result_verification_reason:'KQXS_PRIZE_DATA_INCOMPLETE'}]});assert.strictEqual(kg.met,false);assert.strictEqual(kg.unverified,1);assert.strictEqual(kg.bad_scopes[0].reason,'KQXS_PRIZE_DATA_INCOMPLETE');
  kg=Q.kqxsVerificationGate({scopes:[{partner_id:'p',business_date:'2026-09-22',region:'mn',result_verification_status:'conflict',result_verification_evidence_valid:false}]});assert.strictEqual(kg.met,false);assert.strictEqual(kg.conflict,1);
  let pg=Q.parserProvenanceGate([message()],{from_date:'2026-09-22',to_date:'2026-09-22'});assert.strictEqual(pg.met,true);assert.strictEqual(pg.known,1);
  pg=Q.parserProvenanceGate([message('m2',{noIdentity:true})],{from_date:'2026-09-22',to_date:'2026-09-22'});assert.strictEqual(pg.met,false);assert.strictEqual(pg.unknown,1);
  let bg=await Q.parserBackendGate([message()],{from_date:'2026-09-22',to_date:'2026-09-22'},{fetchIdentity:async()=>({identities:{mb:{identity_sha256:H},mn_mt:{identity_sha256:H}}})});assert.strictEqual(bg.met,true);assert.strictEqual(bg.matched,1);
  bg=await Q.parserBackendGate([message()],{from_date:'2026-09-22',to_date:'2026-09-22'},{fetchIdentity:async()=>({identities:{mb:{identity_sha256:'b'.repeat(64)},mn_mt:{identity_sha256:'b'.repeat(64)}}})});assert.strictEqual(bg.met,false);assert.strictEqual(bg.mismatched,1);
  let fg=Q.unverifiedFeatureGate([settlement()],{scopes:[{partner_id:'p1',business_date:'2026-09-22',region:'mn'}]});assert.strictEqual(fg.met,true);
  fg=Q.unverifiedFeatureGate([settlement({ui:true})],{scopes:[{partner_id:'p1',business_date:'2026-09-22',region:'mn'}]});assert.strictEqual(fg.met,false);assert.strictEqual(fg.unsafe_count,1);

  const good=await makeCtx().runQualification({from_date:'2026-09-22',to_date:'2026-09-22',required_observation_days:1,check_parser:true});
  assert.strictEqual(good.format,'kts-final-qualification-v2-live-parser');assert.strictEqual(good.qualification_state,'READY_FOR_PRODUCTION_REVIEW');assert.strictEqual(good.ready_for_production_review,true);assert.strictEqual(good.parser_backend.met,true);assert.strictEqual(good.production_enabled,false);assert.strictEqual(good.merge_authorized,false);assert.deepStrictEqual(Array.from(good.blockers),[]);

  const noReg=await makeCtx({regression:{total:0,passed:0,failed:0,pass:false,results:[]}}).runQualification({from_date:'2026-09-22',to_date:'2026-09-22',required_observation_days:1});
  assert.strictEqual(noReg.ready_for_production_review,false);assert(noReg.blockers.includes('NO_PINNED_REGRESSION_CASES'));

  const badKqxs=await makeCtx({settlements:[settlement({verify:'unverified'})]}).runQualification({from_date:'2026-09-22',to_date:'2026-09-22',required_observation_days:1});
  assert.strictEqual(badKqxs.ready_for_production_review,false);assert(badKqxs.blockers.some(x=>x.startsWith('KQXS_NOT_FULLY_VERIFIED:')));

  const fakeVerifiedNoEvidence=await makeCtx({settlements:[settlement({verify:'verified',evidenceValid:false})]}).runQualification({from_date:'2026-09-22',to_date:'2026-09-22',required_observation_days:1});
  assert.strictEqual(fakeVerifiedNoEvidence.ready_for_production_review,false,'verified label without strict evidence must not qualify');
  assert(fakeVerifiedNoEvidence.blockers.some(x=>x.startsWith('KQXS_NOT_FULLY_VERIFIED:')));

  const badParser=await makeCtx({messages:[message('m3',{noIdentity:true})]}).runQualification({from_date:'2026-09-22',to_date:'2026-09-22',required_observation_days:1});
  assert.strictEqual(badParser.ready_for_production_review,false);assert(badParser.blockers.some(x=>x.startsWith('PARSER_PROVENANCE_INCOMPLETE:')));

  const backendMismatch=await makeCtx({backendHash:'b'.repeat(64)}).runQualification({from_date:'2026-09-22',to_date:'2026-09-22',required_observation_days:1});
  assert.strictEqual(backendMismatch.ready_for_production_review,false);assert(backendMismatch.blockers.includes('PARSER_BACKEND_IDENTITY_MISMATCH:0/1'));

  const backendDown=await makeCtx({backendError:'BACKEND_DOWN'}).runQualification({from_date:'2026-09-22',to_date:'2026-09-22',required_observation_days:1});
  assert.strictEqual(backendDown.ready_for_production_review,false);assert(backendDown.blockers.includes('PARSER_BACKEND_IDENTITY_UNAVAILABLE'));assert.strictEqual(backendDown.parser_backend.unreachable,true);

  const readyRow={candidate:{id:'c1'},assessment:{ready_for_human_confirmation:true}};
  const pending=await makeCtx({candidates:[{id:'c1',state:'pending'}],readinessRows:[readyRow]}).runQualification({from_date:'2026-09-22',to_date:'2026-09-22',required_observation_days:1});
  assert.strictEqual(pending.ready_for_production_review,false);assert(pending.blockers.includes('REGRESSION_CANDIDATE_PENDING:1'));assert(pending.blockers.includes('OPERATOR_CONFIRMATION_PENDING:1'));

  const ui=await makeCtx({settlements:[settlement({ui:true})]}).runQualification({from_date:'2026-09-22',to_date:'2026-09-22',required_observation_days:1});
  assert.strictEqual(ui.ready_for_production_review,false);assert(ui.blockers.includes('UNVERIFIED_UI_FEATURE_ACTIVE:1'));

  const noDuration=await makeCtx().runQualification({from_date:'2026-09-22',to_date:'2026-09-22',required_observation_days:''});
  assert.strictEqual(noDuration.ready_for_production_review,false);assert(noDuration.blockers.includes('OBSERVATION_DURATION_NOT_CONFIGURED'));
  console.log('settlement-qualification-dashboard-tests: PASS');
})().catch(e=>{console.error(e);process.exit(1);});
