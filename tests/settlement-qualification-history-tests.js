'use strict';
const fs=require('fs');const vm=require('vm');const assert=require('assert');const {webcrypto}=require('crypto');const {TextEncoder}=require('util');
function stable(value){if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(stable).join(',')+']';return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';}
const H64='a'.repeat(64),H64B='b'.repeat(64);
function liveIdentity(hash=H64){return {api_version:'kts-settlement-api-v1',identity_contract:'kts-parser-identity-v1',identities:{mb:{parser_version:'mb',identity_sha256:hash,parser_source_sha256:null,grammar_sha256:null,business_engine_sha256:null},mn_mt:{parser_version:'mnmt',identity_sha256:hash,parser_source_sha256:null,grammar_sha256:null,business_engine_sha256:null}}};}
function makeCtx(opts={}){
  const store={stableStringify:stable,STORES:{metadata:'metadata',messages:'messages',settlements:'settlements',results:'results',configs:'configs'},async getAll(){return[];},async get(){return null;},openDb(){throw new Error('not used');}};
  const qualification={version:'q-v3',messageInWindow(){return true;}};
  const regression={version:'r-v1',async listPinnedCases(){return[];}};
  const candidates={async listCandidates(){return[];}};
  const parserProvider={version:'parser-v2',async fetchIdentity(){if(opts.backendError)throw new Error(opts.backendError);return liveIdentity(opts.backendHash||H64);}};
  const ctx={console,globalThis:null,crypto:webcrypto,TextEncoder,Uint8Array,Date,Math,JSON,KTS_SETTLEMENT_STORE:store,KTS_SETTLEMENT_QUALIFICATION:qualification,KTS_SETTLEMENT_REGRESSION_CASES:regression,KTS_SETTLEMENT_REGRESSION_CANDIDATES:candidates,KTS_SETTLEMENT_ENGINE:{version:'e-v1'},KTS_SETTLEMENT_EVALUATOR:{version:'eval-v1'},KTS_SETTLEMENT_PARSER_PROVIDER:parserProvider,KTS_SETTLEMENT_SHADOW:{version:'shadow-v1'},KTS_SETTLEMENT_OBSERVATION:{version:'obs-v1'},KTS_SETTLEMENT_REPAIR_READINESS:{version:'ready-v1'},KTS_RESULT_SERVICE:{version:'result-v1'}};ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync('app/settlement-build-identity.js','utf8'),ctx,{filename:'settlement-build-identity.js'});vm.runInContext(fs.readFileSync('app/settlement-qualification-history.js','utf8'),ctx,{filename:'settlement-qualification-history.js'});return {H:ctx.KTS_SETTLEMENT_QUALIFICATION_HISTORY,ctx};
}
(async()=>{
  const {H,ctx}=makeCtx();assert.strictEqual(H.version,'settlement-qualification-history-v3-live-parser-validity');
  assert(H.COMPONENTS.includes('parser_backend'));
  assert.strictEqual(H.validateBuildIdentity(ctx.KTS_SETTLEMENT_BUILD_IDENTITY),ctx.KTS_SETTLEMENT_BUILD_IDENTITY);
  assert.throws(()=>H.validateBuildIdentity(null),/QUALIFICATION_BUILD_IDENTITY_MISSING/);
  assert.throws(()=>H.validateBuildIdentity({version:'settlement-build-identity-v1',algorithm:'bad',critical_git_blobs:{}}),/ALGORITHM_INVALID/);
  const a=await H.sha256Hex({b:2,a:1}),b=await H.sha256Hex({a:1,b:2});assert.strictEqual(a,b);assert(/^[0-9a-f]{64}$/.test(a));
  const runtime=H.runtimeSignature();assert.strictEqual(runtime.build_identity.version,'settlement-build-identity-v1');assert(Object.keys(runtime.build_identity.critical_git_blobs).length>=15);assert.strictEqual(runtime.modules.engine,'e-v1');
  const components={};for(const n of H.COMPONENTS)components[n]='1'.repeat(64);
  const changed={...components,results:'2'.repeat(64)};
  assert.deepStrictEqual(Array.from(H.changedComponents(components,changed)),['results']);
  const qReady={qualification_state:'READY_FOR_PRODUCTION_REVIEW',ready_for_production_review:true,blockers:[],parser_backend:{met:true,live_identity:liveIdentity()}};
  const first=H.buildEvidenceEvent(qReady,{from_date:'2026-09-22',to_date:'2026-09-22',required_observation_days:'1'},components,'a'.repeat(64),[]);
  assert.strictEqual(first.ready_for_production_review,true);assert.strictEqual(first.previous_ready_event_id,null);assert.strictEqual(first.production_enabled,false);assert.strictEqual(first.merge_authorized,false);
  const blocked=H.buildEvidenceEvent({qualification_state:'BLOCKED_SHADOW_QUALIFICATION',ready_for_production_review:false,blockers:['X']},{from_date:'2026-09-22',to_date:'2026-09-22',required_observation_days:'1'},changed,'b'.repeat(64),[first]);
  assert.strictEqual(blocked.invalidates_previous_ready,true);assert.strictEqual(blocked.requalifies_after_change,false);assert.strictEqual(blocked.previous_ready_event_id,first.id);assert.deepStrictEqual(Array.from(blocked.changed_components_from_last_ready),['results']);
  const requalified=H.buildEvidenceEvent(qReady,{from_date:'2026-09-22',to_date:'2026-09-22',required_observation_days:'1'},changed,'b'.repeat(64),[first,blocked]);
  assert.strictEqual(requalified.invalidates_previous_ready,false);assert.strictEqual(requalified.requalifies_after_change,true);
  const result1=H.semanticResult({id:'r',business_date:'2026-09-22',region:'mn',fetched_at:'A',fingerprint:'same',verification_status:'verified',stations:[]});
  const result2=H.semanticResult({id:'r',business_date:'2026-09-22',region:'mn',fetched_at:'B',fingerprint:'same',verification_status:'verified',stations:[]});
  assert.deepStrictEqual(result1,result2,'refetch timestamp alone must not invalidate READY evidence');
  const core=H.qualificationCore({generated_at:'now',repair_readiness:{generated_at:'later',summary:{total:0}},ready_for_production_review:true});assert.strictEqual(core.generated_at,undefined);assert.strictEqual(core.repair_readiness.generated_at,undefined);

  const fromQ=H.parserBackendFromQualification(qReady);assert.strictEqual(fromQ.status,'available');assert.strictEqual(fromQ.identity.identities.mn_mt.identity_sha256,H64);
  const noQ=H.parserBackendFromQualification({parser_backend:{met:false,error:'DOWN'}});assert.strictEqual(noQ.status,'unavailable');
  let live=await H.currentParserBackendMaterial(ctx.KTS_SETTLEMENT_PARSER_PROVIDER);assert.strictEqual(live.status,'available');assert.strictEqual(live.identity.identities.mb.identity_sha256,H64);
  const down=makeCtx({backendError:'BACKEND_DOWN'});live=await down.H.currentParserBackendMaterial(down.ctx.KTS_SETTLEMENT_PARSER_PROVIDER);assert.strictEqual(live.status,'unavailable');assert.strictEqual(live.error,'BACKEND_DOWN');

  const currentVerdict=H.classifyReadyValidity({...first,input_fingerprint_sha256:'f'.repeat(64),component_fingerprints:components},components,'f'.repeat(64),{status:'available'});assert.strictEqual(currentVerdict.status,'READY_EVIDENCE_CURRENT');assert.strictEqual(currentVerdict.current,true);
  const drifted={...components,parser_backend:'9'.repeat(64)};const staleVerdict=H.classifyReadyValidity({...first,input_fingerprint_sha256:'f'.repeat(64),component_fingerprints:components},drifted,'e'.repeat(64),{status:'available'});assert.strictEqual(staleVerdict.status,'READY_EVIDENCE_STALE');assert(staleVerdict.changed_components.includes('parser_backend'));
  const unknownVerdict=H.classifyReadyValidity({...first,input_fingerprint_sha256:'f'.repeat(64),component_fingerprints:components},components,'f'.repeat(64),{status:'unavailable',error:'BACKEND_DOWN'});assert.strictEqual(unknownVerdict.status,'READY_EVIDENCE_UNVERIFIABLE');assert.strictEqual(unknownVerdict.current,false);assert(unknownVerdict.changed_components.includes('parser_backend'));

  console.log('settlement-qualification-history-tests: PASS');
})().catch(e=>{console.error(e);process.exit(1);});
