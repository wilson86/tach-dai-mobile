'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {auditLedgerScopeGrants,LEDGER_SCOPE_GRANT_SQL}=require('../team-settlement/ledger-scope-grant-audit.cjs');
const safe={role:'l20_ledger_synthetic',superuser:false,bypass_rls:false,
  scope_insert:false,scope_update:false,scope_delete:false,state_update:false,
  revision_update:false,reviewed_by_update:false,submitted_by_update:false,locked_at_update:false};
async function run(row){return auditLedgerScopeGrants({query:async()=>({rows:[row]}),expectedRole:safe.role,syntheticOnly:true});}

test('grant audit uses one read-only privileges query and never claims actor/RLS PASS',async()=>{
  let count=0;
  const a=await auditLedgerScopeGrants({syntheticOnly:true,expectedRole:safe.role,query:async sql=>{
    count++;assert.equal(sql,LEDGER_SCOPE_GRANT_SQL);
    assert.match(sql,/has_column_privilege/);
    assert.doesNotMatch(sql,/\b(?:INSERT INTO|UPDATE kts|DELETE FROM|SET ROLE|set_config)\b/i);
    return {rows:[safe]};
  }});
  assert.equal(count,1);
  assert.equal(a.status,'NO_DIRECT_SCOPE_GRANTS_OBSERVED');
  assert.equal(a.same_workspace_actor_authorization,'NOT_VERIFIED');
  assert.equal(a.tenant_rls_runtime,'NOT_RUN');
  assert.equal(a.production_approval,false);
});

test('INSERT, table UPDATE, column UPDATE and DELETE each block actor-boundary readiness',async()=>{
  for(const key of ['scope_insert','scope_update','scope_delete','state_update','revision_update',
    'reviewed_by_update','submitted_by_update','locked_at_update']){
    const a=await run({...safe,[key]:true});
    assert.equal(a.status,'BLOCKED_DIRECT_SCOPE_MUTATION');
    assert.ok(a.direct_mutation_grants.includes(key));
    assert.equal(a.production_approval,false);
  }
});

test('ambiguous or privileged database role evidence is rejected',async()=>{
  for(const row of [null,{}, {...safe,role:'unexpected_role'}, {...safe,superuser:true},
    {...safe,bypass_rls:true}, {...safe,scope_update:null}, {...safe,scope_insert:'t'}]){
    await assert.rejects(run(row),/EVIDENCE_INVALID|ROLE_PRIVILEGED/);
  }
  await assert.rejects(auditLedgerScopeGrants({expectedRole:safe.role,query:async()=>({rows:[safe]})}),/NOT_AUTHORIZED/);
  await assert.rejects(auditLedgerScopeGrants({expectedRole:safe.role,syntheticOnly:true,query:async()=>{throw Error('DB SECRET');}}),
    e=>e.message==='LEDGER_GRANT_AUDIT_SQL_UNVERIFIED');
});
