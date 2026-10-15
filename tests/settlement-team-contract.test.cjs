'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../team-settlement/core-contract.cjs');
const actor=(role='operator',workspace_id='group_a',user_id='user_1')=>({
  server_verified:true,membership_active:true,role,workspace_id,user_id
});
const row=(patch={})=>({
  workspace_id:'group_a',partner_id:'customer_1',business_date:'2026-10-12',
  region:'mn',status:'DRAFT',revision:0,submitted_by:'user_1',...patch
});

test('30-user supported identity set is role-separated from settlement counterparties',()=>{
  const users=Array.from({length:30},(_,i)=>actor(i===0?'admin':i%2?'operator':'reviewer','group_a','member_'+i));
  assert.equal(users.length,30);
  assert.equal(new Set(users.map(x=>x.user_id)).size,30);
  users.forEach(x=>assert.equal(C.authorize(x,'read',row()),true));
  assert.throws(()=>C.actorFromServer({user_id:'customer_1',role:'customer',server_verified:true,membership_active:true,workspace_id:'group_a'}),/TEAM_ACTOR_UNVERIFIED/);
});
test('denies missing session proofs, inactive members, cross-workspace, unknown roles and actions',()=>{
  const x=row();
  assert.throws(()=>C.authorize({...actor(),server_verified:false},'read',x),/TEAM_ACTOR_UNVERIFIED/);
  assert.throws(()=>C.authorize({...actor(),membership_active:false},'read',x),/TEAM_ACTOR_UNVERIFIED/);
  assert.throws(()=>C.authorize(actor('viewer','group_b'),'read',x),/TEAM_WORKSPACE_DENIED/);
  assert.throws(()=>C.authorize(actor('unknown'),'read',x),/TEAM_ACTOR_UNVERIFIED/);
  assert.throws(()=>C.authorize(actor(),'withdraw_money',x),/TEAM_ACTION_UNKNOWN/);
  assert.throws(()=>C.authorize(actor('viewer'),'edit_draft',x),/TEAM_ROLE_DENIED/);
  assert.throws(()=>C.authorize(actor('operator'),'change_config',x),/TEAM_ROLE_DENIED/);
  assert.throws(()=>C.authorize(actor('reviewer'),'manage_users',x),/TEAM_ROLE_DENIED/);
});
test('independently reviews a closed scope with no author self-approval',()=>{
  const x=row({status:'PENDING_REVIEW',revision:7});
  assert.throws(()=>C.transition(actor('reviewer','group_a','user_1'),'approve_review',x),/TEAM_SEPARATION_OF_DUTIES/);
  assert.deepEqual({...C.transition(actor('reviewer','group_a','user_2'),'approve_review',x)},
    {from:'PENDING_REVIEW',to:'REVIEWED',expected_revision:7});
  assert.throws(()=>C.transition(actor('reviewer','group_a','user_2'),'close_scope',x),/TEAM_TRANSITION_DENIED/);
  const reviewed={...x,status:'REVIEWED',reviewed_by:'user_2'};
  assert.throws(()=>C.transition(actor('reviewer','group_a','user_2'),'close_scope',reviewed),
    /TEAM_FINALIZATION_EVIDENCE_REQUIRED/);
  const releaseGate={server_derived:true,kqxs_verified:true,parser_qualified:true,
    partner_pricing_qualified:true,financial_rules_qualified:true,product_release_approved:true};
  assert.throws(()=>C.transition(actor('reviewer','group_a','user_2'),'close_scope',
    reviewed,{...releaseGate,product_release_approved:false}),/TEAM_FINALIZATION_EVIDENCE_REQUIRED/);
  assert.deepEqual({...C.transition(actor('reviewer','group_a','user_2'),'close_scope',
    reviewed,releaseGate)},
    {from:'REVIEWED',to:'CLOSED',expected_revision:7});
  assert.throws(()=>C.transition(actor('admin'),'reopen_scope',{...x,status:'REOPEN_REQUESTED'}),/TEAM_REOPEN_APPROVAL_REQUIRED/);
  assert.equal(C.transition(actor('admin'),'reopen_scope',{...x,status:'REOPEN_REQUESTED',reopen_reason_approved:true}).to,'DRAFT');
});
test('scope key uses strict calendars and workspace rather than only local partner',()=>{
  assert.equal(C.scopeKey(row()),'group_a:customer_1:2026-10-12:mn');
  for(const date of ['2026-02-30','2025-02-29','2026-10-12T12:00:00','2026-13-12','2026-00-01'])
    assert.throws(()=>C.scopeKey(row({business_date:date})),/TEAM_SCOPE_INVALID/);
  assert.notEqual(C.scopeKey(row()),C.scopeKey(row({workspace_id:'group_b'})));
  assert.throws(()=>C.scopeKey(row({partner_id:'../../bad'})),/TEAM_SCOPE_INVALID/);
});
test('rejects stale revision, offline confirmation and unauthorized operation',()=>{
  const x=row({revision:5});
  const intent={workspace_id:'group_a',action:'edit_draft',expected_revision:5,
    idempotency_key:'request_23',offline:false};
  assert.deepEqual({...C.checkMutationIntent(actor(),intent,x)},
    {scope_key:'group_a:customer_1:2026-10-12:mn',expected_revision:5,next_revision:6,idempotency_key:'request_23'});
  assert.throws(()=>C.checkMutationIntent(actor(),{...intent,expected_revision:4},x),/TEAM_REVISION_CONFLICT/);
  assert.throws(()=>C.checkMutationIntent(actor(),{...intent,offline:true},x),/TEAM_OFFLINE_NOT_AUTHORITATIVE/);
  assert.throws(()=>C.checkMutationIntent(actor(),{...intent,offline:false,idempotency_key:''},x),/TEAM_IDEMPOTENCY_KEY_REQUIRED/);
  assert.throws(()=>C.checkMutationIntent(actor('viewer'),intent,x),/TEAM_ROLE_DENIED/);
  assert.throws(()=>C.checkMutationIntent(actor(),intent,{...x,status:'CLOSED'}),/TEAM_CLOSED_OR_PENDING_IMMUTABLE/);
  assert.throws(()=>C.checkMutationIntent(actor(),{...intent,workspace_id:'group_b'},x),/TEAM_SCOPE_MISMATCH/);
  assert.throws(()=>C.checkMutationIntent(actor(),{...intent,action:'close_scope'},x),/TEAM_ROLE_DENIED/);
  assert.throws(()=>C.checkMutationIntent(actor('admin','group_a','admin_2'),{...intent,action:'close_scope'},x),/TEAM_INTENT_ACTION_FORBIDDEN/);
});
test('offline cache and conflicts never masquerade as authoritative financial balance',()=>{
  assert.equal(C.offlineBadge({}), 'PENDING');
  assert.equal(C.offlineBadge({network_confirmed:false}), 'PENDING');
  assert.equal(C.offlineBadge({network_confirmed:true,conflict:true}), 'CONFLICT');
  assert.equal(C.offlineBadge({network_confirmed:true,server_blocked:true}), 'BLOCKED');
  assert.equal(C.offlineBadge({network_confirmed:true}), 'SYNCED');
});
test('all contract objects and roles are immutable',()=>{
  assert.equal(Object.isFrozen(C.GRANTS),true);
  assert.equal(Object.isFrozen(C.GRANTS.operator),true);
  assert.equal(Object.isFrozen(C.requireScope(row())),true);
  assert.throws(()=>C.requireRevision(-1),/TEAM_REVISION_INVALID/);
  assert.throws(()=>C.requireRevision(Number.MAX_SAFE_INTEGER+1),/TEAM_REVISION_INVALID/);
});
