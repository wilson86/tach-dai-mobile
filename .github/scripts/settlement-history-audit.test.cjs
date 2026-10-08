'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const vm=require('node:vm');
const root=resolve(__dirname,'../..');
const sandbox={window:{}};
for(const name of ['settlement-store.js','settlement-qualification-dashboard.js','settlement-qualification-history.js']){
  vm.runInNewContext(readFileSync(resolve(root,'settlement-test',name),'utf8'),sandbox,{filename:name});
}
const S=sandbox.window.KTS_SETTLEMENT_STORE;
const Q=sandbox.window.KTS_SETTLEMENT_QUALIFICATION;
const H=sandbox.window.KTS_SETTLEMENT_QUALIFICATION_HISTORY;
assert.ok(S&&Q&&H);
assert.equal(typeof H.classifyHistoryValidity,'function');
const opt={from_date:'2026-09-22',to_date:'2026-09-22',required_observation_days:1};
const original=Object.fromEntries(H.COMPONENTS.map(k=>[k,k==='results'?'old':'same']));
const modified={...original,results:'changed'};
const event=(yes,c,fp,past)=>H.buildEvidenceEvent({
  qualification_state:yes?'READY_FOR_PRODUCTION_REVIEW':'BLOCKED_SHADOW_QUALIFICATION',
  ready_for_production_review:yes,
  blockers:yes?[]:['KQXS_NOT_FULLY_VERIFIED:0/1']
},opt,c,fp,past);
const ready=event(true,original,'sha-original',[]);
const blocked=event(false,modified,'sha-changed',[ready]);
const renewed=event(true,modified,'sha-renewed',[ready,blocked]);
const verify=(events,components=original,sha='sha-original',backend={status:'available'})=>
  H.classifyHistoryValidity(events,components,sha,backend);
test('no READY must be non-current',()=>{
  assert.equal(verify([]).status,'NO_READY_EVIDENCE');
});
test('READY without changes is current',()=>{
  assert.equal(verify([ready]).status,'READY_EVIDENCE_CURRENT');
});
test('modified result fingerprint makes READY stale',()=>{
  assert.equal(verify([ready],modified,'sha-changed').status,'READY_EVIDENCE_STALE');
});
test('BLOCKED prevents resurrection after exact source revert',()=>{
  const v=verify([ready,blocked]);
  assert.equal(v.status,'READY_EVIDENCE_STALE');
  assert.equal(v.current,false);
  assert.equal(v.invalidated_by_event_id,blocked.id);
  assert.ok(v.changed_components.includes('qualification_history'));
});
test('BLOCKED at identical content still invalidates READY',()=>{
  const same=event(false,original,'sha-original',[ready]);
  assert.equal(verify([ready,same]).current,false);
});
test('missing parser backend always returns UNVERIFIABLE',()=>{
  const v=verify([ready,blocked],original,'sha-original',{status:'unavailable',error:'offline'});
  assert.equal(v.status,'READY_EVIDENCE_UNVERIFIABLE');
  assert.equal(v.current,false);
});
test('new qualification READY restores current only at new fingerprint',()=>{
  assert.equal(verify([ready,blocked,renewed],modified,'sha-renewed').current,true);
  assert.equal(verify([ready,blocked,renewed],original,'sha-original').current,false);
});
test('later BLOCKED invalidates renewed READY again',()=>{
  const next=event(false,modified,'sha-renewed',[ready,blocked,renewed]);
  assert.equal(verify([ready,blocked,renewed,next],modified,'sha-renewed').current,false);
});
test('event authorizations remain false',()=>{
  for(const e of [ready,blocked,renewed]){
    assert.equal(e.production_enabled,false);
    assert.equal(e.merge_authorized,false);
  }
});
const fixture={business_date:'2026-09-22',region:'mb',status:'complete',complete:true,
  expected_station_codes:['mb'],verification_status:'verified',verified:true,
  verification_sources:['primary','secondary'],
  stations:[{code:'mb',prizes:{
    DB:['31922'],G1:['12361'],G2:['10001','20002'],
    G3:['30003','40004','50005','60006','70007','80008'],
    G4:['90009','11110','22211','33312'],
    G5:['44592','55514','66615','77716','88817','99918'],
    G6:['192','319','561'],G7:['92','20','30','40']
  }}]
};
const before=S.normalizeResultSnapshot(fixture);
const prizes=JSON.parse(JSON.stringify(before.stations));prizes[0].prizes.G7[0]='93';
const drift=S.normalizeResultSnapshot({...before,stations:prizes,fetched_at:'2099-01-02T00:00:00Z'});
const sameTimeOnly=S.normalizeResultSnapshot({...before,fetched_at:'2099-01-01T00:00:00Z'});
const restored=S.normalizeResultSnapshot({...before,fetched_at:'2099-01-03T00:00:00Z'});
const scope={partner_id:'synthetic',business_date:'2026-09-22',region:'mb',
  result_verification_status:'verified',result_verification_evidence_valid:true,
  result_fingerprint:before.fingerprint};
test('timestamp-only refetch preserves the canonical result fingerprint',()=>{
  assert.equal(sameTimeOnly.fingerprint,before.fingerprint);
});
test('changing a real G7 number changes the canonical fingerprint',()=>{
  assert.equal(before.verified,true);assert.equal(drift.verified,true);
  assert.notEqual(drift.fingerprint,before.fingerprint);
});
test('changed real KQXS prize fails the canonical qualification gate',()=>{
  const old=Q.kqxsVerificationGate({scopes:[scope]},[before]);
  const changed=Q.kqxsVerificationGate({scopes:[scope]},[drift]);
  assert.equal(old.met,true);assert.equal(changed.met,false);
  assert.equal(changed.bad_scopes[0].reason,'KQXS_SETTLEMENT_RESULT_DRIFT');
});
test('restoring KQXS does not restore historical READY without new qualification',()=>{
  assert.equal(Q.kqxsVerificationGate({scopes:[scope]},[restored]).met,true);
  assert.equal(verify([ready,blocked]).current,false);
});

test('test deploy manifest pins exact qualification and service worker Git blobs',()=>{
  const {execFileSync}=require('node:child_process');
  vm.runInNewContext(readFileSync(resolve(root,'settlement-test','settlement-build-identity.js'),'utf8'),sandbox,{filename:'settlement-build-identity.js'});
  const manifest=sandbox.window.KTS_SETTLEMENT_BUILD_IDENTITY;
  for(const name of ['settlement-qualification-history.js','sw.js']){
    const current=execFileSync('git',['hash-object','settlement-test/'+name],{cwd:root,encoding:'utf8'}).trim();
    assert.equal(manifest.critical_git_blobs['app/'+name],current);
  }
});
test('test service worker rotates cache for updated qualification module',()=>{
  const sw=readFileSync(resolve(root,'settlement-test','sw.js'),'utf8');
  assert.ok(sw.includes('v1.0.162-blocked-empty-revalidation'));
  assert.ok(sw.includes("'./settlement-qualification-history.js'"));
  assert.ok(sw.includes("'./settlement-build-identity.js'"));
});

test('test API auto-configuration is restricted to canonical Pages path and host',()=>{
  const html=readFileSync(resolve(root,'settlement-test','settlement.html'),'utf8');
  const script=html.match(/<script>\s*([\s\S]*?)\s*<\/script>/);
  assert.ok(script&&script[1],'TEST_ENDPOINT_INLINE_SCRIPT_NOT_FOUND');
  function endpoints(url){
    const origin=new URL(url);
    const ctx={window:{location:{hostname:origin.hostname,pathname:origin.pathname}}};
    vm.runInNewContext(script[1],ctx,{filename:'settlement-inline-origin-guard'});
    return ctx.window.KTS_SETTLEMENT_RUNTIME_ENDPOINTS;
  }
  const allowed=endpoints('https://wilson86.github.io/tach-dai-mobile/settlement-test/settlement.html');
  assert.ok(allowed,'TRUSTED_TEST_ORIGIN_NOT_CONFIGURED');
  assert.equal(allowed.parser_endpoint,'https://kts-settlement-api-test.onrender.com/api/settlement/parse');
  assert.equal(allowed.kqxs_endpoint,'https://kts-settlement-api-test.onrender.com/api/kqxs');
  for(const origin of [
    'http://127.0.0.1:8765/settlement-test/settlement.html',
    'http://localhost:8765/tach-dai-mobile/settlement-test/settlement.html',
    'https://wilson86.github.io/tach-dai-mobile/app/settlement.html',
    'https://wilson86.github.io/tach-dai-mobile/settlement-testing/settlement.html',
    'https://wilson86.github.io.evil.example/tach-dai-mobile/settlement-test/settlement.html',
    'https://example.org/tach-dai-mobile/settlement-test/settlement.html'
  ])assert.equal(endpoints(origin),undefined,'TEST_API_LEAKED_TO_UNTRUSTED_ORIGIN:'+origin);
});

test('malformed later journal record never resurrects READY',()=>{
  const cases=[
    {},
    {id:'legacy-unknown',ready_for_production_review:'false',previous_event_id:ready.id},
    {...blocked,previous_event_id:'deleted-event'},
    {...blocked,previous_ready_event_id:'deleted-ready'},
    {...blocked,production_enabled:true},
    {...blocked,merge_authorized:true},
    {...blocked,qualification_snapshot:{ready_for_production_review:true}}
  ];
  for(const item of cases){
    const v=verify([ready,item]);
    assert.equal(v.status,'READY_EVIDENCE_UNVERIFIABLE');
    assert.equal(v.current,false);
    assert.ok(v.history_error&&v.history_error.startsWith('QUALIFICATION_HISTORY_INVALID_'));
    assert.ok(v.changed_components.includes('qualification_history'));
  }
});
test('duplicate event identities and disconnected ancestry fail closed',()=>{
  const duplicate={...blocked,id:ready.id};
  const misplaced={...blocked,previous_event_id:'unknown'};
  for(const row of [[ready,duplicate],[ready,misplaced]]){
    const v=verify(row);
    assert.equal(v.current,false);
    assert.equal(v.status,'READY_EVIDENCE_UNVERIFIABLE');
  }
});
test('valid blocked event still invalidates READY without overblocking',()=>{
  const v=verify([ready,blocked]);
  assert.equal(v.status,'READY_EVIDENCE_STALE');
  assert.equal(v.current,false);
  assert.equal(H.validateHistoryEvents([ready,blocked,renewed]).valid,true);
});

test('Pages acceptance checks executed CDP state rather than source-text grep',()=>{
  const workflow=readFileSync(resolve(root,'.github','workflows','deploy-pages.yml'),'utf8');
  const cdp=readFileSync(resolve(root,'.github','scripts','settlement-cdp-browser.cjs'),'utf8');
  const section=workflow.match(/- name: Browser acceptance on canonical test Pages via real CDP([\s\S]*?)- name: Verify Pages service worker while Chrome network is offline/);
  assert.ok(section,'CDP_PAGES_ACCEPTANCE_GATE_MISSING');
  assert.ok(section[1].includes('settlement-cdp-browser.cjs acceptance-pages'));
  assert.ok(!section[1].includes('--dump-dom'));
  assert.ok(!section[1].includes('grep -Fq'));
  assert.ok(cdp.includes("const remotePages=['acceptance-pages','smoke-pages','offline-pages'].includes(mode)"));
  assert.ok(cdp.includes("'https://wilson86.github.io/tach-dai-mobile/settlement-test'"));
  assert.ok(cdp.includes("if(mode==='acceptance'||mode==='acceptance-pages')await checkAcceptance"));
  assert.ok(cdp.includes("if(state.state==='fail')throw Error('BROWSER_RUNTIME_FAILED:'"));
  const parity=workflow.indexOf('- name: Verify public settlement test bytes');
  const browser=workflow.indexOf('- name: Browser acceptance on canonical test Pages via real CDP');
  assert.ok(parity>=0&&browser>parity,'BROWSER_ACCEPTANCE_BEFORE_ARTIFACT_PARITY');
});

test('public Pages browser gates use real runtime CDP and no DNS spoofing',()=>{
  const workflow=readFileSync(resolve(root,'.github','workflows','deploy-pages.yml'),'utf8');
  const script=readFileSync(resolve(root,'.github','scripts','settlement-cdp-browser.cjs'),'utf8');
  const steps=[
    '- name: Verify public settlement test bytes',
    '- name: Browser smoke on canonical Pages via real CDP',
    '- name: Browser acceptance on canonical test Pages via real CDP',
    '- name: Verify Pages service worker while Chrome network is offline'
  ];
  const indices=steps.map(s=>workflow.indexOf(s));
  assert.ok(indices.every(x=>x>=0),'PAGES_GATE_MISSING');
  assert.ok(indices.every((x,i)=>i===0||indices[i-1]<x),'PAGES_GATE_ORDER_INVALID');
  for(const mode of ['smoke-pages','acceptance-pages','offline-pages']){
    assert.ok(workflow.includes('settlement-cdp-browser.cjs '+mode),'PAGES_CDP_MODE_MISSING:'+mode);
  }
  assert.ok(!workflow.includes('--dump-dom'),'LEGACY_DUMP_DOM_FORBIDDEN');
  assert.ok(!workflow.includes('--host-resolver-rules'),'DNS_ORIGIN_SPOOFING_FORBIDDEN');
  assert.ok(!workflow.includes('grep -Fq \'ACCEPTANCE_SMOKE=PASS\''),'STATIC_PASS_GREP_FORBIDDEN');
  assert.ok(script.includes("'https://wilson86.github.io/tach-dai-mobile/settlement-test'"));
  assert.ok(script.includes("'Network.emulateNetworkConditions'"));
  assert.ok(script.includes('offline:true,latency:0,downloadThroughput:0,uploadThroughput:0'));
  assert.ok(script.includes("assert(state.valid&&state.controlled,'PAGES_OFFLINE_NOT_CONTROLLED')"));
});

test('full Pages acceptance CDP contract extracts all 62 output markers',()=>{
  const cdp=readFileSync(resolve(root,'.github','scripts','settlement-cdp-browser.cjs'),'utf8');
  const fixture=readFileSync(resolve(root,'settlement-test','acceptance-smoke.html'),'utf8');
  const contract=fixture.slice(fixture.lastIndexOf('  out.textContent=['));
  const re=/^\s*'([^']+=PASS(?:[^']*)?)',?\s*$/gm;
  const markers=[...contract.matchAll(re)].map(x=>x[1]);
  assert.equal(markers.length,62,'ACCEPTANCE_CONTRACT_COUNT_CHANGED');
  assert.equal(new Set(markers).size,62,'ACCEPTANCE_MARKERS_DUPLICATED');
  assert.ok(cdp.includes(String.raw`contract.matchAll(/^\s*'`), 'CDP_MARKER_REGEX_WRONG');
  assert.ok(cdp.includes(String.raw`split(/\r?\n/)`),'CDP_NEWLINE_SPLITTER_WRONG');
  for(const marker of ['QUALIFICATION_HISTORY_BLOCKED_REVERT_FAIL_CLOSED=PASS',
    'UI_GATE_BROWSER_LOCKED=PASS','SHADOW_MATCH_EXACT=PASS']){
    assert.ok(markers.includes(marker),'MISSING_HARD_GATE_'+marker);
  }
});

test('Pages deployment cannot start before the shared fail-closed preflight',()=>{
  const workflow=readFileSync(resolve(root,'.github','workflows','deploy-pages.yml'),'utf8');
  const audit=readFileSync(resolve(root,'.github','workflows','settlement-predeploy-audit.yml'),'utf8');
  const gate=readFileSync(resolve(root,'.github','scripts','settlement-predeploy-gate.sh'),'utf8');
  const checker=readFileSync(resolve(root,'.github','scripts','settlement-predeploy-integrity.cjs'),'utf8');
  const checkout=workflow.indexOf('uses: actions/checkout@v4');
  const preflight=workflow.indexOf('name: Fail-closed local predeploy qualification');
  const backend=workflow.indexOf('name: Verify settlement test backend contract');
  const configure=workflow.indexOf('uses: actions/configure-pages@v5');
  const upload=workflow.indexOf('uses: actions/upload-pages-artifact@v3');
  const publish=workflow.indexOf('uses: actions/deploy-pages@v4');
  const postParity=workflow.indexOf('name: Verify public settlement test bytes');
  const postAccept=workflow.indexOf('name: Browser acceptance on canonical test Pages via real CDP');
  assert.ok(checkout>=0&&checkout<preflight&&preflight<backend&&backend<configure&&
    configure<upload&&upload<publish&&publish<postParity&&postParity<postAccept,
    'PREDEPLOY_FAIL_CLOSED_ORDER_BROKEN');
  assert.ok(workflow.includes('run: bash .github/scripts/settlement-predeploy-gate.sh'));
  assert.ok(audit.includes('run: bash .github/scripts/settlement-predeploy-gate.sh'));
  assert.ok(!audit.includes('actions/deploy-pages@'),'PR_AUDIT_MUST_NEVER_DEPLOY');
  assert.ok(!workflow.includes('continue-on-error: true'),'RELEASE_GATE_MUST_NOT_IGNORE_FAILURE');
  assert.ok(gate.includes('set -euo pipefail'));
  for(const required of [
    'settlement-predeploy-integrity.cjs',
    'node --test .github/scripts/settlement-history-audit.test.cjs',
    'settlement-cdp-browser.cjs indexeddb',
    'settlement-cdp-browser.cjs offline-cold'
  ])assert.ok(gate.includes(required),'PREDEPLOY_CHECK_MISSING:'+required);
  for(const required of [
    'PREDEPLOY_CRITICAL_BLOB_MISMATCH',
    'PREDEPLOY_SW_CACHE_ASSET_MISSING',
    'PREDEPLOY_JS_SYNTAX_ERROR'
  ])assert.ok(checker.includes(required),'INTEGRITY_FAIL_CLOSED_MISSING:'+required);
});

test('backend contract is verified before any public Pages mutation',()=>{
  const yaml=readFileSync(resolve(root,'.github','workflows','deploy-pages.yml'),'utf8');
  const step=yaml.indexOf('name: Verify settlement test backend contract');
  const upload=yaml.indexOf('uses: actions/upload-pages-artifact@v3');
  const deploy=yaml.indexOf('uses: actions/deploy-pages@v4');
  const publicParity=yaml.indexOf('name: Verify public settlement test bytes');
  assert.ok(step>=0&&step<upload&&upload<deploy&&deploy<publicParity,
    'BACKEND_TEST_POSTDEPLOY_UNSAFE');
  const block=yaml.slice(step,upload);
  assert.ok(block.includes('run: bash .github/scripts/settlement-backend-contract.sh'),'BACKEND_RELEASE_SCRIPT_NOT_USED');
  const script=readFileSync(resolve(root,'.github','scripts','settlement-backend-contract.sh'),'utf8');
  const audit=readFileSync(resolve(root,'.github','workflows','settlement-backend-contract-audit.yml'),'utf8');
  assert.ok(audit.includes('run: bash .github/scripts/settlement-backend-contract.sh'),'BACKEND_PR_SCRIPT_NOT_USED');
  assert.ok(audit.includes('contents: read')&&!audit.includes('actions/deploy-pages@'),'BACKEND_PR_NOT_READ_ONLY');
  for(const required of [
    '/health','/api/settlement/parser-identity','/api/settlement/parse',
    'BACKEND_CORS_PREFLIGHT_MISMATCH','BUSINESS_DATE_REQUIRED',
    'BACKEND_KQXS_CORS_PREFLIGHT_MISMATCH','KQXS_REGION_REQUIRED',
    'SETTLEMENT_TEST_BACKEND_CONTRACT=PASS',
    'REFUSE_NON_TEST_BACKEND','REFUSE_UNTRUSTED_TEST_ORIGIN'
  ])assert.ok(script.includes(required),'BACKEND_PREDEPLOY_GUARD_MISSING:'+required);
});

test('every cached runtime JavaScript file is pinned except recursive build identity',()=>{
  const source=readFileSync(resolve(root,'settlement-test','settlement-build-identity.js'),'utf8');
  const cache=readFileSync(resolve(root,'settlement-test','sw.js'),'utf8');
  vm.runInNewContext(source,sandbox,{filename:'settlement-build-identity.js'});
  const pins=sandbox.window.KTS_SETTLEMENT_BUILD_IDENTITY.critical_git_blobs;
  const assets=cache.match(/const CORE=\[([\s\S]*?)\];/);
  assert.ok(assets,'PREDEPLOY_SW_CORE_NOT_FOUND');
  const names=[...assets[1].matchAll(/'\.\/([^']+\.js)'/g)].map(x=>x[1]);
  assert.equal(names.length,60);
  assert.equal(Object.keys(pins).length,62);
  const missing=names.filter(x=>x!=='settlement-build-identity.js'&&!pins['app/'+x]);
  assert.deepEqual(missing,[],'UNPINNED_SETTLEMENT_RUNTIME_JS');
  const integrity=readFileSync(resolve(root,'.github','scripts','settlement-predeploy-integrity.cjs'),'utf8');
  assert.ok(integrity.includes('PREDEPLOY_UNPINNED_CACHED_JS'),'PREDEPLOY_UNPINNED_MODULE_GATE_MISSING');
  assert.ok(integrity.includes('PREDEPLOY_REQUIRED_PIN_MISSING'),'PREDEPLOY_WORKER_SHELL_PIN_GATE_MISSING');
  assert.ok(pins['app/index.html'],'PWA_ENTRY_HTML_UNPINNED');
  const executable=names.filter(x=>x!=='settlement-build-identity.js');
  assert.equal(executable.length,59,'UNEXPECTED_CACHED_JS_MODULE_COUNT');
});

test('corrupt metadata is not confused with a fresh empty journal',()=>{
  const valid={key:H.META_KEY,version:1,events:[]};
  assert.equal(H.validateJournalRow(valid).valid,true);
  const invalid=[
    [null,'ROW_NOT_OBJECT'],
    [[], 'ROW_NOT_OBJECT'],
    [{...valid,key:'wrong'},'ROW_KEY_MISMATCH'],
    [{...valid,version:9},'ROW_VERSION_MISMATCH'],
    [{...valid,events:'damaged'},'ROW_EVENTS_NOT_ARRAY'],
    [{...valid,events:{}},'ROW_EVENTS_NOT_ARRAY']
  ];
  for(const [row,reason] of invalid){
    const result=H.validateJournalRow(row);
    assert.equal(result.valid,false);
    assert.equal(result.reason,reason);
  }
});

test('READY decision must not override BLOCKED state or monetary blockers',()=>{
  const valid={qualification_state:'READY_FOR_PRODUCTION_REVIEW',
    ready_for_production_review:true,blockers:[],production_enabled:false,merge_authorized:false};
  assert.equal(H.validateSnapshotDecision(valid).valid,true);
  const invalid=[
    [{...valid,qualification_state:'BLOCKED_SHADOW_QUALIFICATION'},'READY_STATE_CONTRADICTION'],
    [{...valid,blockers:['UNEXPLAINED_MONETARY_MISMATCH']},'READY_HAS_BLOCKERS'],
    [{...valid,blockers:'NOT_ARRAY'},'READY_HAS_BLOCKERS'],
    [{...valid,production_enabled:true},'SNAPSHOT_AUTHORITY_ESCALATION'],
    [{...valid,merge_authorized:true},'SNAPSHOT_AUTHORITY_ESCALATION'],
    [{...valid,ready_for_production_review:false},'BLOCKED_STATE_CONTRADICTION']
  ];
  for(const [snapshot,reason] of invalid){
    assert.equal(H.validateSnapshotDecision(snapshot).reason,reason);
    const tampered=H.buildEvidenceEvent(snapshot,opt,original,'sha-original',[]);
    const verdict=H.classifyHistoryValidity([tampered],original,'sha-original',{status:'available'});
    assert.equal(verdict.status,'READY_EVIDENCE_UNVERIFIABLE');
    assert.equal(verdict.current,false);
    assert.equal(verdict.history_error,'QUALIFICATION_HISTORY_INVALID_'+reason);
  }
});

test('UI must not describe mutable evidence as immutable or misattribute history failure',()=>{
  const script=readFileSync(resolve(root,'settlement-test','settlement-qualification-history.js'),'utf8');
  assert.ok(!script.includes('evidence bất biến'),'MUTABLE_IDB_MISLABELED_IMMUTABLE');
  assert.ok(script.includes('IndexedDB trên thiết bị vẫn có thể bị sửa hoặc xóa'),
    'LOCAL_JOURNAL_MUTABILITY_WARNING_MISSING');
  assert.ok(script.includes('const integrity=validateHistoryEvents(events);if(!integrity.valid)'),
    'CORRUPTED_READY_RENDER_NOT_BLOCKED');
  assert.ok(script.includes("v.history_error||v.parser_backend_error"),
    'INVALID_HISTORY_ERROR_MISATTRIBUTED_TO_PARSER');
});

test('canonical READY refuses any unmet observation, KQXS, parser or regression gate',()=>{
  const all={
    format:'kts-final-qualification-v2-live-parser',
    qualification_state:'READY_FOR_PRODUCTION_REVIEW',
    ready_for_production_review:true,
    blockers:[],production_enabled:false,merge_authorized:false,
    observation:{promotion_ready:true,counts:{total:1,exact:1,missing_scopes:0},blockers:[]},
    kqxs_verification:{met:true,total:1,verified:1,conflict:0,unverified:0},
    parser_provenance:{met:true,total:1,known:1,unknown:0,invalid:0,parser_errors:0,missing_canonical:0},
    parser_backend:{met:true,total:1,matched:1,mismatched:0,unreachable:false},
    regression_gate:{met:true,total:1,passed:1,failed:0},
    candidate_gate:{met:true,pending:0},
    feature_safety:{met:true,unsafe_count:0}
  };
  assert.equal(H.validateSnapshotDecision(all).valid,true);
  for(const key of ['observation','kqxs_verification','parser_provenance',
    'parser_backend','regression_gate','candidate_gate','feature_safety']){
    const changed={...all,[key]:{...(all[key])}};
    changed[key][key==='observation'?'promotion_ready':'met']=false;
    const reason='READY_GATE_NOT_MET_'+key.toUpperCase();
    assert.equal(H.validateSnapshotDecision(changed).reason,reason);
    const event=H.buildEvidenceEvent(changed,opt,original,'sha-original',[]);
    const verdict=H.classifyHistoryValidity([event],original,'sha-original',{status:'available'});
    assert.equal(verdict.status,'READY_EVIDENCE_UNVERIFIABLE');
    assert.equal(verdict.history_error,'QUALIFICATION_HISTORY_INVALID_'+reason);
    const omitted={...all};
    delete omitted[key];
    assert.equal(H.validateSnapshotDecision(omitted).reason,reason);
  }
});

test('history retains partner and region filters in READY fingerprint reconstruction',()=>{
  const selected={...opt,partner_id:'partner-7',regions:['mb','mn']};
  const scoped=H.buildEvidenceEvent(ready.qualification_snapshot,selected,original,'sha-scoped',[]);
  assert.equal(scoped.partner_id,'partner-7');
  assert.equal(JSON.stringify(Array.from(scoped.regions)),JSON.stringify(['mb','mn']));
  const restored=H.qualificationOptionsFromEvent(scoped);
  assert.equal(restored.partner_id,selected.partner_id);
  assert.equal(JSON.stringify(Array.from(restored.regions)),JSON.stringify(selected.regions));
  const legacy=H.qualificationOptionsFromEvent(ready);
  assert.equal(legacy.partner_id,'');
  assert.equal(legacy.regions.length,0);
});
test('history rejects inconsistent event state, blocker list and damaged filters',()=>{
  for(const [patch,reason] of [
    [{qualification_state:'READY_FOR_PRODUCTION_REVIEW'},'EVENT_SNAPSHOT_STATE_MISMATCH'],
    [{blockers:['UNEXPLAINED_MONETARY_MISMATCH']},'EVENT_SNAPSHOT_BLOCKERS_MISMATCH'],
    [{partner_id:7},'EVENT_PARTNER_FILTER_INVALID'],
    [{regions:'mb'},'EVENT_REGIONS_FILTER_INVALID']
  ]){
    const verdict=verify([{...blocked,previous_event_id:null,previous_ready_event_id:null,...patch}],original,'sha-original');
    assert.equal(verdict.status,'READY_EVIDENCE_UNVERIFIABLE');
    assert.equal(verdict.history_error,'QUALIFICATION_HISTORY_INVALID_'+reason);
  }
});

test('test history config fingerprint detects per-region monetary terms',async()=>{
  sandbox.window.crypto=require('node:crypto').webcrypto;
  sandbox.window.TextEncoder=TextEncoder;
  const cfg={id:'partner-7:v1',partner_id:'partner-7',version:1,
    effective_from_date:'2026-09-22',region_pricing:{},total_percent:'100',
    refund_percent:'0',dat_hit_mode:'ky_ruoi',dax_hit_mode:'multi_pair',
    commission_type:'ratio',mb_xien_234:false,tinh_ui:false,
    region_terms:{
      mn:{total_percent:'95',refund_percent:'3',dat_hit_mode:'ky_ruoi',dax_hit_mode:'multi_pair'},
      mt:{total_percent:'97',refund_percent:'1',dat_hit_mode:'ky_ruoi',dax_hit_mode:'multi_pair'},
      mb:{total_percent:'90',refund_percent:'2',dat_hit_mode:'multi_pair'}
    },created_at:'2026-09-22T00:00:00Z',updated_at:'2026-09-22T00:00:00Z'};
  const digest=async row=>H.sha256Hex(H.semanticConfig(row));
  const baseline=await digest(cfg);
  assert.match(baseline,/^[0-9a-f]{64}$/);
  const timestamp={...cfg,updated_at:'2026-10-09T00:00:00Z'};
  assert.equal(await digest(timestamp),baseline,'TIMESTAMP_SHOULD_NOT_STALE_MONETARY_CONFIG');
  for(const region of ['mn','mt','mb']){
    for(const field of ['total_percent','refund_percent']){
      const updated=JSON.parse(JSON.stringify(cfg));
      updated.region_terms[region][field]='77';
      assert.notEqual(await digest(updated),baseline,'REGIONAL_MONEY_FIELD_NOT_TRACKED:'+region+':'+field);
    }
  }
  for(const region of ['mn','mt']){
    for(const field of ['dat_hit_mode','dax_hit_mode']){
      const updated=JSON.parse(JSON.stringify(cfg));
      updated.region_terms[region][field]='one_time';
      assert.notEqual(await digest(updated),baseline,'REGIONAL_HIT_MODE_FIELD_NOT_TRACKED:'+region+':'+field);
    }
  }
  assert.notEqual(await digest({...cfg,partner_id:'different-partner'}),baseline,'PARTNER_CONFIG_ISOLATION_LOST');
});

test('history fingerprints scoped partner identity and role as monetary inputs',async()=>{
  assert.ok(H.COMPONENTS.includes('partners'),'PARTNER_COMPONENT_REQUIRED');
  sandbox.window.crypto=require('node:crypto').webcrypto;
  sandbox.window.TextEncoder=TextEncoder;
  const p={id:'partner-7',name:'Counterparty',role:'customer',active:true,created_at:'2026-09-22T00:00:00Z',updated_at:'2026-09-22T00:00:00Z'};
  const digest=async row=>H.sha256Hex(H.semanticPartner(row));
  const baseline=await digest(p);
  assert.match(baseline,/^[0-9a-f]{64}$/);
  assert.equal(await digest({...p,updated_at:'2026-10-09T00:00:00Z'}),baseline);
  assert.notEqual(await digest({...p,role:'owner'}),baseline,'ROLE_CHANGE_NOT_TRACKED');
  assert.notEqual(await digest({...p,active:false}),baseline,'PARTNER_INACTIVE_NOT_TRACKED');
  assert.notEqual(await digest({...p,name:'Changed account'}),baseline,'PARTNER_IDENTITY_NOT_TRACKED');
  const src=readFileSync(resolve(root,'settlement-test','settlement-qualification-history.js'),'utf8');
  assert.ok(src.includes('d.store.getAll(d.store.STORES.partners)'),'PARTNER_SOURCE_NOT_LOADED');
  assert.ok(src.includes('partners:sortById(partners)'),'PARTNER_SOURCE_NOT_FINGERPRINTED');
});

test('canonical READY numeric evidence cannot contradict green gate flags',()=>{
  const q={
    format:'kts-final-qualification-v2-live-parser',
    qualification_state:'READY_FOR_PRODUCTION_REVIEW',ready_for_production_review:true,
    blockers:[],production_enabled:false,merge_authorized:false,
    observation:{promotion_ready:true,counts:{total:2,exact:2,missing_scopes:0},blockers:[]},
    kqxs_verification:{met:true,total:2,verified:2,conflict:0,unverified:0},
    parser_provenance:{met:true,total:2,known:2,unknown:0,invalid:0,parser_errors:0,missing_canonical:0},
    parser_backend:{met:true,total:2,matched:2,mismatched:0,unreachable:false},
    regression_gate:{met:true,total:4,passed:4,failed:0},
    candidate_gate:{met:true,pending:0},feature_safety:{met:true,unsafe_count:0}
  };
  assert.equal(H.validateSnapshotDecision(q).valid,true);
  for(const [name,alter] of [
    ['observation',x=>x.observation.counts.exact=1],
    ['kqxs_verification',x=>x.kqxs_verification.unverified=1],
    ['parser_provenance',x=>x.parser_provenance.parser_errors=1],
    ['parser_backend',x=>x.parser_backend.mismatched=1],
    ['regression_gate',x=>x.regression_gate.failed=1],
    ['candidate_gate',x=>x.candidate_gate.pending=1],
    ['feature_safety',x=>x.feature_safety.unsafe_count=1]
  ]){
    const broken=JSON.parse(JSON.stringify(q));alter(broken);
    const reason='READY_GATE_EVIDENCE_CONTRADICTION_'+name.toUpperCase();
    assert.equal(H.validateSnapshotDecision(broken).reason,reason);
    const item=H.buildEvidenceEvent(broken,opt,original,'sha-forged',[]);
    const verdict=H.classifyHistoryValidity([item],original,'sha-forged',{status:'available'});
    assert.equal(verdict.status,'READY_EVIDENCE_UNVERIFIABLE');
    assert.equal(verdict.history_error,'QUALIFICATION_HISTORY_INVALID_'+reason);
  }
  const absent=JSON.parse(JSON.stringify(q));delete absent.parser_backend.matched;
  assert.equal(H.validateSnapshotDecision(absent).reason,'READY_GATE_EVIDENCE_CONTRADICTION_PARSER_BACKEND');
});

test('golden regression replays through actual production regional runtime and closed UI gate',()=>{
  const sandboxReplay={window:{}};
  const calls=[];
  sandboxReplay.window.KTS_SETTLEMENT_ENGINE={
    version:'synthetic-engine',
    category:row=>row,
    settle:(rows,terms)=>{
      calls.push({rows:JSON.parse(JSON.stringify(rows)),terms:{...terms}});
      return {rows,observed_total:String(terms.total_percent),observed_refund:String(terms.refund_percent)};
    }
  };
  sandboxReplay.window.KTS_SETTLEMENT_EVALUATOR={
    evaluateCanonicalMessage:({canonical_payload})=>({
      category_inputs:canonical_payload.rows,detail_rows:canonical_payload.detail_rows||[]
    })
  };
  sandboxReplay.window.KTS_SETTLEMENT_SHADOW={compareSettlement:()=>({safe_to_promote:true})};
  for(const name of ['settlement-feature-gates.js','settlement-runtime.js','settlement-regression-cases.js']){
    vm.runInNewContext(readFileSync(resolve(root,'settlement-test',name),'utf8'),sandboxReplay,{filename:name});
  }
  const replay=sandboxReplay.window.KTS_SETTLEMENT_REGRESSION_CASES.replayCase;
  const baseConfig={partner_id:'test-partner',total_percent:'100',refund_percent:'0',
    region_terms:{
      mn:{total_percent:'87',refund_percent:'2'},
      mt:{total_percent:'93',refund_percent:'4'},
      mb:{total_percent:'95',refund_percent:'6'}
    },mb_xien_234:false,tinh_ui:true};
  const mk=(region,rows,config=baseConfig)=>({
    scope:{partner_id:'test-partner',business_date:'2026-09-22',region},
    partner_role:'customer',config_snapshot:config,
    lottery_result_snapshot:{complete:true},messages:[
      {id:'msg1',status:'parsed',canonical_payload:{rows,legs:[]}}
    ],expected_reference:{totals:{xac:1,qua_co:1,payout:1,final:1}}
  });
  for(const [region,total,refund] of [['mn','87','2'],['mt','93','4'],['mb','95','6']]){
    const result=replay(mk(region,[{code:'B',stake:10}]));
    assert.equal(result.pass,true);
    const latest=calls.at(-1);
    assert.equal(String(latest.terms.total_percent),total,'WRONG_REGIONAL_TOTAL:'+region);
    assert.equal(String(latest.terms.refund_percent),refund,'WRONG_REGIONAL_REFUND:'+region);
    assert.equal(latest.terms.partner_role,'customer');
    assert.equal(latest.rows.length,1);
  }
  replay(mk('mn',[{code:'B'}],{partner_id:'test-partner',total_percent:'99',refund_percent:'1'}));
  assert.equal(String(calls.at(-1).terms.total_percent),'99','LEGACY_FALLBACK_INCORRECT');
  assert.equal(String(calls.at(-1).terms.refund_percent),'1','LEGACY_REFUND_FALLBACK_INCORRECT');
  const ghost=mk('mn',[{code:'B'},{code:'UI'}]);
  ghost.messages[0].canonical_payload.detail_rows=[
    {code:'B',hit_units:1,numbers:'11'},{code:'UI',hit_units:8,numbers:'12'}
  ];
  ghost.messages.push({id:'msg2',status:'parsed',canonical_payload:{
    rows:[{code:'B',stake:4}],legs:[],detail_rows:[{code:'B',numbers:'22',hit_units:2}]
  }});
  const actual=replay(ghost);
  assert.equal(calls.at(-1).rows.length,2,'UNCONFIRMED_UI_NOT_GUARDED');
  assert.equal(calls.at(-1).rows[0].code,'B');
  assert.equal(actual.settlement.detail_rows.length,2,'GHOST_UI_DETAIL_PRESENT');
  assert.equal(actual.settlement.message_breakdown[0].detail_rows.length,1);
  assert.equal(actual.settlement.message_breakdown[0].category_rows.length,1);
  assert.equal(actual.settlement.message_breakdown[1].category_rows.length,1);
  assert.equal(actual.settlement.message_breakdown[1].detail_rows[0].numbers,'22');
  assert.ok(actual.settlement.detail_rows.every(x=>x.code!=='UI'));
  const unsafe=mk('mb',[{code:'MB_XIEN2'}]);
  unsafe.messages[0].canonical_payload.legs=[{code:'MB_XIEN2'}];
  assert.throws(()=>replay(unsafe),/REGRESSION_FEATURE_GATE_MB_XIEN_CLOSED/);
  const runtime=sandboxReplay.window.KTS_SETTLEMENT_RUNTIME;
  assert.equal(runtime.version,'settlement-runtime-v2-region-terms');
});

test('READY requires every pinned golden case to pass, not merely zero failures',()=>{
  const gates={observation:{promotion_ready:true,blockers:[]},kqxs:{met:true},parser_provenance:{met:true},
    parser_backend:{met:true},candidates:{pending:0},feature_safety:{met:true}};
  const incomplete=Q.combineQualification({...gates,regression:{total:3,passed:2,failed:0}});
  assert.equal(incomplete.qualification_state,'BLOCKED_SHADOW_QUALIFICATION');
  assert.equal(incomplete.ready_for_production_review,false);
  assert.equal(incomplete.regression_gate.met,false);
  assert.ok(incomplete.blockers.includes('REGRESSION_NOT_ALL_PASSED:2/3'));
  const complete=Q.combineQualification({...gates,regression:{total:3,passed:3,failed:0}});
  assert.equal(complete.regression_gate.met,true);
  assert.equal(complete.ready_for_production_review,true);
  const canonical={format:'kts-final-qualification-v2-live-parser',
    qualification_state:'READY_FOR_PRODUCTION_REVIEW',ready_for_production_review:true,
    blockers:[],production_enabled:false,merge_authorized:false,
    observation:{promotion_ready:true,counts:{total:1,exact:1,missing_scopes:0},blockers:[]},
    kqxs_verification:{met:true,total:1,verified:1,conflict:0,unverified:0},
    parser_provenance:{met:true,total:1,known:1,unknown:0,invalid:0,parser_errors:0,missing_canonical:0},
    parser_backend:{met:true,total:1,matched:1,mismatched:0,unreachable:false},
    regression_gate:{met:true,total:3,passed:2,failed:0},
    candidate_gate:{met:true,pending:0},feature_safety:{met:true,unsafe_count:0}
  };
  assert.equal(H.validateSnapshotDecision(canonical).reason,'READY_GATE_EVIDENCE_CONTRADICTION_REGRESSION_GATE');
  canonical.regression_gate.passed=3;
  assert.equal(H.validateSnapshotDecision(canonical).valid,true);
});

test('pipeline guard preserves per-message row attribution after forbidden UI disappears',()=>{
  const ctx={window:{}};
  for(const name of ['settlement-feature-gates.js','settlement-pipeline.js'])
    vm.runInNewContext(readFileSync(resolve(root,'settlement-test',name),'utf8'),ctx,{filename:name});
  const gates=ctx.window.KTS_SETTLEMENT_FEATURE_GATES;
  const guard=ctx.window.KTS_SETTLEMENT_PIPELINE.guardedMessageEvaluation;
  const cfg={tinh_ui:true,mb_xien_234:false};
  assert.equal(gates.UI_CONFIRMED,false);
  const a=guard({category_inputs:[{code:'2CD',xac:10},{code:'UI',xac:0}],
    detail_rows:[{code:'2CD',numbers:'11'},{code:'UI',numbers:'12'}]},cfg,gates);
  const b=guard({category_inputs:[{code:'2CB',xac:20}],
    detail_rows:[{code:'2CB',numbers:'22'}]},cfg,gates);
  assert.equal(a.category_inputs.length,1);
  assert.equal(a.detail_rows.length,1);
  assert.equal(a.detail_rows[0].code,'2CD');
  assert.equal(b.category_inputs.length,1);
  const aggregate=[...a.category_inputs,...b.category_inputs];
  const first=aggregate.slice(0,a.category_inputs.length);
  const second=aggregate.slice(a.category_inputs.length,a.category_inputs.length+b.category_inputs.length);
  assert.equal(first.length,1);
  assert.equal(first[0].code,'2CD');
  assert.equal(second.length,1);
  assert.equal(second[0].code,'2CB');
  assert.throws(()=>guard({category_inputs:[{code:'MB_XIEN2'}],detail_rows:[]},cfg,gates),/MB_XIEN_234_NOT_ALLOWED/);
  const source=readFileSync(resolve(root,'settlement-test','settlement-pipeline.js'),'utf8');
  assert.ok(source.includes('const guarded = guardedMessageEvaluation(evaluated, config, d.gates)'));
  assert.ok(source.includes("reason:'SETTLEMENT_CATEGORY_ROW_COUNT_MISMATCH'"));
});

test('live and regression share feature guards without ghost UI detail payouts',()=>{
  const ctx={window:{}};
  for(const name of ['settlement-feature-gates.js','settlement-pipeline.js'])
    vm.runInNewContext(readFileSync(resolve(root,'settlement-test',name),'utf8'),ctx,{filename:name});
  const gates=ctx.window.KTS_SETTLEMENT_FEATURE_GATES;
  const live=ctx.window.KTS_SETTLEMENT_PIPELINE.guardedMessageEvaluation;
  const x={category_inputs:[{code:'2CD',xac:10},{code:'UI',xac:0}],
    detail_rows:[{code:'2CD',hit_units:1},{code:'UI',hit_units:9}]};
  const config={tinh_ui:true,mb_xien_234:false};
  const a=live(x,config,gates),b=gates.guardEvaluation(x,config);
  assert.equal(JSON.stringify(a),JSON.stringify(b));
  assert.equal(a.category_inputs.length,1);
  assert.equal(a.detail_rows.length,1);
  assert.equal(a.detail_rows[0].code,'2CD');
  assert.equal(gates.UI_CONFIRMED,false);
  assert.throws(()=>gates.guardEvaluation({category_inputs:[{code:'MB_XIEN2'}],detail_rows:[]},config),/MB_XIEN_234_NOT_ALLOWED/);
  assert.throws(()=>gates.guardEvaluation({category_inputs:[{code:'2CB'}]},config),/SETTLEMENT_EVALUATION_INVALID/);
  const source=readFileSync(resolve(root,'settlement-test','settlement-regression-cases.js'),'utf8');
  assert.ok(source.includes('d.gates.guardEvaluation(evaluated, c.config_snapshot)'));
  assert.ok(source.includes('detail_rows: clone(guarded.detail_rows)'));
});

test('canonical journal rejects missing or malformed SHA-256 component entries',()=>{
  const q={format:'kts-final-qualification-v2-live-parser',
    qualification_state:'READY_FOR_PRODUCTION_REVIEW',
    ready_for_production_review:true,blockers:[],production_enabled:false,merge_authorized:false,
    observation:{promotion_ready:true,counts:{total:1,exact:1,missing_scopes:0},blockers:[]},
    kqxs_verification:{met:true,total:1,verified:1,conflict:0,unverified:0},
    parser_provenance:{met:true,total:1,known:1,unknown:0,invalid:0,parser_errors:0,missing_canonical:0},
    parser_backend:{met:true,total:1,matched:1,mismatched:0,unreachable:false},
    regression_gate:{met:true,total:1,passed:1,failed:0},
    candidate_gate:{met:true,pending:0},feature_safety:{met:true,unsafe_count:0}
  };
  const sha='a'.repeat(64);
  const components=Object.fromEntries(H.COMPONENTS.map(k=>[k,sha]));
  const good=H.buildEvidenceEvent(q,opt,components,'b'.repeat(64),[]);
  assert.equal(H.validateHistoryEvents([good]).valid,true);
  for(const [alter,reason] of [
    [e=>e.input_fingerprint_sha256='sha-forged','CANONICAL_INPUT_SHA256_INVALID'],
    [e=>delete e.component_fingerprints.partners,'CANONICAL_COMPONENT_SHA256_INVALID:partners'],
    [e=>e.component_fingerprints.regression_cases='0'.repeat(63),'CANONICAL_COMPONENT_SHA256_INVALID:regression_cases']
  ]){
    const event=JSON.parse(JSON.stringify(good));alter(event);
    const integrity=H.validateHistoryEvents([event]);
    assert.equal(integrity.valid,false);
    assert.equal(integrity.reason,reason);
    const verdict=H.classifyHistoryValidity([event],components,'b'.repeat(64),{status:'available'});
    assert.equal(verdict.status,'READY_EVIDENCE_UNVERIFIABLE');
  }
});

test('unsupported-only UI scope stays BLOCKED instead of settling silently as zero',async()=>{
  const ctx={window:{}};
  let settlementCalls=0;
  const saved=[];
  ctx.window.KTS_SETTLEMENT_STORE={
    STORES:{partners:'partners',results:'results',messages:'messages'},
    get:async(store,id)=>store==='results'?{business_date:'2026-09-22',region:'mn',complete:true}:null,
    getAll:async()=>[msg],
    resolveConfigForDate:async()=>({partner_id:'synthetic',tinh_ui:true,mb_xien_234:false}),
    saveSettlement:async row=>{saved.push(row);return row;}
  };
  ctx.window.KTS_SETTLEMENT_EVALUATOR={
    evaluateCanonicalMessage:()=>({category_inputs:[{code:'UI',xac:0}],
      detail_rows:[{code:'UI',numbers:'23',hit_units:1}]})
  };
  ctx.window.KTS_SETTLEMENT_RUNTIME={
    settleWithConfig:()=>{settlementCalls++;throw new Error('SHOULD_NOT_INVOKE_RUNTIME_FOR_EMPTY_GUARDED_ROWS');}
  };
  ctx.window.KTS_SETTLEMENT_ENGINE={version:'synthetic-engine'};
  for(const name of ['settlement-feature-gates.js','settlement-pipeline.js'])
    vm.runInNewContext(readFileSync(resolve(root,'settlement-test',name),'utf8'),ctx,{filename:name});
  const msg={id:'msg1',partner_id:'synthetic',business_date:'2026-09-22',region:'mn',
    status:'parsed',canonical_payload:{legs:[{code:'UI'}]}};
  const actual=await ctx.window.KTS_SETTLEMENT_PIPELINE.settleScope({
    partner_id:'synthetic',business_date:'2026-09-22',region:'mn',messages:[msg]
  });
  assert.equal(actual.status,'blocked');
  assert.equal(actual.reason,'NO_PERMITTED_SETTLEMENT_CATEGORY_INPUTS');
  assert.equal(actual.settlement.scope_status,'blocked');
  assert.deepEqual(JSON.parse(JSON.stringify(actual.settlement.blocked_reasons)),['NO_PERMITTED_SETTLEMENT_CATEGORY_INPUTS']);
  assert.equal(saved.length,1);
  assert.equal(settlementCalls,0);
  assert.equal(actual.settlement.category_rows.length,0);
});

test('scope commit refuses content mutations even when IDs and timestamps remain unchanged',async()=>{
  const ctx={window:{}};
  const copy=x=>JSON.parse(JSON.stringify(x));
  const baseMessage={id:'msg1',partner_id:'synthetic',business_date:'2026-09-22',region:'mn',
    status:'parsed_waiting_result',updated_at:'unchanged',raw_text:'11 b 1n',
    canonical_version:'v1',canonical_payload:{region:'mn',legs:[{code:'2CB',values:['11'],stake:1}]}};
  const baseConfig={id:'cfg1',partner_id:'synthetic',version:1,effective_from_date:'2026-09-01',
    updated_at:'unchanged',region_pricing:{mn:{'2CB':{commission:0.75,win:80}}},
    region_terms:{mn:{total_percent:'95',refund_percent:'3'}},total_percent:'100',
    refund_percent:'0',commission_type:'ratio'};
  const baseResult={business_date:'2026-09-22',region:'mn',fingerprint:'same-canonical-fingerprint',
    complete:true,coverage_complete:true,verified:true,verification_status:'verified',
    verification_sources:['sourceA','sourceB'],verification_conflicts:[],
    expected_station_codes:['tp'],stations:[{code:'tp',prizes:{DB:['11111']}}]};
  const baselinePartner={id:'synthetic',role:'customer',name:'Test partner',active:true};
  let storeState,changes=[],written=[];
  ctx.window.KTS_SETTLEMENT_STORE={
    STORES:{messages:'messages',results:'results',partners:'partners'},
    getAll:async name=>name==='messages'?copy(storeState.messages):[],
    get:async(name)=>copy(name==='results'?storeState.result:storeState.partner),
    resolveConfigForDate:async()=>copy(storeState.config),
    saveSettlement:async settlement=>{written.push(settlement);return settlement;}
  };
  ctx.window.KTS_SETTLEMENT_EVALUATOR={evaluateCanonicalMessage:()=>({
    category_inputs:[{code:'2CB',xac:1,commission_value:0.75,commission_type:'ratio',
      hit_units:0,win_rate:80}],detail_rows:[{code:'2CB',numbers:'11'}]
  })};
  ctx.window.KTS_SETTLEMENT_RUNTIME={settleWithConfig:rows=>{
    for(const change of changes)change(storeState);
    return {rows:copy(rows),final_net:1};
  }};
  ctx.window.KTS_SETTLEMENT_ENGINE={version:'synthetic-engine'};
  for(const name of ['settlement-feature-gates.js','settlement-pipeline.js'])
    vm.runInNewContext(readFileSync(resolve(root,'settlement-test',name),'utf8'),ctx,{filename:name});
  const pipeline=ctx.window.KTS_SETTLEMENT_PIPELINE;
  const scenarios=[
    ['canonical-change',s=>s.messages[0].canonical_payload.legs[0].values[0]='22'],
    ['price-change-same-version',s=>s.config.region_pricing.mn['2CB'].win=100],
    ['regional-percent-change',s=>s.config.region_terms.mn.total_percent='85'],
    ['verified-result-status-change',s=>s.result.verification_status='conflict'],
    ['verified-result-prize-change',s=>s.result.stations[0].prizes.DB[0]='22222'],
    ['partner-role-change',s=>s.partner.role='owner']
  ];
  for(const [name,change] of scenarios){
    storeState={messages:[copy(baseMessage)],config:copy(baseConfig),
      result:copy(baseResult),partner:copy(baselinePartner)};
    written=[];changes=[change];
    const outcome=await pipeline.settleScope({partner_id:'synthetic',business_date:'2026-09-22',region:'mn'});
    assert.equal(outcome.status,'superseded','UNSAFE_STALE_SETTLEMENT:'+name);
    assert.equal(written.length,0,'STALE_MONEY_WRITTEN:'+name);
  }
  storeState={messages:[copy(baseMessage)],config:copy(baseConfig),
    result:copy(baseResult),partner:copy(baselinePartner)};
  changes=[];written=[];
  const clean=await pipeline.settleScope({partner_id:'synthetic',business_date:'2026-09-22',region:'mn'});
  assert.equal(clean.status,'complete_unverified');
  assert.equal(written.length,1);
});

test('stale empty and blocked scope attempts never overwrite newly arrived bets',async()=>{
  const ctx={window:{}},copy=x=>JSON.parse(JSON.stringify(x));
  let latest=[],saved=[];
  const config={partner_id:'synthetic',id:'v1',version:1,region_terms:{mn:{total_percent:'95'}}};
  ctx.window.KTS_SETTLEMENT_STORE={
    STORES:{messages:'messages',results:'results',partners:'partners'},
    getAll:async name=>name==='messages'?copy(latest):[],
    resolveConfigForDate:async()=>copy(config),
    saveSettlement:async row=>{saved.push(row);return row;},
    get:async()=>null
  };
  ctx.window.KTS_SETTLEMENT_ENGINE={version:'synthetic'};
  ctx.window.KTS_SETTLEMENT_RUNTIME={settleWithConfig:()=>{throw Error('UNEXPECTED_MONEY_CALC')}};
  ctx.window.KTS_SETTLEMENT_EVALUATOR={evaluateCanonicalMessage:()=>{throw Error('UNEXPECTED_EVAL')}};
  for(const name of ['settlement-feature-gates.js','settlement-pipeline.js'])
    vm.runInNewContext(readFileSync(resolve(root,'settlement-test',name),'utf8'),ctx,{filename:name});
  const pipeline=ctx.window.KTS_SETTLEMENT_PIPELINE;
  const scope={partner_id:'synthetic',business_date:'2026-09-22',region:'mn'};
  const pending={...scope,id:'m1',updated_at:'same',status:'pending_parser',
    canonical_payload:null,raw_text:'11 b 1n'};
  latest=[pending];saved=[];
  let out=await pipeline.settleScope({...scope,messages:[]});
  assert.equal(out.status,'superseded','STALE_EMPTY_WRITE_NOT_PREVENTED');
  assert.equal(saved.length,0);
  latest=[{...pending,id:'m1',status:'parsed_waiting_result',
    canonical_payload:{region:'mn',legs:[{code:'2CB'}]}}];saved=[];
  out=await pipeline.settleScope({...scope,messages:[pending]});
  assert.equal(out.status,'superseded','STALE_BLOCKED_WRITE_NOT_PREVENTED');
  assert.equal(saved.length,0);
  latest=[pending];saved=[];
  out=await pipeline.settleScope({...scope,messages:[pending]});
  assert.equal(out.status,'blocked');
  assert.equal(saved.length,1);
  latest=[];saved=[];
  out=await pipeline.settleScope({...scope,messages:[]});
  assert.equal(out.status,'empty');
  assert.equal(saved.length,1);
});
