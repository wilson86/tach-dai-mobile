'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {hashPassword}=require('../team-settlement/auth-contract.cjs');
const {buildSyntheticBootstrapPlan,summarizeSyntheticBootstrap}=require('../team-settlement/synthetic-bootstrap-plan.cjs');

function fixture(){
  const identities=Array.from({length:10},(_,n)=>({
    user_id:`fake_user_${n+1}`,auth_subject:`fake_login_${n+1}`,
    password_hash:hashPassword(`private-synthetic-password-${n+1}`,Buffer.alloc(16,n+1))
  }));
  return {workspaces:[{workspace_id:'fake_group_a',display_name:'Synthetic Group A'}],identities,
    memberships:identities.map((x,n)=>({workspace_id:'fake_group_a',user_id:x.user_id,
      role:n===0?'admin':n===1?'reviewer':'operator'})),
    counterparties:[
      {workspace_id:'fake_group_a',partner_id:'fake_customer_1',partner_kind:'customer',display_name:'Synthetic Customer'},
      {workspace_id:'fake_group_a',partner_id:'fake_owner_1',partner_kind:'owner',display_name:'Synthetic Owner'}
    ]};
}

test('private synthetic bootstrap plan accepts 10 role-separated identities and returns a redacted summary',()=>{
  const plan=buildSyntheticBootstrapPlan(fixture());
  assert.equal(plan.synthetic_only,true);
  assert.equal(plan.identities.length,10);
  assert.ok(Object.isFrozen(plan));
  const summary=summarizeSyntheticBootstrap(plan);
  assert.deepEqual(summary,{synthetic_only:true,identity_count:10,workspace_count:1,
    membership_count:10,counterparty_count:2,workspace_ids:['fake_group_a']});
  assert.equal(JSON.stringify(summary).includes('password_hash'),false);
  assert.equal(JSON.stringify(summary).includes('auth_subject'),false);
});

test('bootstrap rejects plaintext, capacity failure, orphan accounts and missing synthetic counterparties',()=>{
  const short=fixture();short.identities=short.identities.slice(0,9);short.memberships=short.memberships.slice(0,9);
  assert.throws(()=>buildSyntheticBootstrapPlan(short),/TEAM_BOOTSTRAP_CAPACITY_INVALID/);
  const plaintext=fixture();plaintext.identities[0].password='do-not-accept';
  assert.throws(()=>buildSyntheticBootstrapPlan(plaintext),/TEAM_BOOTSTRAP_IDENTITY_INVALID/);
  const orphan=fixture();orphan.memberships.pop();
  assert.throws(()=>buildSyntheticBootstrapPlan(orphan),/TEAM_BOOTSTRAP_ORPHAN_IDENTITY/);
  const partner=fixture();partner.counterparties[0].partner_id='customer_1';
  assert.throws(()=>buildSyntheticBootstrapPlan(partner),/TEAM_BOOTSTRAP_COUNTERPARTY_INVALID/);
});

test('bootstrap requires each workspace to retain an admin, customer and owner',()=>{
  for(const change of [
    x=>{x.memberships[0].role='operator';},
    x=>{x.counterparties=x.counterparties.filter(p=>p.partner_kind!=='customer');},
    x=>{x.counterparties=x.counterparties.filter(p=>p.partner_kind!=='owner');}
  ]){
    const input=fixture();change(input);
    assert.throws(()=>buildSyntheticBootstrapPlan(input),/TEAM_BOOTSTRAP_(ADMIN_REQUIRED|COUNTERPARTY_KIND_REQUIRED)/);
  }
});
