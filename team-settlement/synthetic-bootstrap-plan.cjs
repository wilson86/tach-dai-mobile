'use strict';

// Private, offline bootstrap planner for the disposable synthetic Team DB.
// It deliberately has no filesystem, process, network, Pool, SQL or logging
// dependency. An operator supplies password *verifiers* from a private
// process; this module rejects plaintext-password-shaped input and returns a
// reviewable topology, not executable database commands.
const KEY=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const ROLES=new Set(['admin','operator','reviewer','viewer']);
const KINDS=new Set(['customer','owner']);
const HASH=/^scrypt-v1\$[1-9][0-9]*,[1-9][0-9]*,[1-9][0-9]*\$[A-Za-z0-9+/=_-]{16,256}\$[A-Za-z0-9+/=_-]{16,256}$/;

function fail(code){throw Error(code);}
function plainObject(value,code){
  if(!value||typeof value!=='object'||Array.isArray(value))fail(code);
  return value;
}
function exactKeys(value,allowed,code){
  plainObject(value,code);
  if(Object.keys(value).some(key=>!allowed.includes(key)))fail(code);
  return value;
}
function key(value,code){if(typeof value!=='string'||!KEY.test(value))fail(code);return value;}
function label(value,code){if(typeof value!=='string'||value.length<1||value.length>160)fail(code);return value;}
function array(value,code){if(!Array.isArray(value))fail(code);return value;}
function syntheticId(value,code){
  key(value,code);
  if(!/^(?:fake|demo|synthetic)_[A-Za-z0-9_-]{1,64}$/.test(value))fail(code);
  return value;
}

function buildSyntheticBootstrapPlan(input={}){
  exactKeys(input,['workspaces','identities','memberships','counterparties'],'TEAM_BOOTSTRAP_PLAN_INVALID');
  const workspaces=array(input.workspaces,'TEAM_BOOTSTRAP_WORKSPACES_INVALID');
  const identities=array(input.identities,'TEAM_BOOTSTRAP_IDENTITIES_INVALID');
  const memberships=array(input.memberships,'TEAM_BOOTSTRAP_MEMBERSHIPS_INVALID');
  const counterparties=array(input.counterparties,'TEAM_BOOTSTRAP_COUNTERPARTIES_INVALID');
  if(workspaces.length<1||workspaces.length>30||identities.length<10||identities.length>30)
    fail('TEAM_BOOTSTRAP_CAPACITY_INVALID');
  const workspaceIds=new Set(),users=new Set(),subjects=new Set();
  const checkedWorkspaces=workspaces.map(item=>{
    exactKeys(item,['workspace_id','display_name'],'TEAM_BOOTSTRAP_WORKSPACE_INVALID');
    const workspace_id=syntheticId(item.workspace_id,'TEAM_BOOTSTRAP_WORKSPACE_INVALID');
    if(workspaceIds.has(workspace_id))fail('TEAM_BOOTSTRAP_DUPLICATE_WORKSPACE');
    workspaceIds.add(workspace_id);
    return Object.freeze({workspace_id,display_name:label(item.display_name,'TEAM_BOOTSTRAP_WORKSPACE_INVALID')});
  });
  const checkedIdentities=identities.map(item=>{
    exactKeys(item,['user_id','auth_subject','password_hash'],'TEAM_BOOTSTRAP_IDENTITY_INVALID');
    const user_id=syntheticId(item.user_id,'TEAM_BOOTSTRAP_IDENTITY_INVALID');
    const auth_subject=syntheticId(item.auth_subject,'TEAM_BOOTSTRAP_IDENTITY_INVALID');
    if(typeof item.password_hash!=='string'||!HASH.test(item.password_hash))
      fail('TEAM_BOOTSTRAP_VERIFIER_INVALID');
    if(users.has(user_id)||subjects.has(auth_subject))fail('TEAM_BOOTSTRAP_DUPLICATE_IDENTITY');
    users.add(user_id);subjects.add(auth_subject);
    return Object.freeze({user_id,auth_subject,password_hash:item.password_hash});
  });
  const membershipKeys=new Set(),membersByWorkspace=new Map(),usersWithMembership=new Set();
  const checkedMemberships=memberships.map(item=>{
    exactKeys(item,['workspace_id','user_id','role'],'TEAM_BOOTSTRAP_MEMBERSHIP_INVALID');
    const workspace_id=syntheticId(item.workspace_id,'TEAM_BOOTSTRAP_MEMBERSHIP_INVALID');
    const user_id=syntheticId(item.user_id,'TEAM_BOOTSTRAP_MEMBERSHIP_INVALID');
    if(!workspaceIds.has(workspace_id)||!users.has(user_id)||!ROLES.has(item.role))
      fail('TEAM_BOOTSTRAP_MEMBERSHIP_INVALID');
    const membershipKey=workspace_id+':'+user_id;
    if(membershipKeys.has(membershipKey))fail('TEAM_BOOTSTRAP_DUPLICATE_MEMBERSHIP');
    membershipKeys.add(membershipKey);usersWithMembership.add(user_id);
    const group=membersByWorkspace.get(workspace_id)||[];
    group.push(item.role);membersByWorkspace.set(workspace_id,group);
    return Object.freeze({workspace_id,user_id,role:item.role});
  });
  if(usersWithMembership.size!==users.size)fail('TEAM_BOOTSTRAP_ORPHAN_IDENTITY');
  for(const workspace_id of workspaceIds){
    const roles=membersByWorkspace.get(workspace_id)||[];
    if(!roles.includes('admin'))fail('TEAM_BOOTSTRAP_ADMIN_REQUIRED');
  }
  const partnerKeys=new Set(),kindsByWorkspace=new Map();
  const checkedCounterparties=counterparties.map(item=>{
    exactKeys(item,['workspace_id','partner_id','partner_kind','display_name'],'TEAM_BOOTSTRAP_COUNTERPARTY_INVALID');
    const workspace_id=syntheticId(item.workspace_id,'TEAM_BOOTSTRAP_COUNTERPARTY_INVALID');
    const partner_id=syntheticId(item.partner_id,'TEAM_BOOTSTRAP_COUNTERPARTY_INVALID');
    if(!workspaceIds.has(workspace_id)||!KINDS.has(item.partner_kind))
      fail('TEAM_BOOTSTRAP_COUNTERPARTY_INVALID');
    const partnerKey=workspace_id+':'+partner_id;
    if(partnerKeys.has(partnerKey))fail('TEAM_BOOTSTRAP_DUPLICATE_COUNTERPARTY');
    partnerKeys.add(partnerKey);
    const kinds=kindsByWorkspace.get(workspace_id)||new Set();
    kinds.add(item.partner_kind);kindsByWorkspace.set(workspace_id,kinds);
    return Object.freeze({workspace_id,partner_id,partner_kind:item.partner_kind,
      display_name:label(item.display_name,'TEAM_BOOTSTRAP_COUNTERPARTY_INVALID')});
  });
  for(const workspace_id of workspaceIds){
    const kinds=kindsByWorkspace.get(workspace_id);
    if(!kinds||!kinds.has('customer')||!kinds.has('owner'))
      fail('TEAM_BOOTSTRAP_COUNTERPARTY_KIND_REQUIRED');
  }
  return Object.freeze({
    synthetic_only:true,
    identities:Object.freeze(checkedIdentities.slice().sort((a,b)=>a.user_id.localeCompare(b.user_id))),
    workspaces:Object.freeze(checkedWorkspaces.slice().sort((a,b)=>a.workspace_id.localeCompare(b.workspace_id))),
    memberships:Object.freeze(checkedMemberships.slice().sort((a,b)=>(a.workspace_id+':'+a.user_id).localeCompare(b.workspace_id+':'+b.user_id))),
    counterparties:Object.freeze(checkedCounterparties.slice().sort((a,b)=>(a.workspace_id+':'+a.partner_id).localeCompare(b.workspace_id+':'+b.partner_id)))
  });
}

function summarizeSyntheticBootstrap(plan){
  plainObject(plan,'TEAM_BOOTSTRAP_PLAN_INVALID');
  if(plan.synthetic_only!==true||!Array.isArray(plan.identities)||!Array.isArray(plan.workspaces)||
     !Array.isArray(plan.memberships)||!Array.isArray(plan.counterparties))
    fail('TEAM_BOOTSTRAP_PLAN_INVALID');
  // No auth subjects or verifier data in the summary: it is safe to include in
  // a local review receipt without turning it into a credential inventory.
  return Object.freeze({synthetic_only:true,identity_count:plan.identities.length,
    workspace_count:plan.workspaces.length,membership_count:plan.memberships.length,
    counterparty_count:plan.counterparties.length,
    workspace_ids:Object.freeze(plan.workspaces.map(x=>x.workspace_id))});
}

module.exports=Object.freeze({buildSyntheticBootstrapPlan,summarizeSyntheticBootstrap});
