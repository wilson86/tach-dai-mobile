'use strict';
// REVIEW-ONLY: generate a read-only PostgreSQL catalog query and evaluate its
// synthetic/isolated result. Does not connect to DB or authorize a deployment.
const ROLE='synthetic_receipt_ledger';
const OWNER='kts_receipt_read_owner';
const FUNCTION='kts_team.candidate_receipt_read_v1(text,text,text,bigint,text[],text)';
const TABLES=Object.freeze([
  'kts_team.idempotency_receipts', 'kts_team.scope_events',
  'kts_team.memberships', 'kts_team.identities',
  'kts_auth.sessions', 'kts_auth.credentials'
]);
const quote=s=>"'"+s.replaceAll("'","''")+"'";
function buildSql(){
 const owner=quote(OWNER), fn=quote(FUNCTION);
 const tableProjection=TABLES.map(t=>quote(t)+',jsonb_build_object('+[
   "'TABLE_SELECT',has_table_privilege(current_user,"+quote(t)+",'SELECT')",
   "'COLUMN_SELECT',has_any_column_privilege(current_user,"+quote(t)+",'SELECT')"
 ].join(',')+')').join(',');
 const ownerOid='(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='+owner+')';
 const fnOid='pg_catalog.to_regprocedure('+fn+')';
 return 'SELECT row_to_json(a)::text FROM (SELECT '+
  'current_user::text AS current_user,session_user::text AS session_user,'+
  'COALESCE((SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user),true) AS superuser,'+
  'COALESCE((SELECT rolbypassrls FROM pg_catalog.pg_roles WHERE rolname=current_user),true) AS bypass_rls,'+
  'EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user)) AS any_membership,'+
  'pg_catalog.pg_has_role(current_user,'+owner+",'MEMBER') AS owner_member,"+
  "has_schema_privilege(current_user,'kts_team','CREATE') AS team_create,"+
  "has_schema_privilege(current_user,'kts_auth','CREATE') AS auth_create,"+
  "has_schema_privilege(current_user,'kts_crypto','CREATE') AS crypto_create,"+
  'jsonb_build_object('+tableProjection+') AS direct_reads,'+
  'COALESCE(has_function_privilege(current_user,'+fnOid+",'EXECUTE'),false) AS candidate_execute,"+
  'EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_roles o ON o.oid=p.proowner '+
  'WHERE p.oid='+fnOid+' AND o.rolname='+owner+
  " AND NOT o.rolcanlogin AND NOT o.rolsuper AND NOT o.rolbypassrls"+
  " AND p.prosecdef AND 'search_path=pg_catalog'=ANY(p.proconfig)"+
  ' AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.roleid='+ownerOid+' OR m.member='+ownerOid+')) AS owner_boundary,'+
  'EXISTS(SELECT 1 FROM pg_catalog.pg_proc p CROSS JOIN LATERAL pg_catalog.aclexplode('+
  "COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl "+
  'WHERE p.oid='+fnOid+" AND acl.grantee=0 AND acl.privilege_type='EXECUTE') AS public_execute"+
  ') a';
}
function fail(type){throw Error('RECEIPT_GRANT_AUDIT_'+type)}
function evaluate(row){
 if(!row||typeof row!=='object'||Array.isArray(row)||
   row.current_user!==ROLE||row.session_user!==ROLE) fail('ROLE_MISMATCH');
 const deny=['superuser','bypass_rls','any_membership','owner_member','team_create','auth_create','crypto_create','public_execute'];
 const requireTrue=['candidate_execute','owner_boundary'];
 for(const key of [...deny,...requireTrue]){
   if(typeof row[key]!=='boolean')fail('FIELD_INVALID');
   if(deny.includes(key)&&row[key])fail('FORBIDDEN_PRIVILEGE_'+key.toUpperCase());
   if(requireTrue.includes(key)&&!row[key])fail('REQUIRED_BOUNDARY_MISSING_'+key.toUpperCase());
 }
 if(!row.direct_reads||typeof row.direct_reads!=='object'||Array.isArray(row.direct_reads)||
    Object.keys(row.direct_reads).length!==TABLES.length) fail('TABLE_PROJECTION_INVALID');
 for(const table of TABLES){
   const flags=row.direct_reads[table];
   if(!flags||typeof flags!=='object'||Array.isArray(flags)||
     Object.keys(flags).length!==2||
     typeof flags.TABLE_SELECT!=='boolean'||typeof flags.COLUMN_SELECT!=='boolean')
       fail('TABLE_PROJECTION_INVALID');
   if(flags.TABLE_SELECT||flags.COLUMN_SELECT)fail('DIRECT_READ_'+table);
 }
 return Object.freeze({status:'SYNTHETIC_RECEIPT_GRANT_CATALOG_PASS',
   inspected_tables:TABLES.length,role:ROLE,
   tenant_isolation_qualified:false,production_qualified:false});
}
module.exports=Object.freeze({ROLE,OWNER,FUNCTION,TABLES,buildSql,evaluate});
