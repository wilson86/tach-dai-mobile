'use strict';

// Explicit, read-only preflight for TWO supplied PostgreSQL Pool connections.
// Never creates pools, credentials, listening sockets or database objects.
// Synthetic candidate only; no live service admission from this result.
const ATOMIC_SIGNATURES=Object.freeze({
  atomic_review:'kts_team.atomic_review_v1(text,text,bigint,text,text,text,date,text,text,bigint,text,text,text)',
  atomic_review_lookup:'kts_team.atomic_review_reconcile_v1(text,text,bigint,text,text,text,date,text,text,bigint,text,text)',
  atomic_draft:'kts_team.atomic_draft_v1(text,text,bigint,text,text,text,date,text,text,bigint,text,text,text,text)',
  atomic_draft_lookup:'kts_team.atomic_draft_reconcile_v1(text,text,bigint,text,text,text,date,text,text,bigint,text,text,text)'
});
const ATOMIC_COLUMNS=Object.entries(ATOMIC_SIGNATURES).map(([key,signature])=>
  `to_regprocedure('${signature}') IS NOT NULL AS ${key}_present,\n`+
  `  CASE WHEN to_regprocedure('${signature}') IS NULL THEN false ELSE `+
  `has_function_privilege(current_user,to_regprocedure('${signature}'),'EXECUTE') END AS ${key}_execute`).join(',\n  ');
const PROBE_SQL = `SELECT current_user AS role, session_user AS session_role,
  current_database() AS database_name,
  (SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database()) AS database_oid,
  inet_server_addr()::text AS server_address, inet_server_port() AS server_port,
  extract(epoch FROM pg_postmaster_start_time())::text AS postmaster_started,
  pg_is_in_recovery() AS server_in_recovery,
  ${ATOMIC_COLUMNS},
  has_schema_privilege(current_user, 'kts_auth', 'USAGE') AS auth_schema,
  has_schema_privilege(current_user, 'kts_team', 'USAGE') AS team_schema,
  has_table_privilege(current_user, 'kts_team.scope_events', 'SELECT') AS event_read,
  has_function_privilege(current_user,
    'kts_team.append_draft(text,text,date,text,bigint,text,text,text,jsonb)',
    'EXECUTE') AS draft_execute,
  to_regprocedure('kts_team.advance_review(text,text,date,text,text,bigint,text,text,text)') IS NOT NULL AS review_function_present,
  CASE WHEN to_regprocedure('kts_team.advance_review(text,text,date,text,text,bigint,text,text,text)') IS NULL THEN false
    ELSE has_function_privilege(current_user,to_regprocedure('kts_team.advance_review(text,text,date,text,text,bigint,text,text,text)'),'EXECUTE') END AS review_execute,
  NOT (has_table_privilege(current_user, 'kts_team.memberships', 'INSERT')
    OR has_table_privilege(current_user, 'kts_team.memberships', 'UPDATE')
    OR has_table_privilege(current_user, 'kts_team.memberships', 'DELETE')
    OR has_table_privilege(current_user, 'kts_team.memberships', 'TRUNCATE')
    OR has_any_column_privilege(current_user, 'kts_team.memberships', 'INSERT')
    OR has_any_column_privilege(current_user, 'kts_team.memberships', 'UPDATE')) AS membership_write_denied,
  NOT (has_table_privilege(current_user, 'kts_team.scopes', 'INSERT')
    OR has_table_privilege(current_user, 'kts_team.scopes', 'UPDATE')
    OR has_table_privilege(current_user, 'kts_team.scopes', 'DELETE')
    OR has_table_privilege(current_user, 'kts_team.scopes', 'TRUNCATE')
    OR has_any_column_privilege(current_user, 'kts_team.scopes', 'INSERT')
    OR has_any_column_privilege(current_user, 'kts_team.scopes', 'UPDATE')) AS direct_scope_write_denied,
  NOT (has_table_privilege(current_user, 'kts_team.scope_events', 'INSERT')
    OR has_table_privilege(current_user, 'kts_team.scope_events', 'UPDATE')
    OR has_table_privilege(current_user, 'kts_team.scope_events', 'DELETE')
    OR has_table_privilege(current_user, 'kts_team.scope_events', 'TRUNCATE')
    OR has_any_column_privilege(current_user, 'kts_team.scope_events', 'INSERT')
    OR has_any_column_privilege(current_user, 'kts_team.scope_events', 'UPDATE')
    OR has_table_privilege(current_user, 'kts_team.idempotency_receipts', 'INSERT')
    OR has_table_privilege(current_user, 'kts_team.idempotency_receipts', 'UPDATE')
    OR has_table_privilege(current_user, 'kts_team.idempotency_receipts', 'DELETE')
    OR has_table_privilege(current_user, 'kts_team.idempotency_receipts', 'TRUNCATE')
    OR has_any_column_privilege(current_user, 'kts_team.idempotency_receipts', 'INSERT')
    OR has_any_column_privilege(current_user, 'kts_team.idempotency_receipts', 'UPDATE')) AS direct_audit_write_denied,
  NOT (has_table_privilege(current_user, 'kts_team.workspaces', 'INSERT')
    OR has_table_privilege(current_user, 'kts_team.workspaces', 'UPDATE')
    OR has_table_privilege(current_user, 'kts_team.workspaces', 'DELETE')
    OR has_table_privilege(current_user, 'kts_team.workspaces', 'TRUNCATE')
    OR has_any_column_privilege(current_user, 'kts_team.workspaces', 'INSERT')
    OR has_any_column_privilege(current_user, 'kts_team.workspaces', 'UPDATE')) AS direct_workspace_write_denied,
  EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS role_memberships_present,
  COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname=current_user),true) AS superuser,
  COALESCE((SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user),true) AS bypass_rls`;

const AUTH_PROBE_SQL = PROBE_SQL.replace(
  'COALESCE((SELECT rolsuper',
  `has_table_privilege(current_user, 'kts_auth.credentials', 'SELECT') AS credential_read,
  has_table_privilege(current_user, 'kts_auth.sessions', 'SELECT') AS session_read,
  has_table_privilege(current_user, 'kts_team.memberships', 'SELECT') AS membership_read,
  NOT (has_table_privilege(current_user, 'kts_team.scopes', 'INSERT')
    OR has_table_privilege(current_user, 'kts_team.scopes', 'UPDATE')
    OR has_table_privilege(current_user, 'kts_team.scope_events', 'INSERT')
    OR has_table_privilege(current_user, 'kts_team.idempotency_receipts', 'INSERT')) AS financial_write_denied,
  (has_column_privilege(current_user, 'kts_auth.sessions', 'session_hash', 'INSERT')
   AND has_column_privilege(current_user, 'kts_auth.sessions', 'user_id', 'INSERT')
   AND has_column_privilege(current_user, 'kts_auth.sessions', 'workspace_id', 'INSERT')
   AND has_column_privilege(current_user, 'kts_auth.sessions', 'issued_at', 'INSERT')
   AND has_column_privilege(current_user, 'kts_auth.sessions', 'expires_at', 'INSERT')) AS session_insert,
  has_column_privilege(current_user, 'kts_auth.sessions', 'revoked_at', 'UPDATE') AS session_revoke,
  COALESCE((SELECT rolsuper`);

function deny(){throw new Error('TEAM_DB_EFFECTIVE_ROLES_UNQUALIFIED');}
function requireClient(c){
  if(!c||typeof c.query!=='function'||typeof c.release!=='function')deny();
  return c;
}
async function qualifyIsolatedPoolRoles({authPool,ledgerPool,syntheticOnly=false,requireReview=false,inspectAtomicCandidate=false}={}){
  if(syntheticOnly!==true)throw new Error('TEAM_RELEASE_NOT_AUTHORIZED');
  if(typeof requireReview!=='boolean')throw new Error('TEAM_REVIEW_CONFIG_INVALID');
  if(typeof inspectAtomicCandidate!=='boolean')throw new Error('TEAM_ATOMIC_PROBE_CONFIG_INVALID');
  if(!authPool||!ledgerPool||authPool===ledgerPool||
     typeof authPool.connect!=='function'||typeof ledgerPool.connect!=='function')
    throw new Error('TEAM_DB_ROLES_NOT_ISOLATED');
  let a=null,l=null,qualified=false;
  try {
    a=await authPool.connect();
    requireClient(a);
    l=await ledgerPool.connect();
    requireClient(l);
    if(a===l)deny();
    const [authResult,ledgerResult]=await Promise.all([
      a.query(AUTH_PROBE_SQL),l.query(PROBE_SQL)
    ]);
    const auth=authResult?.rows?.[0],ledger=ledgerResult?.rows?.[0];
    if(!auth||!ledger||authResult.rows.length!==1||ledgerResult.rows.length!==1 ||
       typeof auth.database_name!=='string'||!auth.database_name||auth.database_name!==ledger.database_name ||
       typeof auth.database_oid!=='string'||!/^[1-9][0-9]*$/.test(auth.database_oid)||auth.database_oid!==ledger.database_oid ||
       typeof auth.server_address!=='string'||!auth.server_address||auth.server_address!==ledger.server_address ||
       !Number.isInteger(auth.server_port)||auth.server_port<1||auth.server_port>65535||auth.server_port!==ledger.server_port ||
       typeof auth.postmaster_started!=='string'||!/^\d+(?:\.\d+)?$/.test(auth.postmaster_started)||auth.postmaster_started!==ledger.postmaster_started ||
       auth.server_in_recovery!==false||ledger.server_in_recovery!==false ||
       typeof auth.role!=='string'||!auth.role ||
       typeof ledger.role!=='string'||!ledger.role ||
       auth.session_role!==auth.role || ledger.session_role!==ledger.role ||
       auth.role===ledger.role ||
       auth.superuser!==false || auth.bypass_rls!==false || auth.role_memberships_present!==false ||
       ledger.superuser!==false || ledger.bypass_rls!==false || ledger.role_memberships_present!==false ||
       auth.auth_schema!==true || auth.team_schema!==true ||
       auth.credential_read!==true || auth.session_read!==true ||
       auth.session_insert!==true || auth.session_revoke!==true ||
       auth.membership_read!==true || auth.membership_write_denied!==true || auth.direct_scope_write_denied!==true ||
       auth.direct_audit_write_denied!==true || auth.direct_workspace_write_denied!==true ||
       auth.financial_write_denied!==true ||
       auth.event_read!==false || auth.draft_execute!==false || auth.review_execute!==false ||
       typeof auth.review_function_present!=='boolean' || typeof ledger.review_function_present!=='boolean' ||
       auth.review_function_present!==ledger.review_function_present || typeof ledger.review_execute!=='boolean' ||
       (!inspectAtomicCandidate && requireReview && (ledger.review_function_present!==true || ledger.review_execute!==true)) ||
       (!ledger.review_function_present && ledger.review_execute!==false) ||
       ledger.auth_schema!==false || ledger.team_schema!==true || ledger.event_read!==true ||
       (!inspectAtomicCandidate && ledger.draft_execute!==true) || ledger.membership_write_denied!==true || ledger.direct_scope_write_denied!==true ||
       ledger.direct_audit_write_denied!==true || ledger.direct_workspace_write_denied!==true)deny();
    for(const key of Object.keys(ATOMIC_SIGNATURES)){
      if(typeof auth[`${key}_present`]!=='boolean'||auth[`${key}_present`]!==ledger[`${key}_present`]||
         typeof auth[`${key}_execute`]!=='boolean'||typeof ledger[`${key}_execute`]!=='boolean'||
         (!auth[`${key}_present`]&&(auth[`${key}_execute`]||ledger[`${key}_execute`]))||
         (!inspectAtomicCandidate&&(auth[`${key}_execute`]||ledger[`${key}_execute`])))deny();
    }
    if(inspectAtomicCandidate){
      if(ledger.draft_execute!==false || ledger.review_function_present!==true || ledger.review_execute!==false)deny();
      for(const key of Object.keys(ATOMIC_SIGNATURES)){
        if(auth[`${key}_present`]!==true || ledger[`${key}_present`]!==true ||
           auth[`${key}_execute`]!==false || ledger[`${key}_execute`]!==true)deny();
      }
      // The role projection does not verify function body, owner, crypto,
      // RLS, grants inherited by other roles, or actual PostgreSQL behavior.
      // Keep qualified=false so both pool clients are destroyed: function
      // identity and security are not established by this projection.
      return Object.freeze({qualified:false,atomic_permissions_match:true,
        reason:'TEAM_ATOMIC_FUNCTION_IDENTITY_UNVERIFIED',auth_role:auth.role,ledger_role:ledger.role});
    }
    qualified=true;
    return Object.freeze({qualified:true,auth_role:auth.role,ledger_role:ledger.role});
  } finally {
    // Failures destroy acquired clients so that a disputed role cannot be
    // reused. If distinct pool wrappers return one shared client, release once.
    if(l&&l!==a)try{l.release(!qualified);}catch{}
    if(a)try{a.release(!qualified);}catch{}
  }
}
module.exports=Object.freeze({qualifyIsolatedPoolRoles});
