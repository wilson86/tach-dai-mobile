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
  assert.ok(sw.includes('v1.0.143-complete-critical-pins'));
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
  for(const required of [
    '/health','/api/settlement/parser-identity','/api/settlement/parse',
    'BACKEND_CORS_PREFLIGHT_MISMATCH','BUSINESS_DATE_REQUIRED',
    'BACKEND_KQXS_CORS_PREFLIGHT_MISMATCH','KQXS_REGION_REQUIRED',
    'SETTLEMENT_TEST_BACKEND_CONTRACT=PASS'
  ])assert.ok(block.includes(required),'BACKEND_PREDEPLOY_GUARD_MISSING:'+required);
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
  assert.equal(Object.keys(pins).length,61);
  const missing=names.filter(x=>x!=='settlement-build-identity.js'&&!pins['app/'+x]);
  assert.deepEqual(missing,[],'UNPINNED_SETTLEMENT_RUNTIME_JS');
  const integrity=readFileSync(resolve(root,'.github','scripts','settlement-predeploy-integrity.cjs'),'utf8');
  assert.ok(integrity.includes('PREDEPLOY_UNPINNED_CACHED_JS'),'PREDEPLOY_UNPINNED_MODULE_GATE_MISSING');
  assert.ok(integrity.includes('PREDEPLOY_REQUIRED_PIN_MISSING'),'PREDEPLOY_WORKER_SHELL_PIN_GATE_MISSING');
  const executable=names.filter(x=>x!=='settlement-build-identity.js');
  assert.equal(executable.length,59,'UNEXPECTED_CACHED_JS_MODULE_COUNT');
});
