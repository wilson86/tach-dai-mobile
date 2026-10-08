'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const vm=require('node:vm');
const root=resolve(__dirname,'../..');
const sandbox={window:{}};
for(const name of ['settlement-store.js','settlement-qualification-dashboard.js','settlement-qualification-history.js']){
  vm.runInNewContext(readFileSync(resolve(root,'app',name),'utf8'),sandbox,{filename:name});
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

test('feature build identity pins history and service worker Git blobs',()=>{
  const {execFileSync}=require('node:child_process');
  vm.runInNewContext(readFileSync(resolve(root,'app','settlement-build-identity.js'),'utf8'),sandbox,{filename:'settlement-build-identity.js'});
  const manifest=sandbox.window.KTS_SETTLEMENT_BUILD_IDENTITY;
  for(const name of ['index.html','settlement-qualification-history.js','settlement-repair-workflow.js','unified-core.js','sw.js']){
    const expected=execFileSync('git',['hash-object','app/'+name],{cwd:root,encoding:'utf8'}).trim();
    assert.equal(manifest.critical_git_blobs['app/'+name],expected);
  }
});
test('feature SW rotates the qualification history runtime cache',()=>{
  const source=readFileSync(resolve(root,'app','sw.js'),'utf8');
  assert.ok(source.includes('v1.0.149-journal-ui-verdict'));
  assert.ok(source.includes("'./settlement-qualification-history.js'"));
  assert.ok(source.includes("'./settlement-build-identity.js'"));
});

test('canonical feature rejects malformed or disconnected qualification journal',()=>{
  const samples=[
    {},
    {...blocked,previous_event_id:'unrelated'},
    {...blocked,previous_ready_event_id:'unrelated'},
    {...blocked,id:ready.id},
    {...blocked,ready_for_production_review:'false'},
    {...blocked,production_enabled:true},
    {...blocked,qualification_snapshot:{ready_for_production_review:true}}
  ];
  for(const item of samples){
    const result=verify([ready,item]);
    assert.equal(result.status,'READY_EVIDENCE_UNVERIFIABLE');
    assert.equal(result.current,false);
    assert.ok(result.history_error.startsWith('QUALIFICATION_HISTORY_INVALID_'));
  }
});
test('canonical feature preserves valid journal qualification decisions',()=>{
  assert.equal(H.validateHistoryEvents([ready,blocked,renewed]).valid,true);
  assert.equal(verify([ready]).current,true);
  assert.equal(verify([ready,blocked]).current,false);
  assert.equal(verify([ready,blocked,renewed],modified,'sha-renewed').current,true);
});

test('canonical source pins every cached JS asset besides manifest self-reference',()=>{
  const sw=readFileSync(resolve(root,'app','sw.js'),'utf8');
  const source=readFileSync(resolve(root,'app','settlement-build-identity.js'),'utf8');
  vm.runInNewContext(source,sandbox,{filename:'settlement-build-identity.js'});
  const pins=sandbox.window.KTS_SETTLEMENT_BUILD_IDENTITY.critical_git_blobs;
  const core=sw.match(/const CORE=\[([\s\S]*?)\];/);
  assert.ok(core);
  const js=[...core[1].matchAll(/'\.\/([^']+\.js)'/g)].map(x=>x[1]);
  assert.equal(js.length,60);
  for(const name of js){
    if(name==='settlement-build-identity.js')continue;
    assert.ok(pins['app/'+name], 'CRITICAL_JS_NOT_PINNED:'+name);
  }
  assert.equal(Object.keys(pins).length,62);
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
  const script=readFileSync(resolve(root,'app','settlement-qualification-history.js'),'utf8');
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
    observation:{promotion_ready:true},kqxs_verification:{met:true},
    parser_provenance:{met:true},parser_backend:{met:true},
    regression_gate:{met:true},candidate_gate:{met:true},feature_safety:{met:true}
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
