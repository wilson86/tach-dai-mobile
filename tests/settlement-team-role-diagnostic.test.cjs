'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createPostgresLedgerRepository}=require('../team-settlement/postgres-ledger-repository.cjs');
const {createIsolatedTeamPrototype}=require('../team-settlement/team-composition.cjs');

const scope={workspace_id:'fake_group_a',partner_id:'fake_customer_a',business_date:'2026-10-20',region:'mn'};
function actor(role='operator'){return {server_verified:true,membership_active:true,user_id:'fake_operator_a',workspace_id:'fake_group_a',role};}
function dbWithRole(role,appendError=null){return {transaction:async work=>work({query:async sql=>{
  if(sql.includes('FROM kts_team.memberships m'))return {rows:role===null?[]:[{team_role:role}]};
  if(sql.includes('kts_team.append_draft')){if(appendError)throw Error(appendError);return {rows:[{result:{event_id:'event_a',replayed:false,new_revision:1,feed_seq:1}}]};}
  return {rows:[]};
}})};}
function input(){return {scope,expected_revision:0,event_id:'event_a',idempotency_key:'draft_a',request_sha256:'a'.repeat(64),snapshot:{synthetic:true}};}
test('synthetic default-off ledger diagnostic records no trace',async()=>{
  const repo=createPostgresLedgerRepository({db:dbWithRole('operator')});
  await repo.appendDraft(actor(),input());
});
test('synthetic diagnostic captures authorized active operator without secrets',async()=>{
  const traces=[];const repo=createPostgresLedgerRepository({db:dbWithRole('operator'),syntheticAuthorizationDiagnostic:x=>traces.push(x)});
  await repo.appendDraft(actor(),input());
  assert.deepEqual(traces,[{synthetic_only:true,stage:'LEDGER_MEMBERSHIP_RECHECK',actor_user_id:'fake_operator_a',workspace_id:'fake_group_a',actor_role:'operator',membership_role:'operator',membership_state:'ACTIVE',actor_matches_membership:true,append_draft_role_permitted:true}]);
  assert.equal(JSON.stringify(traces).match(/token|password|credential/i),null);
});
test('synthetic diagnostic distinguishes SQL role denial from missing or mismatched membership',async()=>{
  const reviewer=[];const denied=createPostgresLedgerRepository({db:dbWithRole('reviewer','TEAM_ROLE_DENIED'),syntheticAuthorizationDiagnostic:x=>reviewer.push(x)});
  await assert.rejects(denied.appendDraft(actor('reviewer'),input()),/TEAM_ROLE_DENIED/);
  assert.equal(reviewer[0].membership_state,'ACTIVE');
  assert.equal(reviewer[0].actor_matches_membership,true);
  assert.equal(reviewer[0].append_draft_role_permitted,false);
  const missing=[];const revoked=createPostgresLedgerRepository({db:dbWithRole(null),syntheticAuthorizationDiagnostic:x=>missing.push(x)});
  await assert.rejects(revoked.appendDraft(actor(),input()),/AUTH_SESSION_REVOKED/);
  assert.equal(missing[0].membership_state,'MISSING_OR_INACTIVE');
  assert.equal(missing[0].append_draft_role_permitted,false);
});
test('composition accepts the diagnostic only as an explicit synthetic callback and forwards it to the ledger',async()=>{
  const traces=[];
  const ledgerPool={connect:async()=>({query:async sql=>{
    if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'||sql.includes('set_config'))return {rows:[]};
    if(sql.includes('FROM kts_team.memberships m'))return {rows:[{team_role:'operator'}]};
    if(sql.includes('kts_team.append_draft'))return {rows:[{result:{event_id:'event_a',replayed:false,new_revision:1,feed_seq:1}}]};
    throw Error('UNEXPECTED_QUERY');
  },release(){}})};
  const app=createIsolatedTeamPrototype({authPool:{connect(){}},ledgerPool,syntheticOnly:true,
    syntheticAuthorizationDiagnostic:x=>traces.push(x)});
  await app.ledgerRepository.appendDraft(actor(),input());
  assert.equal(traces.length,1);
  assert.equal(traces[0].append_draft_role_permitted,true);
  assert.throws(()=>createIsolatedTeamPrototype({authPool:{connect(){}},ledgerPool:{connect(){}},
    syntheticOnly:true,syntheticAuthorizationDiagnostic:true}),/TEAM_AUTHORIZATION_DIAGNOSTIC_INVALID/);
});
