'use strict';
// Offline contract check: the runner's bootstrap grant is evidence of a
// potential risk, not proof of actual PostgreSQL privileges or live RLS.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {auditLedgerScopeGrants}=require('../team-settlement/ledger-scope-grant-audit.cjs');
test('current Windows bootstrap direct scope update is classified as blocked',async()=>{
  const runner=fs.readFileSync('C:\\KTS-Settlement\\w20-2d63c84e\\Run-RealPilot20.ps1','utf8');
  assert.match(runner,/GRANT INSERT,UPDATE ON kts_team\.scopes TO \$ledger/);
  const row={role:'l20_led_fixture',superuser:false,bypass_rls:false,scope_insert:true,scope_update:true,scope_delete:false,scope_truncate:false,scope_any_column_insert:true,scope_any_column_update:true,state_update:true,revision_update:true,reviewed_by_update:true,submitted_by_update:true,locked_at_update:true};
  const result=await auditLedgerScopeGrants({syntheticOnly:true,expectedRole:row.role,query:async()=>({rows:[row]})});
  assert.equal(result.status,'BLOCKED_DIRECT_SCOPE_MUTATION');
  assert.ok(result.direct_mutation_grants.includes('reviewed_by_update'));
  assert.equal(result.tenant_rls_runtime,'NOT_RUN');
  assert.equal(result.same_workspace_actor_authorization,'NOT_VERIFIED');
});
