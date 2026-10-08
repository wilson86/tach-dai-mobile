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
  assert.ok(sw.includes('v1.0.141-qualification-history-atomic'));
  assert.ok(sw.includes("'./settlement-qualification-history.js'"));
  assert.ok(sw.includes("'./settlement-build-identity.js'"));
});
