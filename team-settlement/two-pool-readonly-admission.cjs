'use strict';
// SYNTHETIC ONLY. Read-only projections from two injected distinct PG pools.
// No connection, credentials, network, SQL writes or deployment on import.
const {createPgTransactionAdapter}=require('./pg-transaction-adapter.cjs');
const ROLE=/^[a-z][a-z0-9_]{2,62}$/;
const FINANCIAL_TABLES=['workspaces','memberships','counterparties','scopes',
 'scope_events','idempotency_receipts','identities'];
const TABLE_MUTATIONS=['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'];
const FINANCIAL_GRANTS=FINANCIAL_TABLES.flatMap(name=>{
 const table=`kts_team.${name}`;
 return [...TABLE_MUTATIONS.map(verb=>`has_table_privilege(current_user,'${table}','${verb}')`),
  ...['INSERT','UPDATE','REFERENCES'].map(verb=>`has_any_column_privilege(current_user,'${table}','${verb}')`)];
}).join(' OR ');
const AUDIT_SQL=[
"SELECT current_user::text AS role, session_user::text AS session_role,",
"current_database()::text AS database_name,",
"inet_server_addr()::text AS server_address, inet_server_port()::integer AS server_port,",
"pg_postmaster_start_time()::text AS postmaster_started,",
"(SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user) AS superuser,",
"(SELECT rolbypassrls FROM pg_catalog.pg_roles WHERE rolname=current_user) AS bypass_rls,",
"EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r",
"ON r.oid=m.member WHERE r.rolname=current_user) AS has_role_memberships,",
"(SELECT count(*)::integer FROM pg_catalog.pg_default_acl) AS default_acl_entries,",
"has_schema_privilege(current_user,'kts_auth','CREATE') AS create_auth_schema,",
"has_schema_privilege(current_user,'kts_team','CREATE') AS create_team_schema,",
"has_schema_privilege(current_user,'kts_crypto','CREATE') AS create_crypto_schema,",
"COALESCE(has_function_privilege(current_user,to_regprocedure('kts_team.append_draft(text,text,date,text,bigint,text,text,text,jsonb)'),'EXECUTE'),true) AS raw_append_execute,",
"COALESCE(has_function_privilege(current_user,to_regprocedure('kts_team.advance_review(text,text,date,text,text,bigint,text,text,text)'),'EXECUTE'),true) AS raw_review_execute,",
`(${FINANCIAL_GRANTS}) AS any_financial_mutation,`,
"has_table_privilege(current_user,'kts_auth.credentials','SELECT') AS read_credentials,",
"has_table_privilege(current_user,'kts_auth.sessions','SELECT') AS read_sessions,",
"has_any_column_privilege(current_user,'kts_auth.credentials','SELECT') AS read_credentials_any_column,",
"has_any_column_privilege(current_user,'kts_auth.sessions','SELECT') AS read_sessions_any_column,",
"(has_column_privilege(current_user,'kts_team.memberships','workspace_id','SELECT') AND has_column_privilege(current_user,'kts_team.memberships','user_id','SELECT') AND has_column_privilege(current_user,'kts_team.memberships','team_role','SELECT') AND has_column_privilege(current_user,'kts_team.memberships','revoked_at','SELECT')) AS read_memberships,",
"has_column_privilege(current_user,'kts_team.identities','user_id','SELECT') AS read_identity_user_id,",
"has_column_privilege(current_user,'kts_team.identities','disabled_at','SELECT') AS read_identity_disabled_at,",
"has_column_privilege(current_user,'kts_team.identities','auth_subject','SELECT') AS read_identity_auth_subject,",
"has_table_privilege(current_user,'kts_team.scope_events','SELECT') AS read_scope_events,",
"has_table_privilege(current_user,'kts_team.idempotency_receipts','SELECT') AS read_receipts,",
"has_table_privilege(current_user,'kts_team.idempotency_receipts','INSERT') AS insert_receipts,",
"has_table_privilege(current_user,'kts_team.idempotency_receipts','UPDATE') AS update_receipts,",
"has_any_column_privilege(current_user,'kts_team.idempotency_receipts','UPDATE') AS update_receipts_any_column,",
"has_table_privilege(current_user,'kts_team.scope_events','INSERT') AS insert_scope_events,",
"has_table_privilege(current_user,'kts_team.scopes','INSERT') AS insert_scopes,",
"has_table_privilege(current_user,'kts_team.scopes','UPDATE') AS update_scopes,",
"has_any_column_privilege(current_user,'kts_team.scopes','UPDATE') AS update_scopes_any_column,",
"has_table_privilege(current_user,'kts_team.memberships','UPDATE') AS update_memberships,",
"has_table_privilege(current_user,'kts_team.workspaces','INSERT') AS insert_workspaces,",
"(has_column_privilege(current_user,'kts_auth.sessions','session_hash','INSERT') AND has_column_privilege(current_user,'kts_auth.sessions','user_id','INSERT') AND has_column_privilege(current_user,'kts_auth.sessions','workspace_id','INSERT') AND has_column_privilege(current_user,'kts_auth.sessions','issued_at','INSERT') AND has_column_privilege(current_user,'kts_auth.sessions','expires_at','INSERT')) AS insert_sessions,",
"has_any_column_privilege(current_user,'kts_auth.sessions','INSERT') AS insert_sessions_any_column,",
"has_column_privilege(current_user,'kts_auth.sessions','revoked_at','UPDATE') AS revoke_sessions,",
"current_setting('log_parameter_max_length_on_error',true) AS parameter_error_limit,",
"current_setting('log_statement',true) AS statement_log_mode,",
"current_setting('log_min_error_statement',true) AS error_statement_log_mode"
].join(' ');
const BOOLEAN=['superuser','bypass_rls','has_role_memberships','create_auth_schema',
 'create_team_schema','create_crypto_schema','raw_append_execute','raw_review_execute','any_financial_mutation','read_credentials','read_sessions',
 'read_credentials_any_column','read_sessions_any_column',
 'read_memberships','read_identity_user_id','read_identity_disabled_at','read_identity_auth_subject',
 'read_scope_events','read_receipts','insert_receipts','update_receipts',
 'update_receipts_any_column','insert_scope_events','insert_scopes',
 'update_scopes','update_scopes_any_column','update_memberships',
 'insert_workspaces','insert_sessions','insert_sessions_any_column','revoke_sessions'];
const DIRECT=['insert_receipts','update_receipts','update_receipts_any_column',
 'insert_scope_events','insert_scopes','update_scopes','update_scopes_any_column',
 'update_memberships','insert_workspaces'];
function deny(code){throw Error(code)}
function validate(row,expected){
 if(!row||typeof row!=='object'||Array.isArray(row)||
   row.role!==expected||row.session_role!==expected||
   typeof row.database_name!=='string'||!row.database_name||
   row.server_address!=='127.0.0.1'||!Number.isInteger(row.server_port)||
   row.server_port<1||row.server_port>65535||
   typeof row.postmaster_started!=='string'||!row.postmaster_started)
   deny('TEAM_TWO_POOL_AUTHORITY_UNVERIFIED');
 for(const k of BOOLEAN)if(typeof row[k]!=='boolean')
   deny('TEAM_TWO_POOL_RESULT_MISSING_'+k);
 if(row.superuser||row.bypass_rls||row.has_role_memberships||
    row.create_auth_schema||row.create_team_schema||row.create_crypto_schema||
    row.raw_append_execute||row.raw_review_execute)
   deny('TEAM_TWO_POOL_ROLE_PRIVILEGED');
 for(const k of DIRECT)if(row[k])deny('TEAM_TWO_POOL_DIRECT_MUTATION_'+k);
 if(row.any_financial_mutation)deny('TEAM_TWO_POOL_DIRECT_MUTATION_EFFECTIVE');
 if(!Number.isInteger(row.default_acl_entries)||row.default_acl_entries<0)
   deny('TEAM_TWO_POOL_DEFAULT_ACL_UNKNOWN');
 if(typeof row.parameter_error_limit!=='string'||
    typeof row.statement_log_mode!=='string'||
    typeof row.error_statement_log_mode!=='string')
   deny('TEAM_TWO_POOL_LOG_SETTINGS_UNKNOWN');
 return row;
}
function assess(auth,ledger,authName,ledgerName){
 validate(auth,authName);validate(ledger,ledgerName);
 if(auth.database_name!==ledger.database_name||
   auth.server_address!==ledger.server_address||auth.server_port!==ledger.server_port||
   auth.postmaster_started!==ledger.postmaster_started)
   deny('TEAM_TWO_POOL_DIFFERENT_SERVER');
 if(authName===ledgerName)deny('TEAM_TWO_POOL_IDENTITIES_NOT_ISOLATED');
 if(auth.read_credentials!==true||auth.read_sessions!==true||
    auth.insert_sessions!==true||auth.revoke_sessions!==true||
    auth.read_memberships!==true||auth.read_identity_user_id!==true||
    auth.read_identity_disabled_at!==true||auth.read_identity_auth_subject!==true||
    auth.read_scope_events!==false||auth.read_receipts!==false)
   deny('TEAM_TWO_POOL_AUTH_MINIMUM_MISMATCH');
 if(ledger.read_credentials!==false||ledger.read_sessions!==false||
    ledger.read_credentials_any_column!==false||ledger.read_sessions_any_column!==false||
    ledger.read_memberships!==true||ledger.read_identity_user_id!==true||
    ledger.read_identity_disabled_at!==true||ledger.read_identity_auth_subject!==false||
    ledger.read_scope_events!==true||ledger.read_receipts!==true||
    ledger.insert_sessions_any_column!==false||ledger.revoke_sessions!==false)
   deny('TEAM_TWO_POOL_LEDGER_MINIMUM_MISMATCH');
 if(auth.parameter_error_limit!=='0'||ledger.parameter_error_limit!=='0'||
    auth.statement_log_mode!=='none'||ledger.statement_log_mode!=='none')
   deny('TEAM_TWO_POOL_PG_LOGGING_SETTINGS_UNSAFE');
 if(auth.default_acl_entries!==0||ledger.default_acl_entries!==0)
   deny('TEAM_TWO_POOL_DEFAULT_ACL_REVIEW_REQUIRED');
 return Object.freeze({
   status:'SYNTHETIC_TWO_POOL_READ_ONLY_PROJECTION_PASS',
   auth_role:authName,ledger_role:ledgerName,
   server:'LOOPBACK_ONLY',separate_login_roles:true,
   direct_financial_mutation_grants:false,
   default_acl_override_rows:0,postgres_error_parameters_disabled:true,
   postgres_statement_logging_disabled:true,inherited_grants_observed:false,
   operational_pool_config:'NOT_VERIFIED',
   default_public_function_execute:'NOT_VERIFIED',
   application_logging:'NOT_VERIFIED',proxy_logging:'NOT_VERIFIED',
   error_sink_logging:'NOT_VERIFIED',backup_logging:'NOT_VERIFIED',
   tenant_guc_trust:'NOT_VERIFIED',browser_durability:'NOT_VERIFIED',
   integrated_postgresql_recovery:'NOT_VERIFIED',
   independent_security_signoff:'NOT_RUN',
   production_qualified:false,write_block:'ENABLED'
 });
}
async function inspectProposedPools({authPool,ledgerPool,authRole,ledgerRole,syntheticOnly=false}={}){
 if(syntheticOnly!==true)deny('TEAM_TWO_POOL_SYNTHETIC_ONLY');
 if(!authPool||!ledgerPool||authPool===ledgerPool||
    typeof authPool.connect!=='function'||typeof ledgerPool.connect!=='function'||
    typeof authRole!=='string'||!ROLE.test(authRole)||
    typeof ledgerRole!=='string'||!ROLE.test(ledgerRole)||authRole===ledgerRole)
   deny('TEAM_TWO_POOL_CONFIG_INVALID');
 const read=async pool=>{
   const db=createPgTransactionAdapter({pool});
   return db.transaction(async tx=>{
      await tx.query('SET TRANSACTION READ ONLY');
      const result=await tx.query(AUDIT_SQL);
      if(!result||!Array.isArray(result.rows)||result.rows.length!==1)
        deny('TEAM_TWO_POOL_QUERY_RESULT_INVALID');
      return result.rows[0];
   });
 };
 const auth=await read(authPool);
 const ledger=await read(ledgerPool);
 return assess(auth,ledger,authRole,ledgerRole);
}
module.exports=Object.freeze({AUDIT_SQL,assess,inspectProposedPools});
