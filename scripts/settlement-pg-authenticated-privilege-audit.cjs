'use strict';
// Read-only, isolated synthetic PG16 privilege check. NOT production attestation.
const cp=require('node:child_process');
const TABLES=['workspaces','memberships','counterparties','scopes','scope_events','idempotency_receipts','identities'];
const VERBS=['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'];
const ROLE='synthetic_atomic_caller';
const RAW=[
 'kts_team.append_draft(text,text,date,text,bigint,text,text,text,jsonb)',
 'kts_team.advance_review(text,text,date,text,text,bigint,text,text,text)'
];
function reject(code){throw Error(code)}
function sqlString(s){return "'"+s.replaceAll("'","''")+"'";}
function buildSql(){
 const t=TABLES.map(name=>{
  const full='kts_team.'+name;
  const privileges=VERBS.map(verb=>sqlString(verb)+', has_table_privilege(current_user,'+
    sqlString(full)+','+sqlString(verb)+')');
  privileges.push("'ANY_COLUMN_INSERT', has_any_column_privilege(current_user,"+sqlString(full)+",'INSERT')");
  privileges.push("'ANY_COLUMN_UPDATE', has_any_column_privilege(current_user,"+sqlString(full)+",'UPDATE')");
  return sqlString(name)+',jsonb_build_object('+privileges.join(',')+')';
 });
 const fn=name=>'has_function_privilege(current_user,'+sqlString(name)+",'EXECUTE')";
 return "SELECT row_to_json(a)::text FROM (SELECT "+
  "current_user::text AS current_user,session_user::text AS session_user,"+
  "COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname=current_user),true) AS superuser,"+
  "COALESCE((SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user),true) AS bypass_rls,"+
  "pg_has_role(current_user,'kts_atomic_owner','MEMBER') AS owner_member,"+
  "EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS any_membership,"+
  "has_schema_privilege(current_user,'kts_team','CREATE') AS team_create,"+
  "has_schema_privilege(current_user,'kts_auth','CREATE') AS auth_create,"+
  "has_schema_privilege(current_user,'kts_crypto','CREATE') AS crypto_create,"+
  fn(RAW[0])+" AS raw_append_execute,"+fn(RAW[1])+" AS raw_review_execute,"+
  "jsonb_build_object("+t.join(',')+") AS tables,"+
  "jsonb_build_object('draft',"+fn('kts_team.atomic_draft_v1(text,text,bigint,text,text,text,date,text,text,bigint,text,text,text,text)')+
   ",'draft_lookup',"+fn('kts_team.atomic_draft_reconcile_v1(text,text,bigint,text,text,text,date,text,text,bigint,text,text,text)')+
   ",'review',"+fn('kts_team.atomic_review_v1(text,text,bigint,text,text,text,date,text,text,bigint,text,text,text)')+
   ",'review_lookup',"+fn('kts_team.atomic_review_reconcile_v1(text,text,bigint,text,text,text,date,text,text,bigint,text,text)')+
   ") AS atomic) a";
}
function evaluate(row){
 if(!row||typeof row!=='object'||Array.isArray(row)||
   row.current_user!==ROLE||row.session_user!==ROLE)reject('AUDIT_ROLE_MISMATCH');
 for(const key of ['superuser','bypass_rls','owner_member','any_membership',
   'team_create','auth_create','crypto_create','raw_append_execute','raw_review_execute']){
  if(typeof row[key]!=='boolean')reject('AUDIT_FIELD_INVALID');
  if(row[key])reject('AUDIT_FORBIDDEN_PRIVILEGE_'+key.toUpperCase());
 }
 if(!row.tables||typeof row.tables!=='object'||Array.isArray(row.tables)||
    Object.keys(row.tables).length!==TABLES.length)reject('AUDIT_TABLE_PROJECTION_INVALID');
 for(const name of TABLES){
  const privileges=row.tables[name];
  if(!privileges||typeof privileges!=='object'||Array.isArray(privileges)||
    Object.keys(privileges).length!==VERBS.length+2)reject('AUDIT_TABLE_PROJECTION_INVALID');
  for(const key of [...VERBS,'ANY_COLUMN_INSERT','ANY_COLUMN_UPDATE']){
    if(typeof privileges[key]!=='boolean')reject('AUDIT_FIELD_INVALID');
    if(privileges[key])reject('AUDIT_DIRECT_MUTATION_'+name+'_'+key);
  }
 }
 if(!row.atomic||typeof row.atomic!=='object'||Array.isArray(row.atomic)||
    ['draft','draft_lookup','review','review_lookup'].some(k=>typeof row.atomic[k]!=='boolean'))
   reject('AUDIT_ATOMIC_PROJECTION_INVALID');
 if(row.atomic.draft!==true||row.atomic.draft_lookup!==true)
    reject('AUDIT_EXPECTED_SYNTHETIC_GRANT_MISSING');
 return Object.freeze({status:'SYNTHETIC_AUTHENTICATED_EFFECTIVE_GRANTS_PASS',
   role:ROLE,inspected_tables:TABLES.length,prohibited_effective_grants:0,
   production_grants_qualified:false,
   atomic_permissions:Object.freeze({...row.atomic})});
}
function main(){
 const [psql,port,cwd]=process.argv.slice(2);
 if(process.platform!=='win32'||
   !/^C:\\Program Files\\PostgreSQL\\16\\bin\\psql\.exe$/i.test(psql||'')||
   !/^\d{2,5}$/.test(port||'')||
   !/^C:\\KTS-Settlement\\PG_SYNTHETIC_[a-f0-9]{10}_[0-9]+_[a-f0-9]{8}$/i.test(cwd||'')||
   process.env.PGHOST!=='127.0.0.1')reject('AUDIT_SYNTHETIC_SCOPE_INVALID');
 const proc=cp.spawnSync(psql,['-X','-w','-A','-t','-v','ON_ERROR_STOP=1',
  '-h','127.0.0.1','-p',port,'-U',ROLE,'-d','postgres',
  '-c','BEGIN TRANSACTION READ ONLY; '+buildSql()+'; COMMIT;'],{
   cwd,env:{...process.env,PGPASSWORD:'synthetic_fixture_only_password_7291',
      PGOPTIONS:''},encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:131072
  });
 if(proc.error||proc.status!==0)reject('AUDIT_PSQL_READ_FAILED');
 const rows=String(proc.stdout||'').split(/\r?\n/).filter(x=>x.trim().startsWith('{'));
 if(rows.length!==1)reject('AUDIT_PSQL_ROW_COUNT');
 let projection;try{projection=JSON.parse(rows[0]);}catch(_){reject('AUDIT_PSQL_JSON_INVALID')}
 const x=evaluate(projection);
 process.stdout.write(x.status+' role='+x.role+' tables='+x.inspected_tables+
  ' direct_mutation=0 role_membership=0 raw_execute=0 atomic_permissions='+
  JSON.stringify(x.atomic_permissions)+'\n');
}
if(require.main===module){
 try{main()}catch(e){process.stderr.write(String(e.message||'AUDIT_FAILED')+'\n');process.exitCode=2}
}
module.exports=Object.freeze({evaluate,buildSql,TABLES,VERBS});
