'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const audit=require('../scripts/settlement-receipt-read-grant-audit.cjs');
const safe=()=>({
  current_user:audit.ROLE,session_user:audit.ROLE,
  superuser:false,bypass_rls:false,any_membership:false,owner_member:false,
  team_create:false,auth_create:false,crypto_create:false,public_execute:false,
  candidate_execute:true,owner_boundary:true,
  direct_reads:Object.fromEntries(audit.TABLES.map(t=>[t,{TABLE_SELECT:false,COLUMN_SELECT:false}]))
});
test('synthetic-only catalog projection never certifies operational isolation',()=>{
  assert.deepEqual(audit.evaluate(safe()),{
    status:'SYNTHETIC_RECEIPT_GRANT_CATALOG_PASS',inspected_tables:6,
    role:audit.ROLE,tenant_isolation_qualified:false,production_qualified:false
  });
});
test('deny direct receipt, event, membership and auth SELECT including column-only grants',()=>{
  for(const t of audit.TABLES)for(const privilege of ['TABLE_SELECT','COLUMN_SELECT']){
    const v=safe();v.direct_reads[t][privilege]=true;
    assert.throws(()=>audit.evaluate(v),/RECEIPT_GRANT_AUDIT_DIRECT_READ/);
  }
});
test('deny privileged and ambiguous owner, runtime and EXECUTE provenance',()=>{
  for(const k of ['superuser','bypass_rls','any_membership','owner_member',
   'team_create','auth_create','crypto_create','public_execute']){
    const v=safe();v[k]=true;assert.throws(()=>audit.evaluate(v),/FORBIDDEN_PRIVILEGE/);
  }
  for(const k of ['candidate_execute','owner_boundary']){
    const v=safe();v[k]=false;assert.throws(()=>audit.evaluate(v),/REQUIRED_BOUNDARY_MISSING/);
  }
  for(const v of [{...safe(),session_user:'untrusted'},{...safe(),candidate_execute:null},
    {...safe(),direct_reads:{}},{...safe(),direct_reads:{...safe().direct_reads,['kts_auth.sessions']:{TABLE_SELECT:null,COLUMN_SELECT:false}}}])
    assert.throws(()=>audit.evaluate(v),/RECEIPT_GRANT_AUDIT_/);
});
test('read-only query checks inherited/column grants, function ACL, owner and session login',()=>{
  const sql=audit.buildSql();
  assert.match(sql,/^SELECT row_to_json\(a\)::text FROM/);
  assert.match(sql,/has_any_column_privilege/);
  assert.match(sql,/pg_auth_members/);
  assert.match(sql,/aclexplode/);
  assert.match(sql,/to_regprocedure/);
  assert.match(sql,/prosecdef/);
  assert.match(sql,/candidate_receipt_read_v1/);
  assert.doesNotMatch(sql,/\b(?:GRANT\s+|REVOKE\s+|ALTER\s+TABLE|CREATE\s+(?:FUNCTION|TABLE)|DROP\s+(?:TABLE|FUNCTION)|INSERT\s+INTO|UPDATE\s+kts_|DELETE\s+FROM|TRUNCATE\s+TABLE|SET\s+ROLE|set_config\s*\()/i);
});
