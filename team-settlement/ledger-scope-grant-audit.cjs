'use strict';

// Read-only diagnostic; never qualifies live tenant/actor RLS. A runtime role
// able to mutate scopes directly can bypass application-only CAS/review checks
// even if FORCE RLS hides all *other* workspaces.
const LEDGER_SCOPE_GRANT_SQL = [
  'SELECT current_user AS role,',
  '  COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname=current_user),true) AS superuser,',
  '  COALESCE((SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user),true) AS bypass_rls,',
  "  has_table_privilege(current_user,'kts_team.scopes','INSERT') AS scope_insert,",
  "  has_table_privilege(current_user,'kts_team.scopes','UPDATE') AS scope_update,",
  "  has_table_privilege(current_user,'kts_team.scopes','DELETE') AS scope_delete,",
  "  has_table_privilege(current_user,'kts_team.scopes','TRUNCATE') AS scope_truncate,",
  "  has_any_column_privilege(current_user,'kts_team.scopes','INSERT') AS scope_any_column_insert,",
  "  has_any_column_privilege(current_user,'kts_team.scopes','UPDATE') AS scope_any_column_update,",
  "  has_column_privilege(current_user,'kts_team.scopes','state','UPDATE') AS state_update,",
  "  has_column_privilege(current_user,'kts_team.scopes','revision','UPDATE') AS revision_update,",
  "  has_column_privilege(current_user,'kts_team.scopes','reviewed_by','UPDATE') AS reviewed_by_update,",
  "  has_column_privilege(current_user,'kts_team.scopes','submitted_by','UPDATE') AS submitted_by_update,",
  "  has_column_privilege(current_user,'kts_team.scopes','locked_at','UPDATE') AS locked_at_update"
].join('\n');
const BOOLEAN_FIELDS = ['superuser','bypass_rls','scope_insert','scope_update','scope_delete','scope_truncate','scope_any_column_insert','scope_any_column_update',
  'state_update','revision_update','reviewed_by_update','submitted_by_update','locked_at_update'];

async function auditLedgerScopeGrants({query,expectedRole,syntheticOnly=false}={}){
  if(syntheticOnly!==true)throw Error('LEDGER_GRANT_AUDIT_NOT_AUTHORIZED');
  if(typeof query!=='function'||typeof expectedRole!=='string'||
     !/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(expectedRole))throw Error('LEDGER_GRANT_AUDIT_CONFIG_INVALID');
  let rows;
  try{const result=await query(LEDGER_SCOPE_GRANT_SQL);rows=result && result.rows;}
  catch(_){throw Error('LEDGER_GRANT_AUDIT_SQL_UNVERIFIED');}
  if(!Array.isArray(rows)||rows.length!==1||!rows[0]||rows[0].role!==expectedRole||
      BOOLEAN_FIELDS.some(key=>typeof rows[0][key]!=='boolean'))throw Error('LEDGER_GRANT_AUDIT_EVIDENCE_INVALID');
  const r=rows[0];
  if(r.superuser||r.bypass_rls)throw Error('LEDGER_GRANT_AUDIT_ROLE_PRIVILEGED');
  const privileged=BOOLEAN_FIELDS.slice(2).filter(key=>r[key]===true);
  return Object.freeze({role:expectedRole,
    status:privileged.length?'BLOCKED_DIRECT_SCOPE_MUTATION':'NO_DIRECT_SCOPE_GRANTS_OBSERVED',
    direct_mutation_grants:Object.freeze(privileged),
    same_workspace_actor_authorization:'NOT_VERIFIED',
    tenant_rls_runtime:'NOT_RUN',
    source:'READ_ONLY_POSTGRESQL_ROLE_GRANTS',
    production_approval:false});
}
module.exports=Object.freeze({auditLedgerScopeGrants,LEDGER_SCOPE_GRANT_SQL});
