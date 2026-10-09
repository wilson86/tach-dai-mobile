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
  assert.ok(sw.includes('v1.0.210-duplicate-evidence-failclosed'));
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
  const gates={
    observation:{promotion_ready:true,blockers:[],counts:{total:1,exact:1,missing_scopes:0}},
    kqxs:{met:true,total:1,verified:1,conflict:0,unverified:0},
    parser_provenance:{met:true,total:1,known:1,unknown:0,invalid:0,parser_errors:0,missing_canonical:0},
    parser_backend:{met:true,total:1,matched:1,mismatched:0,unreachable:false},
    candidates:{pending:0},feature_safety:{met:true,unsafe_count:0}
  };
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
    saveSettlement:async row=>{saved.push(row);return row;},
    saveSettlementIfScopeUnchanged:async row=>({saved:await ctx.window.KTS_SETTLEMENT_STORE.saveSettlement(row),superseded:false}),
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
    get:async(name)=>copy(name==='results'?storeState.result:name==='partners'?storeState.partner:null),
    resolveConfigForDate:async()=>copy(storeState.config),
    saveSettlement:async settlement=>{written.push(settlement);return settlement;},
    saveSettlementIfScopeUnchanged:async (settlement,expected)=>{
      assert.equal(expected.messages[0].id,'msg1');
      assert.equal(expected.config.partner_id,'synthetic');
      assert.equal(expected.result.business_date,'2026-09-22');
      assert.equal(expected.partner.id,'synthetic');
      written.push(settlement);
      return {saved:settlement,superseded:false};
    }
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
    saveSettlementIfScopeUnchanged:async row=>({saved:await ctx.window.KTS_SETTLEMENT_STORE.saveSettlement(row),superseded:false}),
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

test('parser error cannot be bypassed by stale canonical content and successful status',async()=>{
  const ctx={window:{}},clone=v=>JSON.parse(JSON.stringify(v));
  let writes=0,evals=0,runtimes=0;
  const scope={partner_id:'synthetic',business_date:'2026-09-22',region:'mn'};
  const message={...scope,id:'msg1',status:'parsed_waiting_result',
    raw_text:'11 b 1n',parser_error:'PARSER_SOURCE_INVALID',canonical_payload:{region:'mn',legs:[{code:'2CB'}]}};
  const config={id:'c1',partner_id:'synthetic',version:1,region_terms:{}};
  ctx.window.KTS_SETTLEMENT_STORE={
    STORES:{messages:'messages',results:'results',partners:'partners'},
    getAll:async()=>[clone(message)],
    resolveConfigForDate:async()=>clone(config),
    saveSettlement:async s=>{writes++;return s;},
    saveSettlementIfScopeUnchanged:async row=>({saved:await ctx.window.KTS_SETTLEMENT_STORE.saveSettlement(row),superseded:false}),
    get:async()=>null
  };
  ctx.window.KTS_SETTLEMENT_EVALUATOR={evaluateCanonicalMessage:()=>{
    evals++;throw Error('MUST_NOT_EVALUATE_FAILED_PARSER');
  }};
  ctx.window.KTS_SETTLEMENT_RUNTIME={settleWithConfig:()=>{
    runtimes++;throw Error('MUST_NOT_SETTLE_FAILED_PARSER');
  }};
  ctx.window.KTS_SETTLEMENT_ENGINE={version:'synthetic'};
  for(const name of ['settlement-feature-gates.js','settlement-pipeline.js'])
    vm.runInNewContext(readFileSync(resolve(root,'settlement-test',name),'utf8'),ctx,{filename:name});
  const result=await ctx.window.KTS_SETTLEMENT_PIPELINE.settleScope({...scope,messages:[clone(message)]});
  assert.equal(result.status,'blocked');
  assert.equal(result.settlement.scope_status,'blocked');
  assert.equal(result.reason,'PENDING_PARSER:msg1');
  assert.equal(writes,1,'BLOCKED_SCOPE_RECEIPT_MUST_BE_WRITTEN');
  assert.equal(evals,0);assert.equal(runtimes,0);
});

test('blocked KQXS conflict cannot overwrite newer verified source',async()=>{
  const ctx={window:{}},copy=v=>JSON.parse(JSON.stringify(v));
  const scope={partner_id:'synthetic',business_date:'2026-09-22',region:'mn'};
  const msg={...scope,id:'msg1',status:'parsed_waiting_result',
    canonical_payload:{region:'mn',legs:[{code:'2CB',values:['11'],stake:1}]}};
  const config={id:'c1',partner_id:'synthetic',version:1};
  let reads=0,writes=0;
  ctx.window.KTS_SETTLEMENT_STORE={
    STORES:{messages:'messages',results:'results',partners:'partners'},
    getAll:async()=>[copy(msg)],
    resolveConfigForDate:async()=>copy(config),
    get:async(name)=>{
      if(name!=='results')return null;
      reads++;
      return copy({business_date:'2026-09-22',region:'mn',complete:true,
        fingerprint:'same-prize-fingerprint',
        verification_status:reads===1?'conflict':'verified',
        verification_conflicts:reads===1?['SOURCE_DIFF']:[]});
    },
    saveSettlement:async s=>{writes++;return s;},
    saveSettlementIfScopeUnchanged:async row=>({saved:await ctx.window.KTS_SETTLEMENT_STORE.saveSettlement(row),superseded:false}),
  };
  ctx.window.KTS_SETTLEMENT_EVALUATOR={evaluateCanonicalMessage:()=>{throw Error('UNEXPECTED_EVALUATION')}};
  ctx.window.KTS_SETTLEMENT_RUNTIME={settleWithConfig:()=>{throw Error('UNEXPECTED_SETTLE')}};
  ctx.window.KTS_SETTLEMENT_ENGINE={version:'synthetic'};
  for(const name of ['settlement-feature-gates.js','settlement-pipeline.js'])
    vm.runInNewContext(readFileSync(resolve(root,'settlement-test',name),'utf8'),ctx,{filename:name});
  const result=await ctx.window.KTS_SETTLEMENT_PIPELINE.settleScope({...scope,messages:[msg]});
  assert.equal(result.status,'superseded');
  assert.equal(result.reason,'SCOPE_INPUT_CHANGED_DURING_SETTLEMENT');
  assert.equal(reads,2);
  assert.equal(writes,0,'STALE_CONFLICT_MUST_NOT_OVERWRITE_UPDATED_SCOPE');
});

test('missing config or KQXS race must not save stale BLOCKED money',async()=>{
  const ctx={window:{}},scope={partner_id:'synthetic',business_date:'2026-09-22',region:'mn'};
  const msg={...scope,id:'m1',status:'parsed_waiting_result',canonical_payload:{region:'mn',legs:[{code:'2CB'}]}};
  const cfg={id:'cfg',partner_id:'synthetic',version:1};
  const result={business_date:'2026-09-22',region:'mn',complete:true};
  let configAvailable=false,kqxsAvailable=false,changes=[],writes=[];
  const st=ctx.window.KTS_SETTLEMENT_STORE={
    STORES:{messages:'messages',results:'results',partners:'partners'},
    getAll:async()=>[msg],
    resolveConfigForDate:async()=>{const now=configAvailable;if(!now){configAvailable=changes.includes('config');throw Error('NO_CONFIG_FOR_BUSINESS_DATE')}return cfg;},
    get:async(name)=>{if(name!=='results')return null;
      if(!kqxsAvailable){kqxsAvailable=changes.includes('kqxs');return null;}
      return result;},
    saveSettlement:async row=>{writes.push(row);return row;},
    saveSettlementIfScopeUnchanged:async row=>({saved:await ctx.window.KTS_SETTLEMENT_STORE.saveSettlement(row),superseded:false}),
  };
  ctx.window.KTS_SETTLEMENT_ENGINE={version:'fake'};
  ctx.window.KTS_SETTLEMENT_EVALUATOR={evaluateCanonicalMessage:()=>({category_inputs:[{code:'2CB'}],detail_rows:[]})};
  ctx.window.KTS_SETTLEMENT_RUNTIME={settleWithConfig:()=>{throw Error('UNEXPECTED_CALC')}};
  for(const f of ['settlement-feature-gates.js','settlement-pipeline.js'])
    vm.runInNewContext(readFileSync(resolve(root,'settlement-test',f),'utf8'),ctx,{filename:f});
  const pipeline=ctx.window.KTS_SETTLEMENT_PIPELINE;
  configAvailable=false;kqxsAvailable=false;changes=['config'];writes=[];
  let x=await pipeline.settleScope(scope);
  assert.equal(x.status,'superseded','CONFIG_RECOVERED_DURING_BLOCK');
  assert.equal(writes.length,0);
  configAvailable=true;kqxsAvailable=false;changes=['kqxs'];writes=[];
  x=await pipeline.settleScope(scope);
  assert.equal(x.status,'superseded','RESULT_RECOVERED_DURING_BLOCK');
  assert.equal(writes.length,0);
  configAvailable=false;kqxsAvailable=false;changes=[];writes=[];
  x=await pipeline.settleScope(scope);
  assert.equal(x.status,'blocked');
  assert.equal(writes.length,1);
  assert.equal(x.reason,'NO_CONFIG_FOR_BUSINESS_DATE');
  configAvailable=true;kqxsAvailable=false;changes=[];writes=[];
  x=await pipeline.settleScope(scope);
  assert.equal(x.status,'blocked');
  assert.equal(writes.length,1);
  assert.equal(x.reason,'KQXS_NOT_AVAILABLE');
});

test('failed monetary runtime cannot write stale BLOCKED after partner role is corrected',async()=>{
  const ctx={window:{}},copy=v=>JSON.parse(JSON.stringify(v));
  const scope={partner_id:'synthetic',business_date:'2026-09-22',region:'mn'};
  const msg={...scope,id:'m1',status:'parsed_waiting_result',canonical_payload:{region:'mn',legs:[{code:'2CB'}]}};
  const cfg={partner_id:'synthetic',version:1},kqxs={business_date:scope.business_date,region:'mn',complete:true};
  let partner={id:'synthetic',name:'owner',role:'bad_role',active:true},writes=[],changeAfterRead=false,reads=0;
  ctx.window.KTS_SETTLEMENT_STORE={
    STORES:{messages:'messages',results:'results',partners:'partners'},
    getAll:async()=>[copy(msg)],
    resolveConfigForDate:async()=>copy(cfg),
    get:async(name)=>{if(name==='results')return copy(kqxs);
      if(name==='partners'){reads++;const seen=copy(partner);
        if(changeAfterRead&&reads===1)partner.role='owner';
        return seen;}return null;},
    saveSettlement:async row=>{writes.push(row);return row;},
    saveSettlementIfScopeUnchanged:async row=>({saved:await ctx.window.KTS_SETTLEMENT_STORE.saveSettlement(row),superseded:false}),
  };
  ctx.window.KTS_SETTLEMENT_EVALUATOR={evaluateCanonicalMessage:()=>({category_inputs:[{code:'2CB'}],detail_rows:[]})};
  ctx.window.KTS_SETTLEMENT_RUNTIME={settleWithConfig:()=>{throw Error('INVALID_PARTNER_ROLE')}};
  ctx.window.KTS_SETTLEMENT_ENGINE={version:'synthetic'};
  for(const f of ['settlement-feature-gates.js','settlement-pipeline.js'])
    vm.runInNewContext(readFileSync(resolve(root,'settlement-test',f),'utf8'),ctx,{filename:f});
  const p=ctx.window.KTS_SETTLEMENT_PIPELINE;
  changeAfterRead=true;reads=0;writes=[];
  let result=await p.settleScope(scope);
  assert.equal(result.status,'superseded');
  assert.equal(writes.length,0,'STALE_BLOCKED_WRITTEN_AFTER_PARTNER_CHANGE');
  partner={id:'synthetic',name:'owner',role:'bad_role',active:true};
  changeAfterRead=false;reads=0;writes=[];
  result=await p.settleScope(scope);
  assert.equal(result.status,'blocked');
  assert.equal(writes.length,1,'SAME_PARTNER_ERROR_SHOULD_BLOCK');
  assert.equal(result.reason,'INVALID_PARTNER_ROLE');
});

test('contradictory KQXS sources hard-block even when legacy status says verified',async()=>{
  const ctx={window:{}},copy=x=>JSON.parse(JSON.stringify(x)),scope={partner_id:'synthetic',business_date:'2026-09-22',region:'mn'};
  const msg={...scope,id:'m1',status:'parsed_waiting_result',canonical_payload:{region:'mn',legs:[{code:'2CB'}]}};
  let evaluations=0,monetaryRuns=0,writes=[],snapshot={business_date:'2026-09-22',region:'mn',
    complete:true,verified:true,verification_status:'verified',
    verification_conflicts:['DIFFERING_PROVIDER_PRIZE'],stations:[{code:'tp',prizes:{DB:['11111']}}]};
  ctx.window.KTS_SETTLEMENT_STORE={
    STORES:{messages:'messages',results:'results',partners:'partners'},
    getAll:async()=>[copy(msg)],
    resolveConfigForDate:async()=>({partner_id:'synthetic',id:'v1',version:1}),
    get:async(name)=>name==='results'?copy(snapshot):null,
    saveSettlement:async row=>{writes.push(row);return row;},
    saveSettlementIfScopeUnchanged:async row=>({saved:await ctx.window.KTS_SETTLEMENT_STORE.saveSettlement(row),superseded:false}),
  };
  ctx.window.KTS_SETTLEMENT_EVALUATOR={evaluateCanonicalMessage:()=>{
    evaluations++;throw Error('MUST_NOT_EVALUATE_CONFLICTED_RESULTS');
  }};
  ctx.window.KTS_SETTLEMENT_RUNTIME={settleWithConfig:()=>{
    monetaryRuns++;throw Error('MUST_NOT_RUN_MONEY_ON_CONFLICT');
  }};
  ctx.window.KTS_SETTLEMENT_ENGINE={version:'synthetic'};
  for(const f of ['settlement-feature-gates.js','settlement-pipeline.js'])
    vm.runInNewContext(readFileSync(resolve(root,'settlement-test',f),'utf8'),ctx,{filename:f});
  const x=await ctx.window.KTS_SETTLEMENT_PIPELINE.settleScope(scope);
  assert.equal(x.status,'blocked');
  assert.equal(x.reason,'KQXS_SOURCE_CONFLICT');
  assert.equal(x.settlement.scope_status,'blocked');
  assert.equal(writes.length,1);
  assert.equal(evaluations,0);
  assert.equal(monetaryRuns,0);
});

test('golden oracle rejects blank, null, bool or object totals; legitimate zero stays valid',()=>{
  const ctx={window:{}};
  vm.runInNewContext(readFileSync(resolve(root,'settlement-test','settlement-regression-cases.js'),'utf8'),ctx,{filename:'settlement-regression-cases.js'});
  const normalize=ctx.window.KTS_SETTLEMENT_REGRESSION_CASES.normalizeCase;
  const base={scope:{partner_id:'synthetic',business_date:'2026-09-22',region:'mn'},
    partner_role:'customer',config_snapshot:{region_pricing:{}},lottery_result_snapshot:{complete:true},
    messages:[{id:'m1',canonical_payload:{region:'mn',legs:[]}}],
    expected_reference:{totals:{xac:0,qua_co:'0',payout:0,final:'-12.25'}}};
  assert.equal(normalize(base).expected_reference.totals.final,'-12.25');
  for(const key of ['xac','qua_co','payout','final']){
    for(const malformed of [null,'','  ',false,true,[],{},'Infinity','NaN']){
      const v=JSON.parse(JSON.stringify(base));v.expected_reference.totals[key]=malformed;
      assert.throws(()=>normalize(v),new RegExp('REGRESSION_REFERENCE_REQUIRED:'+key));
    }
    const missing=JSON.parse(JSON.stringify(base));delete missing.expected_reference.totals[key];
    assert.throws(()=>normalize(missing),new RegExp('REGRESSION_REFERENCE_REQUIRED:'+key));
  }
});

test('dashboard READY is impossible when flags contradict counters or blockers',()=>{
  const copy=x=>JSON.parse(JSON.stringify(x));
  const good={
    observation:{promotion_ready:true,counts:{total:2,exact:2,missing_scopes:0},blockers:[]},
    kqxs:{met:true,total:2,verified:2,conflict:0,unverified:0},
    parser_provenance:{met:true,total:2,known:2,unknown:0,invalid:0,parser_errors:0,missing_canonical:0},
    parser_backend:{met:true,total:2,matched:2,mismatched:0,unreachable:false},
    regression:{total:3,passed:3,failed:0},candidates:{pending:0},
    feature_safety:{met:true,unsafe_count:0}
  };
  const valid=Q.combineQualification(good);
  assert.equal(valid.ready_for_production_review,true);
  assert.equal(H.validateSnapshotDecision(valid).valid,true);
  const cases=[
    ['observation',x=>x.observation.counts.exact=1,'READY_GATE_EVIDENCE_CONTRADICTION_OBSERVATION'],
    ['observation-blocker',x=>x.observation.blockers.push('UNEXPLAINED_MONEY_MISMATCH'),'UNEXPLAINED_MONEY_MISMATCH'],
    ['kqxs',x=>x.kqxs.unverified=1,'READY_GATE_EVIDENCE_CONTRADICTION_KQXS_VERIFICATION'],
    ['parser',x=>x.parser_provenance.known=1,'READY_GATE_EVIDENCE_CONTRADICTION_PARSER_PROVENANCE'],
    ['backend',x=>x.parser_backend.mismatched=1,'READY_GATE_EVIDENCE_CONTRADICTION_PARSER_BACKEND'],
    ['regression',x=>x.regression.passed=2,'READY_GATE_EVIDENCE_CONTRADICTION_REGRESSION_GATE'],
    ['candidate',x=>x.candidates.pending=-1,'READY_GATE_EVIDENCE_CONTRADICTION_CANDIDATE_GATE'],
    ['feature',x=>x.feature_safety.unsafe_count=1,'READY_GATE_EVIDENCE_CONTRADICTION_FEATURE_SAFETY']
  ];
  for(const [label,mutate,reason] of cases){
    const input=copy(good);mutate(input);
    const q=Q.combineQualification(input);
    assert.equal(q.ready_for_production_review,false,'UNSAFE_READY:'+label);
    assert.equal(q.qualification_state,'BLOCKED_SHADOW_QUALIFICATION');
    assert.ok(q.blockers.includes(reason),'MISSING_BLOCKER:'+label);
    assert.equal(q.production_enabled,false);assert.equal(q.merge_authorized,false);
  }
});

test('shadow HIOSKT cannot promote blank or typed nondecimal reference values',()=>{
  const ctx={window:{}};
  vm.runInNewContext(readFileSync(resolve(root,'settlement-test','settlement-shadow.js'),'utf8'),ctx,{filename:'settlement-shadow.js'});
  const compare=ctx.window.KTS_SETTLEMENT_SHADOW.compareSettlement;
  const local={settlement_result:{total_xac:0,total_qua_co:0,total_payout:0,refund_amount:0,final_net:0,
    exact:{total_xac:'0',total_qua_co:'0',total_payout:'0',final_net:'0'}}};
  const good={totals:{xac:0,qua_co:'0',payout:'0',final:'0'}};
  assert.equal(compare(local,good).safe_to_promote,true,'VALID_DECIMAL_ZERO_MUST_WORK');
  for(const key of ['xac','qua_co','payout','final']){
    for(const bad of [' ', '\t', false, true, [], {}, '0x0', '0b0', 'NaN', 'Infinity']){
      const ref=JSON.parse(JSON.stringify(good));ref.totals[key]=bad;
      const result=compare(local,ref);
      assert.equal(result.safe_to_promote,false,'INVALID_REFERENCE_PROMOTED:'+key+':'+String(bad));
      assert.equal(result.required_totals_exact,false);
    }
  }
  const tiny=compare(local,{totals:{xac:' 0.000 ',qua_co:'0e0',payout:0,final:'0'}});
  assert.equal(tiny.safe_to_promote,true,'VALID_DECIMAL_SYNTAX_REJECTED');
});

test('golden reference totals enforce identical decimal syntax as shadow comparator',()=>{
  const ctx={window:{}};
  for(const name of ['settlement-shadow.js','settlement-regression-cases.js'])
    vm.runInNewContext(readFileSync(resolve(root,'settlement-test',name),'utf8'),ctx,{filename:name});
  const valid={scope:{partner_id:'p',business_date:'2026-09-22',region:'mn'},
    partner_role:'owner',config_snapshot:{},lottery_result_snapshot:{complete:true},
    messages:[{id:'m1',canonical_payload:{region:'mn',legs:[]}}],
    expected_reference:{totals:{xac:0,qua_co:'0',payout:0,final:'0'}}};
  const normalize=ctx.window.KTS_SETTLEMENT_REGRESSION_CASES.normalizeCase;
  for(const s of ['0x0','0b0','0o0','+0x0','1_000','0,00','.5','-','1e999','-1e999']){
    const v=JSON.parse(JSON.stringify(valid));v.expected_reference.totals.final=s;
    assert.throws(()=>normalize(v),/REGRESSION_REFERENCE_REQUIRED:final/,'BAD_ORACLE_ACCEPTED:'+s);
  }
  for(const s of ['+0','-0','0.','001.0','1e3','-2.5E-3','0e999']){
    const v=JSON.parse(JSON.stringify(valid));v.expected_reference.totals.final=s;
    assert.equal(normalize(v).expected_reference.totals.final,s,'VALID_ORACLE_REJECTED:'+s);
  }
});

test('malformed exact HIOSKT or local evidence never falls back to approximate monetary match',()=>{
  const ctx={window:{}};
  vm.runInNewContext(readFileSync(resolve(root,'settlement-test','settlement-shadow.js'),'utf8'),ctx,{filename:'settlement-shadow.js'});
  const shadow=ctx.window.KTS_SETTLEMENT_SHADOW;
  const valid={settlement_result:{
    total_xac:0,total_qua_co:0,total_payout:0,final_net:0,
    exact:{total_xac:'0',total_qua_co:'0',total_payout:'0',final_net:'0'}
  }};
  const reference={totals:{xac:0,qua_co:0,payout:0,final:0,
    exact:{total_xac:'0',total_qua_co:'0',total_payout:'0',final_net:'0'}}};
  assert.equal(shadow.compareSettlement(valid,reference).safe_to_promote,true);
  const c=x=>JSON.parse(JSON.stringify(x));
  for(const [kind,alter] of [
    ['local_invalid',x=>x.local.settlement_result.exact.final_net='not-money'],
    ['local_overflow',x=>x.local.settlement_result.exact.final_net='0e1001'],
    ['reference_invalid',x=>x.ref.totals.exact.final_net='not-money'],
    ['reference_overflow',x=>x.ref.totals.exact.final_net='0e1001'],
    ['reference_invalid_legacy_local',x=>{delete x.local.settlement_result.exact.final_net;x.ref.totals.exact.final_net='not-money';}]
  ]){
    const x={local:c(valid),ref:c(reference)};alter(x);
    const result=shadow.compareSettlement(x.local,x.ref);
    assert.equal(result.safe_to_promote,false,'INVALID_EXACT_WAS_PROMOTED:'+kind);
    assert.equal(result.required_totals_exact,false);
    assert.equal(result.totals.final_net.status,'NOT_COMPARABLE');
    assert.equal(result.totals.final_net.reason,'INVALID_EXACT_MONETARY_EVIDENCE');
  }
  const legacy=c(valid);delete legacy.settlement_result.exact;
  const compatible=shadow.compareSettlement(legacy,{totals:{xac:0,qua_co:0,payout:0,final:0}});
  assert.equal(compatible.safe_to_promote,true,'LEGACY_ABSENT_EXACT_MUST_WORK');
});

test('malformed category money cannot be promoted as a shadow exact match',()=>{
  const ctx={window:{}};
  vm.runInNewContext(readFileSync(resolve(root,'settlement-test','settlement-shadow.js'),'utf8'),ctx,{filename:'settlement-shadow.js'});
  const compare=ctx.window.KTS_SETTLEMENT_SHADOW.compareSettlement;
  const local={settlement_result:{total_xac:0,total_qua_co:0,total_payout:0,final_net:0},
    category_rows:[{code:'B',xac:0,qua_co:0,hit_units:0,payout:0}]};
  const reference={totals:{xac:0,qua_co:0,payout:0,final:0},
    categories:[{code:'B',xac:0,qua_co:0,hit_units:0,payout:0}]};
  const copy=x=>JSON.parse(JSON.stringify(x));
  assert.equal(compare(local,reference).safe_to_promote,true);
  const invalid=[
    ['blank_reference',x=>x.reference.categories[0].payout=' '],
    ['boolean_reference',x=>x.reference.categories[0].xac=false],
    ['null_reference',x=>x.reference.categories[0].qua_co=null],
    ['array_reference',x=>x.reference.categories[0].hit_units=[]],
    ['invalid_reference_exact',x=>x.reference.categories[0].exact={payout:'garbage'}],
    ['invalid_local',x=>x.local.category_rows[0].xac=false],
    ['invalid_local_exact',x=>x.local.category_rows[0].exact={payout:'garbage'}]
  ];
  for(const [label,mutate] of invalid){
    const x={local:copy(local),reference:copy(reference)};mutate(x);
    const result=compare(x.local,x.reference);
    assert.equal(result.safe_to_promote,false,'INVALID_CATEGORY_PROMOTED:'+label);
    assert.equal(result.invalid_category_evidence,true);
    assert.equal(result.exact,false);
    assert.equal(result.status,'INCOMPLETE_REFERENCE');
  }
});

test('HIOSKT manual reference entry rejects coercive zero and preserves decimal precision',()=>{
  const ctx={window:{}};
  for(const name of ['settlement-shadow.js','settlement-shadow-runtime.js'])
    vm.runInNewContext(readFileSync(resolve(root,'settlement-test',name),'utf8'),ctx,{filename:name});
  const normalize=ctx.window.KTS_SETTLEMENT_SHADOW_RUNTIME.normalizeReference;
  const cmp=ctx.window.KTS_SETTLEMENT_SHADOW.compareSettlement;
  const valid={totals:{xac:'9007199254740993',qua_co:'0',payout:0,final:'9007199254740993'},
    categories:[{code:'B',xac:'0.00',payout:'10.123456789012345678'}]};
  const result=normalize(valid);
  assert.equal(result.totals.xac,'9007199254740993','EXACT_AMOUNT_WAS_ROUNDED');
  assert.equal(result.totals.final,'9007199254740993');
  assert.equal(result.categories[0].payout,'10.123456789012345678');
  for(const bad of [false,true,[],{},' ','0x0','0b0','0o0','Infinity','1e999']){
    const a={totals:{xac:bad,qua_co:0,payout:0,final:0}};
    assert.throws(()=>normalize(a),/HIOSKT_REFERENCE_INVALID:xac/);
    const b={totals:{xac:0,qua_co:0,payout:0,final:0},
      categories:[{code:'B',payout:bad}]};
    assert.throws(()=>normalize(b),/HIOSKT_CATEGORY_INVALID:payout/);
  }
  const zero=normalize({totals:{xac:'0e999',qua_co:'0',payout:0,final:'-0'}});
  assert.equal(zero.totals.xac,'0e999');
  assert.equal(cmp({settlement_result:{total_xac:0,total_qua_co:0,total_payout:0,final_net:0}},zero).safe_to_promote,true);
});

test('matching exact strings cannot conceal contradictory displayed HIOSKT or local totals',()=>{
  const ctx={window:{}};
  vm.runInNewContext(readFileSync(resolve(root,'settlement-test','settlement-shadow.js'),'utf8'),ctx,{filename:'settlement-shadow.js'});
  const sh=ctx.window.KTS_SETTLEMENT_SHADOW;
  const result={settlement_result:{total_xac:0,total_qua_co:0,total_payout:0,final_net:0,
    exact:{total_xac:'0',total_qua_co:'0',total_payout:'0',final_net:'0'}}};
  const reference={totals:{xac:0,qua_co:0,payout:0,final:0,exact:{total_xac:'0',total_qua_co:'0',total_payout:'0',final_net:'0'}}};
  assert.equal(sh.compareSettlement(result,reference).safe_to_promote,true);
  const copy=x=>JSON.parse(JSON.stringify(x));
  const a=copy(reference);a.totals.exact.final_net='100';
  let compared=sh.compareSettlement(result,a);
  assert.equal(compared.safe_to_promote,false);
  assert.equal(compared.totals.final_net.reason,'REFERENCE_EXACT_DISPLAY_CONTRADICTION');
  const b=copy(result);b.settlement_result.exact.final_net='100';
  compared=sh.compareSettlement(b,reference);
  assert.equal(compared.safe_to_promote,false);
  assert.equal(compared.totals.final_net.reason,'LOCAL_EXACT_DISPLAY_CONTRADICTION');
  // Not every difference in decimal digits is a contradiction: an exact
  // amount legitimately displayed rounded to one decimal stays acceptable.
  const rounded=sh.compareNumber(0.1,0.1,{display_digits:1},'0.14','0.14');
  assert.equal(rounded.status,'MATCH_EXACT');
});

test('HIOSKT equivalent aliases may coexist but conflicting totals must never promote',()=>{
  const ctx={window:{}};
  vm.runInNewContext(readFileSync(resolve(root,'settlement-test','settlement-shadow.js'),'utf8'),ctx,{filename:'settlement-shadow.js'});
  const compare=ctx.window.KTS_SETTLEMENT_SHADOW.compareSettlement;
  const local={settlement_result:{total_xac:0,total_qua_co:0,total_payout:0,final_net:0}};
  const base={totals:{xac:0,qua_co:0,payout:0,final:0,total_xac:'0.00',total_qua_co:'0e0',total_payout:'0.0',final_net:'0'}};
  assert.equal(compare(local,base).safe_to_promote,true);
  const copy=x=>JSON.parse(JSON.stringify(x));
  for(const [label,edit] of [
    ['xac_conflict',x=>x.totals.total_xac=100],
    ['payout_conflict',x=>x.totals.total_payout='-10'],
    ['final_conflict',x=>x.totals.final_net='1'],
    ['nonnumeric_alias',x=>x.totals.total_xac='INVALID'],
    ['precision_alias',x=>{x.totals.final='9007199254740993';x.totals.final_net='9007199254740992';}]
  ]){
    const ref=copy(base);edit(ref);
    const verdict=compare(local,ref);
    assert.equal(verdict.safe_to_promote,false,'CONFLICTING_ALIAS_PROMOTED:'+label);
    assert.equal(verdict.invalid_total_alias_evidence,true);
    assert.equal(verdict.status,'INCOMPLETE_REFERENCE');
  }
});

test('golden message breakdown uses actual final runtime rows, never preview category rows',()=>{
  const ctx={window:{}};
  const copy=x=>JSON.parse(JSON.stringify(x));
  ctx.window.KTS_SETTLEMENT_ENGINE={
    version:'synthetic-final-row-engine',
    category:()=>{throw Error('PREVIEW_CATEGORY_MUST_NOT_RUN')},
    settle:(rows,terms)=>({rows:rows.map((row,i)=>({...row,final_money:10+i,
      applied_percent:String(terms.total_percent)})),final_net:21})
  };
  ctx.window.KTS_SETTLEMENT_EVALUATOR={
    evaluateCanonicalMessage:({canonical_payload})=>({category_inputs:canonical_payload.rows,detail_rows:[]})
  };
  ctx.window.KTS_SETTLEMENT_SHADOW={compareSettlement:()=>({safe_to_promote:true})};
  for(const f of ['settlement-feature-gates.js','settlement-runtime.js','settlement-regression-cases.js'])
    vm.runInNewContext(readFileSync(resolve(root,'settlement-test',f),'utf8'),ctx,{filename:f});
  const source={scope:{partner_id:'p',business_date:'2026-09-22',region:'mn'},
    partner_role:'customer',config_snapshot:{partner_id:'p',total_percent:'87'},
    lottery_result_snapshot:{complete:true},
    messages:[
      {id:'a',status:'parsed',canonical_payload:{rows:[{code:'B',numbers:'11'}],legs:[]}},
      {id:'b',status:'parsed',canonical_payload:{rows:[{code:'B',numbers:'22'}],legs:[]}}
    ],
    expected_reference:{totals:{xac:1,qua_co:1,payout:1,final:1}}};
  const x=ctx.window.KTS_SETTLEMENT_REGRESSION_CASES.replayCase(source).settlement;
  assert.equal(x.message_breakdown.length,2);
  assert.equal(x.message_breakdown[0].category_rows[0].final_money,10);
  assert.equal(x.message_breakdown[1].category_rows[0].final_money,11);
  assert.equal(x.message_breakdown[0].category_rows[0].applied_percent,'87');
  assert.equal(x.message_breakdown[0].category_rows[0].numbers,'11');
  assert.equal(x.message_breakdown[1].category_rows[0].numbers,'22');
  assert.equal(x.message_breakdown[0].start,undefined);
  assert.equal(x.message_breakdown[0].count,undefined);
  assert.deepEqual(copy(x.category_rows),copy(x.message_breakdown.flatMap(y=>y.category_rows)));
});

test('feature gate fails closed on whitespace padded Ủi and malformed evaluator rows',()=>{
  const ctx={window:{}};
  vm.runInNewContext(readFileSync(resolve(root,'settlement-test','settlement-feature-gates.js'),'utf8'),ctx,{filename:'settlement-feature-gates.js'});
  const gates=ctx.window.KTS_SETTLEMENT_FEATURE_GATES;
  const outcome=gates.guardEvaluation({category_inputs:[{code:'B',stake:2},{code:' UI ',stake:999}],
    detail_rows:[{code:' B ',numbers:'11'},{code:' uI ',numbers:'22'}]}, {tinh_ui:true});
  assert.equal(outcome.category_inputs.length,1);
  assert.equal(outcome.category_inputs[0].code,'B');
  assert.equal(outcome.detail_rows.length,1);
  assert.equal(outcome.detail_rows[0].numbers,'11');
  for(const row of [null,{},[],{code:''},{code:'   '},{code:1},'B']){
    assert.throws(()=>gates.guardCategoryRows([row],{}),/SETTLEMENT_CATEGORY_CODE_INVALID/);
    assert.throws(()=>gates.guardEvaluation({category_inputs:[{code:'B'}],detail_rows:[row]},{}),
      /SETTLEMENT_DETAIL_CODE_INVALID/);
  }
  assert.throws(()=>gates.guardEvaluation({category_inputs:[{code:'B'}],
    detail_rows:[{code:' MB_XIEN2 '}]},{mb_xien_234:false}),/MB_XIEN_234_NOT_ALLOWED/);
  assert.equal(gates.guardEvaluation({category_inputs:[{code:'B'}],
    detail_rows:[{code:'MB_XIEN2'}]},{mb_xien_234:true}).detail_rows.length,1);
});

test('shadow cannot promote omitted, empty, or ungrounded HIOSKT category claims',()=>{
  const ctx={window:{}};
  vm.runInNewContext(readFileSync(resolve(root,'settlement-test','settlement-shadow.js'),'utf8'),ctx,{filename:'settlement-shadow.js'});
  const compare=ctx.window.KTS_SETTLEMENT_SHADOW.compareSettlement;
  const local={settlement_result:{total_xac:0,total_qua_co:0,total_payout:0,final_net:0},
    category_rows:[{code:'B',xac:0,qua_co:0,hit_units:0,payout:0}]};
  const totals={xac:0,qua_co:0,payout:0,final:0};
  const good=compare(local,{totals,categories:[{code:' B ',xac:0,payout:0}]});
  assert.equal(good.safe_to_promote,true,'TRIMMED_CATEGORY_MATCH_SHOULD_PASS');
  for(const [label,categories] of [
    ['no_code',[{xac:0}]],
    ['blank_code',[{code:'   ',xac:0}]],
    ['reference_without_amount',[{code:'B'}]],
    ['reference_missing_locally',[{code:'DD',xac:0,payout:0}]]
  ]){
    const result=compare(local,{totals,categories});
    assert.equal(result.safe_to_promote,false,'UNSUPPORTED_CATEGORY_PROMOTED:'+label);
    assert.equal(result.status,'INCOMPLETE_REFERENCE','UNSUPPORTED_CATEGORY_STATUS:'+label);
  }
  const extraLocal={...local,category_rows:[...local.category_rows,{code:'DD',xac:0}]};
  assert.equal(compare(extraLocal,{totals,categories:[{code:'B',xac:0}]}).safe_to_promote,true,
    'PARTIAL_BUT_VALID_CATEGORY_REFERENCE_SHOULD_REMAIN_COMPATIBLE');
});

test('tiny money differences and reference-only exact evidence cannot be promoted as exact',()=>{
  const ctx={window:{}};
  vm.runInNewContext(readFileSync(resolve(root,'settlement-test','settlement-shadow.js'),'utf8'),ctx,{filename:'settlement-shadow.js'});
  const s=ctx.window.KTS_SETTLEMENT_SHADOW;
  const local={settlement_result:{total_xac:0,total_qua_co:0,total_payout:0,final_net:0}};
  const zero={totals:{xac:0,qua_co:0,payout:0,final:0}};
  assert.equal(s.compareSettlement(local,zero).safe_to_promote,true);
  const tiny=s.compareSettlement(local,{totals:{...zero.totals,final:'0.000000001'}});
  assert.equal(tiny.safe_to_promote,false,'SUB_CENT_TOLERANCE_PROMOTED_MONEY');
  assert.equal(tiny.required_totals_exact,false);
  assert.equal(tiny.totals.final_net.status,'MATCH_DISPLAY');
  const onlyRefExact=s.compareSettlement(local,{totals:{...zero.totals,
    exact:{final_net:'0.04'},final:0}});
  assert.equal(onlyRefExact.safe_to_promote,false,'REFERENCE_ONLY_EXACT_PROMOTED');
  assert.equal(onlyRefExact.totals.final_net.status,'MATCH_DISPLAY');
  assert.equal(s.compareNumber(0,0.000000001,{tolerance:1}).status,'MATCH_DISPLAY');
  assert.equal(s.compareNumber(0.1,0.1).status,'MATCH_EXACT');
  assert.equal(s.compareNumber('0.10','0.1000').status,'MATCH_EXACT');
});

test('HIOSKT compare requires an atomic settlement CAS and never writes stale shadow evidence',async()=>{
  const ctx={window:{}},copy=x=>JSON.parse(JSON.stringify(x));
  for(const f of ['settlement-shadow.js','settlement-shadow-runtime.js'])
    vm.runInNewContext(readFileSync(resolve(root,'settlement-test',f),'utf8'),ctx,{filename:f});
  const original={id:'scope:p:2026-09-22:mn',partner_id:'p',business_date:'2026-09-22',region:'mn',
    scope_status:'complete_unverified',created_at:'2026-09-22T09:00:00Z',
    settlement_result:{total_xac:0,total_qua_co:0,total_payout:0,final_net:0},comparison_status:'unverified'};
  let current=copy(original),writes=0,receipts=0,changeBeforeCommit=false;
  ctx.window.KTS_SETTLEMENT_STORE={
    STORES:{settlements:'settlements',messages:'messages',partners:'partners'},
    get:async()=>copy(current),
    saveSettlement:async()=>{throw Error('UNSAFE_BLIND_SETTLEMENT_WRITE')},
    saveSettlementIfUnchanged:async(v,expected)=>{
      if(changeBeforeCommit)current={...current,settlement_result:{...current.settlement_result,final_net:100}};
      if(JSON.stringify(current)!==JSON.stringify(expected))return {saved:null,superseded:true};
      writes++;current=copy(v);return {saved:copy(v),superseded:false};
    },
    saveShadowEvent:async receipt=>{receipts++;return receipt;}
  };
  const sr=ctx.window.KTS_SETTLEMENT_SHADOW_RUNTIME;
  const request={partner_id:'p',business_date:'2026-09-22',region:'mn',
    reference_snapshot:{totals:{xac:0,qua_co:0,payout:0,final:0}}};
  changeBeforeCommit=true;
  await assert.rejects(()=>sr.compareAndSave(request),/SHADOW_SCOPE_CHANGED_DURING_COMPARISON/);
  assert.equal(writes,0);assert.equal(receipts,0);
  assert.equal(current.settlement_result.final_net,100);
  changeBeforeCommit=false;current=copy(original);
  const ok=await sr.compareAndSave(request);
  assert.equal(ok.comparison.safe_to_promote,true);
  assert.equal(writes,1);assert.equal(receipts,1);
});
test('settlement store CAS serializes snapshot check and write in a readwrite transaction',async()=>{
  const clone=x=>JSON.parse(JSON.stringify(x));
  let state=null,writes=0,transactionTypes=[];
  const fakeDb={
    close:()=>{},
    transaction:(name,mode)=>{
      transactionTypes.push([name,mode]);
      const tx={oncomplete:null,onerror:null,onabort:null};
      tx.objectStore=()=>({
        get:id=>{
          const req={result:null,onsuccess:null,onerror:null};
          Promise.resolve().then(()=>{
            req.result=clone(state);req.onsuccess();
            Promise.resolve().then(()=>tx.oncomplete());
          });
          return req;
        },
        put:v=>{writes++;state=clone(v);}
      });
      return tx;
    }
  };
  const ctx={window:{indexedDB:{open:()=>{
    const req={onsuccess:null,onerror:null,onupgradeneeded:null,result:null};
    Promise.resolve().then(()=>{req.result=fakeDb;req.onsuccess();});
    return req;
  }}}};
  vm.runInNewContext(readFileSync(resolve(root,'settlement-test','settlement-store.js'),'utf8'),ctx,
    {filename:'settlement-store.js'});
  const s=ctx.window.KTS_SETTLEMENT_STORE;
  const base={id:'scope:p:2026-09-22:mn',partner_id:'p',business_date:'2026-09-22',region:'mn',
    created_at:'2026-09-22T09:00:00Z',updated_at:'2026-09-22T09:00:00Z',
    scope_status:'complete_unverified',comparison_status:'unverified',settlement_result:{final_net:10}};
  state=clone(base);
  let out=await s.saveSettlementIfUnchanged({...base,comparison_status:'MATCH_EXACT'},clone(base));
  assert.equal(out.superseded,false);
  assert.equal(state.comparison_status,'MATCH_EXACT');
  assert.equal(writes,1);
  const saved=clone(state);
  state=clone({...saved,settlement_result:{final_net:20}});
  out=await s.saveSettlementIfUnchanged({...saved,comparison_status:'MATCH_DISPLAY_ONLY'},saved);
  assert.equal(out.superseded,true);
  assert.equal(state.settlement_result.final_net,20);
  assert.equal(writes,1);
  assert.ok(transactionTypes.every(([store,mode])=>store==='settlements'&&mode==='readwrite'));
});

test('malformed exact metadata shapes cannot hide missing monetary evidence',()=>{
  const ctx={window:{}};
  vm.runInNewContext(readFileSync(resolve(root,'settlement-test','settlement-shadow.js'),'utf8'),ctx,{filename:'settlement-shadow.js'});
  const compare=ctx.window.KTS_SETTLEMENT_SHADOW.compareSettlement;
  const local={settlement_result:{total_xac:0,total_qua_co:0,total_payout:0,final_net:0},
    category_rows:[{code:'B',xac:0,payout:0}]};
  const ref={totals:{xac:0,qua_co:0,payout:0,final:0},categories:[{code:'B',xac:0,payout:0}]};
  const clone=x=>JSON.parse(JSON.stringify(x));
  assert.equal(compare(local,ref).safe_to_promote,true);
  for(const [name,modify] of [
    ['local_exact_text',x=>x.local.settlement_result.exact='invalid'],
    ['local_exact_array',x=>x.local.settlement_result.exact=['0']],
    ['reference_exact_text',x=>x.ref.totals.exact='invalid'],
    ['reference_exact_array',x=>x.ref.totals.exact=['0']]
  ]){
    const x={local:clone(local),ref:clone(ref)};modify(x);
    const verdict=compare(x.local,x.ref);
    assert.equal(verdict.safe_to_promote,false,'INVALID_TOTAL_EXACT_METADATA_PROMOTED:'+name);
    assert.equal(verdict.invalid_exact_metadata,true);
    assert.equal(verdict.status,'INCOMPLETE_REFERENCE');
  }
  for(const [name,modify] of [
    ['local_category_exact',x=>x.local.category_rows[0].exact='bad'],
    ['local_category_array',x=>x.local.category_rows[0].exact=[]],
    ['reference_category_exact',x=>x.ref.categories[0].exact='bad'],
    ['reference_category_array',x=>x.ref.categories[0].exact=[]]
  ]){
    const x={local:clone(local),ref:clone(ref)};modify(x);
    const verdict=compare(x.local,x.ref);
    assert.equal(verdict.safe_to_promote,false,'INVALID_CATEGORY_EXACT_METADATA_PROMOTED:'+name);
    assert.equal(verdict.invalid_category_evidence,true);
    assert.equal(verdict.status,'INCOMPLETE_REFERENCE');
  }
});

test('wrong-partner config corrected before BLOCKED save supersedes stale decision',async()=>{
  const ctx={window:{}},copy=x=>JSON.parse(JSON.stringify(x));
  const scope={partner_id:'synthetic',business_date:'2026-09-22',region:'mn'};
  const msg={...scope,id:'msg1',status:'parsed',canonical_payload:{region:'mn',legs:[{code:'2CB'}]}};
  const wrong={id:'cfg-1',partner_id:'other',version:1};
  const fixed={id:'cfg-2',partner_id:'synthetic',version:2};
  let calls=0,repair=false,writes=[];
  ctx.window.KTS_SETTLEMENT_STORE={
    STORES:{messages:'messages',results:'results',partners:'partners'},
    getAll:async()=>[copy(msg)],
    resolveConfigForDate:async()=>{calls++;return copy(repair&&calls>=2?fixed:wrong);},
    get:async()=>null,
    saveSettlement:async row=>{
      if(row.config_snapshot && row.config_snapshot.partner_id!==row.partner_id)
        throw Error('CONFIG_PARTNER_MISMATCH');
      writes.push(row);return row;
    },
    saveSettlementIfScopeUnchanged:async row=>({saved:await ctx.window.KTS_SETTLEMENT_STORE.saveSettlement(row),superseded:false}),
  };
  ctx.window.KTS_SETTLEMENT_EVALUATOR={evaluateCanonicalMessage:()=>{throw Error('SHOULD_NOT_EVALUATE')}};
  ctx.window.KTS_SETTLEMENT_RUNTIME={settleWithConfig:()=>{throw Error('SHOULD_NOT_CALCULATE')}};
  ctx.window.KTS_SETTLEMENT_ENGINE={version:'synthetic'};
  for(const name of ['settlement-feature-gates.js','settlement-pipeline.js'])
    vm.runInNewContext(readFileSync(resolve(root,'settlement-test',name),'utf8'),ctx,{filename:name});
  const settle=ctx.window.KTS_SETTLEMENT_PIPELINE.settleScope;
  repair=true;calls=0;writes=[];
  let outcome=await settle(scope);
  assert.equal(outcome.status,'superseded','CORRECTED_CONFIG_MUST_NOT_SAVE_STALE_BLOCK');
  assert.equal(writes.length,0);
  assert.equal(calls,2);
  repair=false;calls=0;writes=[];
  outcome=await settle(scope);
  assert.equal(outcome.status,'blocked');
  assert.equal(outcome.reason,'CONFIG_PARTNER_MISMATCH');
  assert.equal(writes.length,1);
  assert.equal(writes[0].config_snapshot,null,'FOREIGN_CONFIG_MUST_NOT_BE_PERSISTED');
});

test('invalid runtime row count cannot save stale BLOCKED after partner role correction',async()=>{
  const ctx={window:{}},copy=x=>JSON.parse(JSON.stringify(x));
  const scope={partner_id:'synthetic',business_date:'2026-09-22',region:'mn'};
  const msg={...scope,id:'m1',status:'parsed',canonical_payload:{region:'mn',legs:[{code:'2CB'}]}};
  const config={id:'cfg',partner_id:'synthetic',version:1};
  const result={business_date:'2026-09-22',region:'mn',complete:true};
  let partner={id:'synthetic',name:'User',role:'customer',active:true},correct=false,writes=[];
  ctx.window.KTS_SETTLEMENT_STORE={
    STORES:{messages:'messages',results:'results',partners:'partners'},
    getAll:async()=>[copy(msg)],
    resolveConfigForDate:async()=>copy(config),
    get:async name=>name==='results'?copy(result):name==='partners'?copy(partner):null,
    saveSettlement:async row=>{writes.push(row);return row;},
    saveSettlementIfScopeUnchanged:async row=>({saved:await ctx.window.KTS_SETTLEMENT_STORE.saveSettlement(row),superseded:false}),
  };
  ctx.window.KTS_SETTLEMENT_EVALUATOR={evaluateCanonicalMessage:()=>({category_inputs:[{code:'2CB'}],detail_rows:[]})};
  ctx.window.KTS_SETTLEMENT_RUNTIME={settleWithConfig:()=>{
    if(correct)partner.role='owner';
    return {rows:[]};
  }};
  ctx.window.KTS_SETTLEMENT_ENGINE={version:'synthetic'};
  for(const name of ['settlement-feature-gates.js','settlement-pipeline.js'])
    vm.runInNewContext(readFileSync(resolve(root,'settlement-test',name),'utf8'),ctx,{filename:name});
  const settle=ctx.window.KTS_SETTLEMENT_PIPELINE.settleScope;
  correct=true;writes=[];partner.role='customer';
  let x=await settle(scope);
  assert.equal(x.status,'superseded');
  assert.equal(writes.length,0);
  correct=false;writes=[];partner.role='customer';
  x=await settle(scope);
  assert.equal(x.status,'blocked');
  assert.equal(x.reason,'SETTLEMENT_CATEGORY_ROW_COUNT_MISMATCH');
  assert.equal(writes.length,1);
});

test('HIOSKT partial category references compare only fields explicitly observed',()=>{
  const ctx={window:{}};
  vm.runInNewContext(readFileSync(resolve(root,'settlement-test','settlement-shadow.js'),'utf8'),ctx,{filename:'settlement-shadow.js'});
  const compare=ctx.window.KTS_SETTLEMENT_SHADOW.compareSettlement;
  const totals={xac:0,qua_co:0,payout:0,final:0};
  const local={settlement_result:{total_xac:0,total_qua_co:0,total_payout:0,final_net:0},
    category_rows:[{code:'B',xac:0,payout:100}]};
  const partial=compare(local,{totals,categories:[{code:'B',xac:0}]});
  assert.equal(partial.safe_to_promote,true,'OMITTED_REFERENCE_PAYOUT_WAS_FABRICATED');
  assert.equal(partial.categories[0].fields.payout,undefined);
  assert.equal(partial.categories[0].fields.xac.status,'MATCH_EXACT');
  const absentLocal={...local,category_rows:[{code:'B',payout:0}]};
  const missing=compare(absentLocal,{totals,categories:[{code:'B',xac:0}]});
  assert.equal(missing.safe_to_promote,false,'MISSING_LOCAL_XAC_WAS_TREATED_AS_ZERO');
  assert.equal(missing.categories[0].status,'NOT_COMPARABLE');
  assert.equal(missing.categories[0].fields.xac.reason,'LOCAL_CATEGORY_FIELD_MISSING');
  const duplicate=compare({...local,category_rows:[{code:'B',xac:0,payout:20},{code:'B',xac:0,payout:80}]},
    {totals,categories:[{code:'B',xac:0},{code:'B',payout:100}]});
  assert.equal(duplicate.safe_to_promote,true,'DUPLICATE_CATEGORY_FIELDS_SHOULD_AGGREGATE');
  assert.equal(duplicate.categories[0].fields.payout.status,'MATCH_EXACT');
});

test('HIOSKT shadow status cannot claim MATCH_EXACT with missing monetary field evidence',()=>{
  const ctx={window:{}};
  vm.runInNewContext(readFileSync(resolve(root,'settlement-test','settlement-shadow.js'),'utf8'),ctx,{filename:'settlement-shadow.js'});
  const compare=ctx.window.KTS_SETTLEMENT_SHADOW.compareSettlement;
  const totals={xac:0,qua_co:0,payout:0,final:0};
  const base={settlement_result:{total_xac:0,total_qua_co:0,total_payout:0,final_net:0},
    category_rows:[{code:'B',payout:0}]};
  const missingCategory=compare(base,{totals,categories:[{code:'B',xac:0}]});
  assert.equal(missingCategory.status,'INCOMPLETE_REFERENCE');
  assert.equal(missingCategory.missing_monetary_evidence,true);
  assert.equal(missingCategory.exact,false);
  assert.equal(missingCategory.safe_to_promote,false);
  const missingTotal=compare({settlement_result:{total_xac:0,total_qua_co:0,final_net:0}},
    {totals});
  assert.equal(missingTotal.status,'INCOMPLETE_REFERENCE');
  assert.equal(missingTotal.missing_monetary_evidence,true);
  assert.equal(missingTotal.exact,false);
  assert.equal(missingTotal.safe_to_promote,false);
  const valid=compare({...base,category_rows:[{code:'B',xac:0,payout:0}]},
    {totals,categories:[{code:'B',xac:0}]});
  assert.equal(valid.status,'MATCH_EXACT');
  assert.equal(valid.missing_monetary_evidence,false);
  assert.equal(valid.safe_to_promote,true);
});

test('two wrong exact category rows cannot cancel and fake matching aggregate money',()=>{
  const ctx={window:{}};
  vm.runInNewContext(readFileSync(resolve(root,'settlement-test','settlement-shadow.js'),'utf8'),ctx,{filename:'settlement-shadow.js'});
  const compare=ctx.window.KTS_SETTLEMENT_SHADOW.compareSettlement;
  const totals={xac:0,qua_co:0,payout:0,final:0};
  const local={settlement_result:{total_xac:0,total_qua_co:0,total_payout:0,final_net:0},
    category_rows:[{code:'B',xac:100,exact:{xac:'0'}},{code:'B',xac:0,exact:{xac:'100'}}]};
  const oracle={totals,categories:[{code:'B',xac:100,exact:{xac:'100'}}]};
  const invalid=compare(local,oracle);
  assert.equal(invalid.safe_to_promote,false,'WRONG_PER_ROW_EXACT_CANCELLED_OUT');
  assert.equal(invalid.invalid_category_evidence,true);
  assert.equal(invalid.status,'INCOMPLETE_REFERENCE');
  const copy=x=>JSON.parse(JSON.stringify(x));
  const orphan=copy(local);orphan.category_rows=[{code:'B',exact:{xac:'0'},payout:0}];
  assert.equal(compare(orphan,{totals,categories:[{code:'B',payout:0}]}).safe_to_promote,false,
    'ORPHAN_EXACT_WITHOUT_VISIBLE_FIELD_MUST_BLOCK');
  const rounded=copy(local);rounded.category_rows=[
    {code:'B',xac:0.1,exact:{xac:'0.14'}}
  ];
  const roundedRef={totals,categories:[{code:'B',xac:0.1,exact:{xac:'0.14'}}]};
  assert.equal(compare(rounded,roundedRef,{display_digits:1}).safe_to_promote,true,
    'LEGITIMATELY_ROUNDED_ROWS_MUST_REMAIN_SUPPORTED');
});

test('malformed category container never masquerades as absent HIOSKT evidence',()=>{
  const ctx={window:{}};
  for(const name of ['settlement-shadow.js','settlement-shadow-runtime.js'])
    vm.runInNewContext(readFileSync(resolve(root,'settlement-test',name),'utf8'),ctx,{filename:name});
  const compare=ctx.window.KTS_SETTLEMENT_SHADOW.compareSettlement;
  const normalize=ctx.window.KTS_SETTLEMENT_SHADOW_RUNTIME.normalizeReference;
  const local={settlement_result:{total_xac:0,total_qua_co:0,total_payout:0,final_net:0}};
  const totals={xac:0,qua_co:0,payout:0,final:0};
  assert.equal(compare(local,{totals}).safe_to_promote,true);
  for(const invalid of [{B:{xac:1}},null,0,'invalid',true]){
    const reference={totals,categories:invalid};
    const verdict=compare(local,reference);
    assert.equal(verdict.status,'INCOMPLETE_REFERENCE');
    assert.equal(verdict.invalid_category_evidence,true);
    assert.equal(verdict.safe_to_promote,false);
    assert.throws(()=>normalize(reference),/HIOSKT_CATEGORIES_INVALID/);
    const corrupted={...local,category_rows:invalid};
    const localVerdict=compare(corrupted,{totals});
    assert.equal(localVerdict.invalid_category_evidence,true);
    assert.equal(localVerdict.safe_to_promote,false);
  }
  assert.equal(compare(local,{totals,categories:[]}).safe_to_promote,true);
  assert.equal(normalize({totals,categories:[]}).categories.length,0);
});

test('HIOSKT mismatch diagnostics must surface incomparable category evidence',()=>{
  const ctx={window:{}};
  vm.runInNewContext(readFileSync(resolve(root,'settlement-test','settlement-shadow.js'),'utf8'),ctx,{filename:'settlement-shadow.js'});
  const sh=ctx.window.KTS_SETTLEMENT_SHADOW;
  const local={settlement_result:{total_xac:0,total_qua_co:0,total_payout:0,final_net:0},
    category_rows:[{code:'B',payout:0}],
    message_breakdown:[{message_id:'m-01',category_rows:[{code:'B',payout:0}]}]};
  const ref={totals:{xac:0,qua_co:0,payout:0,final:0},categories:[{code:'B',xac:0}]};
  const comp=sh.compareSettlement(local,ref);
  assert.equal(comp.status,'INCOMPLETE_REFERENCE');
  assert.equal(comp.safe_to_promote,false);
  const diag=sh.buildMismatchDiagnostics(local,comp);
  assert.equal(diag.has_actionable_category_issue,true,'INCOMPARABLE_MONEY_WAS_HIDDEN');
  assert.equal(diag.category_issues.length,1);
  assert.equal(diag.category_issues[0].code,'B');
  assert.equal(diag.category_issues[0].status,'NOT_COMPARABLE');
  assert.equal(diag.category_issues[0].fields[0].field,'xac');
  assert.equal(diag.category_issues[0].fields[0].reason,'LOCAL_CATEGORY_FIELD_MISSING');
  assert.deepEqual(Array.from(diag.category_issues[0].message_ids),['m-01']);
  const d=sh.buildMismatchDiagnostics(local,{status:'INCOMPLETE_REFERENCE',totals:{
    total_xac:{status:'NOT_COMPARABLE',reason:'INVALID_EXACT_MONETARY_EVIDENCE',local:0,reference:0,delta:0}},categories:[]});
  assert.equal(d.total_issues[0].reason,'INVALID_EXACT_MONETARY_EVIDENCE');
});

test('invalid display precision never makes a monetary comparison promotable',()=>{
  const ctx={window:{}};
  vm.runInNewContext(readFileSync(resolve(root,'settlement-test','settlement-shadow.js'),'utf8'),ctx,{filename:'settlement-shadow.js'});
  const s=ctx.window.KTS_SETTLEMENT_SHADOW;
  const local={settlement_result:{total_xac:0,total_qua_co:0,total_payout:0,final_net:0,
    exact:{total_xac:'0',total_qua_co:'0',total_payout:'0',final_net:'0'}}};
  const ref={totals:{xac:0,qua_co:0,payout:0,final:0}};
  assert.equal(s.compareSettlement(local,ref).safe_to_promote,true);
  for(const invalid of [NaN,Infinity,-1,1000,'','no','NaN',true,false,{},[],12.5]){
    const opts={display_digits:invalid};
    const compared=s.compareSettlement(local,ref,opts);
    assert.equal(compared.safe_to_promote,false,'PROMOTED_INVALID_PRECISION:'+String(invalid));
    assert.equal(compared.invalid_display_precision,true);
    assert.equal(compared.status,'INCOMPLETE_REFERENCE');
    assert.equal(s.compareNumber(0,0,opts,'0','0').reason,'INVALID_DISPLAY_PRECISION');
  }
  for(const valid of [0,1,'2',12])
    assert.equal(s.compareSettlement(local,ref,{display_digits:valid}).safe_to_promote,true);
});

test('HIOSKT manual reference must not discard supplied exact monetary proof',()=>{
  const ctx={window:{}};
  for (const name of ['settlement-shadow.js','settlement-shadow-runtime.js'])
    vm.runInNewContext(readFileSync(resolve(root,'settlement-test',name),'utf8'),ctx,{filename:name});
  const norm=ctx.window.KTS_SETTLEMENT_SHADOW_RUNTIME.normalizeReference;
  const compare=ctx.window.KTS_SETTLEMENT_SHADOW.compareSettlement;
  const local={settlement_result:{total_xac:0,total_qua_co:0,total_payout:0,final_net:0},
    category_rows:[{code:'B',xac:0}]};
  const src={totals:{xac:0,qua_co:0,payout:0,final:0,exact:{xac:'1.00'}},
    categories:[{code:'B',xac:0,exact:{xac:'1.00'}}]};
  const normalized=norm(src);
  assert.equal(normalized.totals.exact.total_xac,'1.00');
  assert.equal(normalized.categories[0].exact.xac,'1.00');
  assert.equal(compare(local,normalized).safe_to_promote,false);
  const onlyTotals=norm({totals:{xac:0,qua_co:0,payout:0,final:0,exact:{xac:'1.00'}}});
  const outcome=compare(local,onlyTotals);
  assert.equal(outcome.safe_to_promote,false);
  assert.equal(outcome.totals.total_xac.reason,'REFERENCE_EXACT_DISPLAY_CONTRADICTION');
  for (const bad of [false,[],null,'invalid']){
    assert.throws(()=>norm({totals:{xac:0,exact:bad}}),/HIOSKT_TOTAL_EXACT_INVALID/);
    assert.throws(()=>norm({categories:[{code:'B',xac:0,exact:bad}]}),/HIOSKT_CATEGORY_EXACT_INVALID/);
  }
  const valid=norm({totals:{xac:0,qua_co:0,payout:0,final:0,exact:{xac:'0'}},
    categories:[{code:'B',xac:0,exact:{xac:'0'}}]});
  assert.equal(compare(local,valid).safe_to_promote,true);
});

test('HIOSKT normalization keeps all money aliases and rejects nested or root contradictions',()=>{
  const ctx={window:{}};
  for(const file of ['settlement-shadow.js','settlement-shadow-runtime.js'])
    vm.runInNewContext(readFileSync(resolve(root,'settlement-test',file),'utf8'),ctx,{filename:file});
  const normalize=ctx.window.KTS_SETTLEMENT_SHADOW_RUNTIME.normalizeReference;
  const compare=ctx.window.KTS_SETTLEMENT_SHADOW.compareSettlement;
  const local={settlement_result:{total_xac:0,total_qua_co:0,total_payout:0,final_net:0}};
  const input={totals:{xac:'0',total_xac:'0.00',qua_co:0,payout:0,final:0},total_xac:'0e0'};
  const valid=normalize(input);
  assert.equal(valid.totals.xac,'0');
  assert.equal(valid.totals.total_xac,'0.00');
  assert.equal(compare(local,valid).safe_to_promote,true);
  for(const conflict of [
    {totals:{xac:0,total_xac:'1',qua_co:0,payout:0,final:0}},
    {totals:{xac:0,qua_co:0,payout:0,final:0},total_xac:'3'},
    {totals:{xac:0,qua_co:0,payout:0,final:0},xac:'4'}
  ]) assert.throws(()=>normalize(conflict),/HIOSKT_TOTAL_ALIAS_CONFLICT:xac/);
  const exact=normalize({totals:{xac:0,qua_co:0,payout:0,final:0,
    exact:{total_xac:'0',xac:'0.00'}}});
  assert.equal(ctx.window.KTS_SETTLEMENT_SHADOW.decimalCanonical(exact.totals.exact.total_xac),'0');
  assert.equal(compare(local,exact).safe_to_promote,true);
  assert.throws(()=>normalize({totals:[]}),/HIOSKT_TOTALS_INVALID/);
});

test('category aggregation preserves input exact strings beyond IEEE-754 precision',()=>{
  const ctx={window:{}};
  vm.runInNewContext(readFileSync(resolve(root,'settlement-test','settlement-shadow.js'),'utf8'),ctx,{filename:'settlement-shadow.js'});
  const compare=ctx.window.KTS_SETTLEMENT_SHADOW.compareSettlement;
  const totals={xac:0,qua_co:0,payout:0,final:0};
  const local={settlement_result:{total_xac:0,total_qua_co:0,total_payout:0,final_net:0},
    category_rows:[{code:'B',xac:9007199254740992}]};
  const reference={totals,categories:[{code:'B',xac:'9007199254740993'}]};
  const diff=compare(local,reference);
  assert.equal(diff.safe_to_promote,false,'ROUNDED_BIG_INTEGER_PROMOTED');
  assert.equal(diff.categories[0].fields.xac.status,'MATCH_DISPLAY');
  assert.equal(diff.categories[0].fields.xac.reference_exact,'9007199254740993');
  const longDecimal=compare({...local,category_rows:[{code:'B',payout:0.1}]},
    {totals,categories:[{code:'B',payout:'0.10000000000000001'}]});
  assert.equal(longDecimal.safe_to_promote,false,'LONG_DECIMAL_PREMATURELY_ROUNDED');
  assert.equal(compare({...local,category_rows:[{code:'B',xac:'9007199254740993'}]},reference).safe_to_promote,true);
});

test('contradictory category code/category aliases fail closed in direct shadow and manual reference',()=>{
  const ctx={window:{}};
  for(const name of ['settlement-shadow.js','settlement-shadow-runtime.js'])
    vm.runInNewContext(readFileSync(resolve(root,'settlement-test',name),'utf8'),ctx,{filename:name});
  const shadow=ctx.window.KTS_SETTLEMENT_SHADOW;
  const normal=ctx.window.KTS_SETTLEMENT_SHADOW_RUNTIME.normalizeReference;
  const local={settlement_result:{total_xac:0,total_qua_co:0,total_payout:0,final_net:0},
    category_rows:[{code:'B',xac:0,payout:0}]};
  const totals={xac:0,qua_co:0,payout:0,final:0};
  const valid=shadow.compareSettlement(local,{totals,categories:[{code:'B',category:' b ',xac:0}]});
  assert.equal(valid.safe_to_promote,true,'EQUIVALENT_CATEGORY_ALIASES');
  const mismatched=shadow.compareSettlement(local,{totals,categories:[{code:'B',category:'DD',xac:0}]});
  assert.equal(mismatched.safe_to_promote,false,'CONFLICTING_CATEGORY_ALIAS_PROMOTED');
  assert.equal(mismatched.invalid_category_evidence,true);
  const localConflict=shadow.compareSettlement({...local,category_rows:[{code:'B',category:'DD',xac:0}]},
    {totals,categories:[{code:'B',xac:0}]});
  assert.equal(localConflict.safe_to_promote,false,'LOCAL_CONFLICTING_CATEGORY_PROMOTED');
  assert.throws(()=>normal({totals,categories:[{code:'B',category:'DD',xac:0}]}),
    /HIOSKT_CATEGORY_LABEL_CONFLICT/);
  assert.equal(normal({totals,categories:[{code:' b ',category:'B',xac:0}]}).categories[0].code,'B');
  for(const code of ['  ',17,{},[]])
    assert.throws(()=>normal({totals,categories:[{code,xac:0}]}),/HIOSKT_CATEGORY_CODE_REQUIRED/);
});

test('direct shadow comparison rejects contradictory exact total aliases without HIOSKT normalization',()=>{
  const ctx={window:{}};
  vm.runInNewContext(readFileSync(resolve(root,'settlement-test','settlement-shadow.js'),'utf8'),ctx,{filename:'settlement-shadow.js'});
  const compare=ctx.window.KTS_SETTLEMENT_SHADOW.compareSettlement;
  const local={settlement_result:{total_xac:0,total_qua_co:0,total_payout:0,final_net:0,
    exact:{total_xac:'0',total_qua_co:'0',total_payout:'0',final_net:'0'}}};
  const reference={totals:{xac:0,qua_co:0,payout:0,final:0,exact:{total_xac:'0',total_qua_co:'0',total_payout:'0',final_net:'0'}}};
  assert.equal(compare(local,reference).safe_to_promote,true);
  const clone=x=>JSON.parse(JSON.stringify(x));
  for(const [name,mutate] of [
    ['reference_conflict',x=>x.ref.totals.exact.xac='1'],
    ['local_conflict',x=>x.local.settlement_result.exact.xac='1'],
    ['reference_bad',x=>x.ref.totals.exact.xac=false],
    ['local_blank',x=>x.local.settlement_result.exact.xac='  '],
    ['reference_overflow',x=>x.ref.totals.exact.xac='1e999']
  ]){
    const v={local:clone(local),ref:clone(reference)};mutate(v);
    const result=compare(v.local,v.ref);
    assert.equal(result.safe_to_promote,false,'INVALID_EXACT_ALIAS_PROMOTED:'+name);
    assert.equal(result.invalid_exact_alias_evidence,true,'EXACT_ALIAS_MISSED:'+name);
    assert.equal(result.status,'INCOMPLETE_REFERENCE');
  }
  const compatible=clone(reference);
  compatible.totals.exact={xac:'0.00',qua_co:'0e0',payout:'0',final:'-0'};
  const result=compare(local,compatible);
  assert.equal(result.safe_to_promote,true,'SINGLE_EQUIVALENT_SHORTHAND_EXACT_ACCEPTED');
  assert.equal(result.totals.total_xac.reference_exact,'0');
});

test('direct HIOSKT shadow refuses unknown exact monetary keys but allows engine metadata',()=>{
  const ctx={window:{}};
  vm.runInNewContext(readFileSync(resolve(root,'settlement-test','settlement-shadow.js'),'utf8'),ctx,{filename:'settlement-shadow.js'});
  const compare=ctx.window.KTS_SETTLEMENT_SHADOW.compareSettlement;
  const local={settlement_result:{total_xac:0,total_qua_co:0,total_payout:0,final_net:0,
    exact:{total_xac:'0',total_qua_co:'0',total_payout:'0',final_net:'0',gross_net:'0',total_percent:'100'}},
    category_rows:[{code:'B',xac:0,payout:0,exact:{xac:'0',payout:'0',win_rate:'1',commission_value:'0'}}]};
  const ref={totals:{xac:0,qua_co:0,payout:0,final:0,exact:{total_xac:'0'}},
    categories:[{code:'B',xac:0,payout:0,exact:{xac:'0',payout:'0'}}]};
  assert.equal(compare(local,ref).safe_to_promote,true,'SUPPORTED_LOCAL_ENGINE_EXTRA_EXACT');
  const clone=x=>JSON.parse(JSON.stringify(x));
  for(const [name,mutate] of [
    ['unknown_total_exact',x=>x.totals.exact.unapproved='100'],
    ['unknown_category_exact',x=>x.categories[0].exact.extra_money='100']
  ]){
    const v=clone(ref);mutate(v);
    const outcome=compare(local,v);
    assert.equal(outcome.safe_to_promote,false,'UNKNOWN_ORACLE_EXACT_PROMOTED:'+name);
    assert.equal(outcome.invalid_reference_exact_schema,true);
    assert.equal(outcome.status,'INCOMPLETE_REFERENCE');
  }
});

test('real IndexedDB browser smoke embedded scripts parse before Chrome startup',()=>{
  const html=readFileSync(resolve(root,'settlement-test','qualification-indexeddb-smoke.html'),'utf8');
  const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map(match=>match[1]).filter(text=>text.trim());
  assert.ok(scripts.length>=2,'MISSING_BROWSER_INLINE_SCRIPTS');
  for(let i=0;i<scripts.length;i++)
    assert.doesNotThrow(()=>new vm.Script(scripts[i],{
      filename:'qualification-indexeddb-smoke.html#inline-'+i
    }), 'INVALID_BROWSER_INLINE_SCRIPT_'+i);
});


const evidenceGate=require('./settlement-real-evidence-gate.cjs');
function syntheticEvidence(count=65){
  return {format:evidenceGate.FORMAT,feature_head:'a'.repeat(40),
    cases:Array.from({length:count},(_,i)=>({
      case_id:'SYNTHETIC-'+i,
      scope:{partner_id:'synthetic-partner',business_date:'2026-09-22',region:'mn'},
      kts:{source_sha256:'b'.repeat(64),source_ref:'SYNTHETIC_KTS',
        totals:{xac:'0',qua_co:'0',payout:'0',final:'0'}},
      hioskt:{source_sha256:'c'.repeat(64),source_ref:'SYNTHETIC_NOT_A_REAL_HIOSKT_ORACLE',
        totals:{xac:'0',qua_co:'0',payout:'0',final:'0'}},
      mapping:{method:'operator_verified',review_ref:'SYNTHETIC_ONLY'}
    }))}
}
test('real HIOSKT gate cannot convert missing data or 14 local checks into monetary zero',()=>{
  const result=evidenceGate.auditEvidence(null,{expectedHead:'a'.repeat(40)});
  assert.equal(result.monetary_mismatch_count,'NOT_COMPARABLE');
  assert.equal(result.real_history_65_status,'BLOCKED');
  assert.equal(result.hioskt_oracle_status,'BLOCKED_INDEPENDENT_VERIFICATION_REQUIRED');
  assert.equal(result.release_readiness,'BLOCKED');
  assert.ok(result.problems.includes('REAL_HISTORY_65_MANIFEST_INCOMPLETE'));
});
test('even complete SYNTHETIC 65 rows never qualify independent money or production',()=>{
  const result=evidenceGate.auditEvidence(syntheticEvidence(),{expectedHead:'a'.repeat(40)});
  assert.equal(result.case_count,65);
  assert.equal(result.structure,'COMPLETE_BUT_UNAUTHENTICATED');
  assert.equal(result.candidate_difference_cases,0);
  assert.equal(result.monetary_mismatch_count,'NOT_COMPARABLE');
  assert.equal(result.release_readiness,'BLOCKED');
});
test('real evidence gate flags duplicate history cases, absent oracle and stale feature HEAD',()=>{
  const fixture=syntheticEvidence();
  fixture.cases[1].case_id=fixture.cases[0].case_id;
  fixture.cases[2].hioskt.totals.final=null;
  const result=evidenceGate.auditEvidence(fixture,{expectedHead:'d'.repeat(40)});
  assert.equal(result.structure,'INCOMPLETE');
  assert.equal(result.candidate_difference_cases,null);
  assert.equal(result.monetary_mismatch_count,'NOT_COMPARABLE');
  assert.ok(result.problems.includes('CASE_1_DUPLICATE_ID'));
  assert.ok(result.problems.includes('CASE_2_MONEY_MISSING_OR_INVALID_final'));
  assert.ok(result.problems.includes('FEATURE_HEAD_DIFFERS_FROM_GITHUB'));
});
test('HIOSKT exact comparison uses decimal strings, not IEEE-754 numeric approximation',()=>{
  const norm=evidenceGate.exactDecimal;
  assert.equal(norm('9007199254740993.000'),'9007199254740993');
  assert.equal(norm('-0.000'),'0');
  assert.equal(norm('0.1000'),'0.1');
  for(const invalid of [0,false,null,[],{},'',' ','0x10','1,000','1e4'])
    assert.equal(norm(invalid),null,String(invalid));
  const fixture=syntheticEvidence();
  fixture.cases[0].kts.totals.final='9007199254740993';
  fixture.cases[0].hioskt.totals.final='9007199254740992';
  const result=evidenceGate.auditEvidence(fixture,{expectedHead:'a'.repeat(40)});
  assert.equal(result.candidate_difference_cases,1);
  assert.equal(result.monetary_mismatch_count,'NOT_COMPARABLE');
});
test('oracle source independence cannot be asserted with identical source digests',()=>{
  const fixture=syntheticEvidence();
  fixture.cases[0].hioskt.source_sha256=fixture.cases[0].kts.source_sha256;
  fixture.cases[1].mapping.method='inferred';
  const result=evidenceGate.auditEvidence(fixture,{expectedHead:'a'.repeat(40)});
  assert.ok(result.problems.includes('CASE_0_SOURCE_INDEPENDENCE_NOT_ESTABLISHED'));
  assert.ok(result.problems.includes('CASE_1_MAPPING_UNCONFIRMED'));
  assert.equal(result.release_readiness,'BLOCKED');
});

test('regression golden PIN/REMOVE require serializable atomic metadata store',()=>{
  const store=readFileSync(resolve(root,'settlement-test','settlement-store.js'),'utf8');
  const regression=readFileSync(resolve(root,'settlement-test','settlement-regression-cases.js'),'utf8');
  assert.ok(store.includes('async function mutateMetadataAtomically(key,mutator)'));
  assert.ok(store.includes('openDb, mutateMetadataAtomically,'));
  assert.ok(store.includes("const tx=db.transaction(STORES.metadata,'readwrite')"));
  assert.ok(regression.includes('mutateMetadataAtomically(META_KEY,row=>'));
  assert.ok(!regression.includes('async function writeMeta('));
  assert.ok(regression.includes("throw new Error('REGRESSION_METADATA_CORRUPTED')"));
});

test('HIOSKT candidate PROMOTED and golden case must commit as one IndexedDB metadata transaction',()=>{
  const source=readFileSync(resolve(root,'settlement-test','settlement-regression-candidates.js'),'utf8');
  const store=readFileSync(resolve(root,'settlement-test','settlement-store.js'),'utf8');
  assert.ok(source.includes('mutateMetadataRowsAtomically([META_KEY,regression.META_KEY]'));
  assert.ok(store.includes('async function mutateMetadataRowsAtomically(keys,mutator)'));
  assert.ok(source.includes('REGRESSION_CANDIDATE_METADATA_CORRUPTED'));
  assert.ok(source.includes('REGRESSION_GOLDEN_CONFLICTING_CASE'));
  assert.ok(source.includes('REGRESSION_CANDIDATE_PROMOTION_INCOMPLETE'));
  assert.ok(source.includes('mutateMetadataAtomically(META_KEY,row=>'));
  assert.ok(!source.includes('async function writeMeta('));
});

test('immutable golden case identity refuses silent replacement of confirmed HIOSKT amounts',()=>{
  const src=readFileSync(resolve(root,'settlement-test','settlement-regression-cases.js'),'utf8');
  assert.ok(src.includes('REGRESSION_GOLDEN_ID_CONFLICT'));
  assert.ok(src.includes('const prior=cases.find(item=>caseId(item)===c.id)'));
  assert.ok(src.includes('delete stable.pinned_at'));
});

test('HIOSKT source event IDs cannot hide changed canonical money after duplicate capture',()=>{
  const src=readFileSync(resolve(root,'settlement-test','settlement-regression-candidates.js'),'utf8');
  assert.ok(src.includes('REGRESSION_CANDIDATE_EVENT_ID_CONFLICT'));
  assert.ok(src.includes('delete immutableCase.pinned_at'));
  assert.ok(src.includes('delete immutableCase.note'));
  assert.ok(src.includes('reference_final:c.reference_final'));
  assert.ok(src.includes('mutateMetadataAtomically(META_KEY,row=>'));
});

test('PROMOTED HIOSKT candidate without matching golden blocks READY even when other golden replay passes',()=>{
  const c={id:'regression:synthetic-1',source_event_id:'synthetic-1',pinned_at:'2026-09-22T00:00:00Z',
    expected_reference:{totals:{xac:'0',qua_co:'0',payout:'0',final:'0'}}};
  const promote={id:'candidate:synthetic-1',state:'promoted',case:JSON.parse(JSON.stringify(c))};
  const linked=Q.candidateSummary([promote],[c]);
  assert.equal(linked.promoted,1);
  assert.equal(linked.promoted_linked,1);
  assert.equal(linked.promoted_missing,0);
  const deleted=Q.candidateSummary([promote],[]);
  assert.equal(deleted.promoted_missing,1);
  const wrong={...c,expected_reference:{totals:{xac:'1',qua_co:'0',payout:'0',final:'0'}}};
  assert.equal(Q.candidateSummary([promote],[wrong]).promoted_conflicting,1);
  assert.equal(Q.candidateSummary([promote],[c,c]).promoted_duplicate,1);
  assert.equal(Q.candidateSummary([{state:'REVIEW_CORRUPT'}],[]).invalid,1);
  const gates={
    observation:{promotion_ready:true,blockers:[],counts:{total:1,exact:1,missing_scopes:0}},
    kqxs:{met:true,total:1,verified:1,conflict:0,unverified:0},
    parser_provenance:{met:true,total:1,known:1,unknown:0,invalid:0,parser_errors:0,missing_canonical:0},
    parser_backend:{met:true,total:1,matched:1,mismatched:0,unreachable:false},
    regression:{total:1,passed:1,failed:0},
    feature_safety:{met:true,unsafe_count:0}
  };
  const incomplete=Q.combineQualification({...gates,
    candidates:{...linked,promoted_conflicting:undefined}});
  assert.equal(incomplete.ready_for_production_review,false);
  assert.ok(incomplete.blockers.includes('PROMOTED_GOLDEN_EVIDENCE_UNLINKED'));
  const valid=Q.combineQualification({...gates,candidates:linked});
  assert.equal(valid.ready_for_production_review,true);
  assert.equal(H.validateSnapshotDecision(valid).valid,true);
  for(const stats of [deleted,Q.candidateSummary([promote],[wrong]),
       Q.candidateSummary([promote],[c,c]),
       Q.candidateSummary([{state:'UNRECOGNIZED'}],[])]) {
    const verdict=Q.combineQualification({...gates,candidates:stats});
    assert.equal(verdict.ready_for_production_review,false);
    assert.equal(verdict.candidate_gate.met,false);
    assert.ok(verdict.blockers.includes('PROMOTED_GOLDEN_EVIDENCE_UNLINKED'));
  }
  const forged=JSON.parse(JSON.stringify(valid));
  forged.candidate_gate.promoted_linked=0;
  assert.equal(H.validateSnapshotDecision(forged).reason,
    'READY_GATE_EVIDENCE_CONTRADICTION_CANDIDATE_GATE');
  const bypass=JSON.parse(JSON.stringify(valid));
  delete bypass.candidate_gate.promoted_missing;
  assert.equal(H.validateSnapshotDecision(bypass).reason,
    'READY_GATE_EVIDENCE_CONTRADICTION_CANDIDATE_GATE');
});
test('deletion of golden backing PROMOTED HIOSKT is forbidden inside atomic candidate+golden transaction',()=>{
  const golden=readFileSync(resolve(root,'settlement-test','settlement-regression-cases.js'),'utf8');
  assert.ok(golden.includes('REGRESSION_GOLDEN_LINKED_TO_PROMOTED_CANDIDATE'));
  assert.ok(golden.includes('mutateMetadataRowsAtomically([META_KEY,candidateKey]'));
  assert.ok(golden.includes('REGRESSION_CANDIDATE_METADATA_CORRUPTED'));
  assert.ok(golden.includes('REGRESSION_GOLDEN_DELETE_LINK_GUARD_UNAVAILABLE'));
});

test('duplicate HIOSKT candidate IDs or two PROMOTED rows claiming one golden block READY',()=>{
  const golden={id:'regression:one',pinned_at:'2026-09-22T00:00:00Z',
    expected_reference:{totals:{xac:'0',qua_co:'0',payout:'0',final:'0'}}};
  const a={id:'candidate:a',state:'promoted',case:JSON.parse(JSON.stringify(golden))};
  const b={id:'candidate:b',state:'promoted',case:JSON.parse(JSON.stringify(golden))};
  const sameId=Q.candidateSummary([a,{...b,id:'candidate:a'}],[golden]);
  assert.equal(sameId.duplicate_candidate_ids,1);
  assert.equal(sameId.duplicate_golden_links,1);
  const alias=Q.candidateSummary([a,b],[golden]);
  assert.equal(alias.duplicate_candidate_ids,0);
  assert.equal(alias.duplicate_golden_links,1);
  const clean=Q.candidateSummary([a],[golden]);
  const gates={
    observation:{promotion_ready:true,blockers:[],counts:{total:1,exact:1,missing_scopes:0}},
    kqxs:{met:true,total:1,verified:1,conflict:0,unverified:0},
    parser_provenance:{met:true,total:1,known:1,unknown:0,invalid:0,parser_errors:0,missing_canonical:0},
    parser_backend:{met:true,total:1,matched:1,mismatched:0,unreachable:false},
    regression:{total:1,passed:1,failed:0},
    feature_safety:{met:true,unsafe_count:0}
  };
  assert.equal(Q.combineQualification({...gates,candidates:clean}).ready_for_production_review,true);
  for(const summary of [sameId,alias]){
    const q=Q.combineQualification({...gates,candidates:summary});
    assert.equal(q.ready_for_production_review,false);
    assert.equal(q.candidate_gate.met,false);
    assert.ok(q.blockers.includes('PROMOTED_GOLDEN_EVIDENCE_UNLINKED'));
  }
  const tampered=Q.combineQualification({...gates,candidates:clean});
  tampered.candidate_gate.duplicate_candidate_ids=1;
  assert.equal(H.validateSnapshotDecision(tampered).reason,
    'READY_GATE_EVIDENCE_CONTRADICTION_CANDIDATE_GATE');
  const candidateSrc=readFileSync(resolve(root,'settlement-test','settlement-regression-candidates.js'),'utf8');
  assert.ok(candidateSrc.includes('REGRESSION_CANDIDATE_DUPLICATE_ID'));
  assert.ok(candidateSrc.includes('events.has(normalized.source_event_id)'));
});
