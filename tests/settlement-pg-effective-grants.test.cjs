'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const audit=require('../scripts/settlement-pg-authenticated-privilege-audit.cjs');
const fs=require('node:fs'),path=require('node:path');
const runner=fs.readFileSync(path.join(__dirname,'..','scripts/settlement-pg-isolated-migrations.cjs'),'utf8');
const empty=()=>{
 const cols=Object.fromEntries([...audit.VERBS,'ANY_COLUMN_INSERT','ANY_COLUMN_UPDATE'].map(k=>[k,false]));
 return {current_user:'synthetic_atomic_caller',session_user:'synthetic_atomic_caller',
 superuser:false,bypass_rls:false,owner_member:false,any_membership:false,
 team_create:false,auth_create:false,crypto_create:false,
 raw_append_execute:false,raw_review_execute:false,
 tables:Object.fromEntries(audit.TABLES.map(k=>[k,{...cols}])),
 atomic:{draft:true,draft_lookup:true,review:false,review_lookup:false}};
};
test('requires real synthetic login identity and no effective direct mutations',()=>{
 const x=audit.evaluate(empty());
 assert.equal(x.status,'SYNTHETIC_AUTHENTICATED_EFFECTIVE_GRANTS_PASS');
 assert.equal(x.inspected_tables,7);
 assert.equal(x.production_grants_qualified,false);
});
test('rejects inherited grants, any individual write, any column and non-boolean data',()=>{
 for(const field of ['superuser','bypass_rls','owner_member','any_membership',
  'team_create','auth_create','crypto_create','raw_append_execute','raw_review_execute']){
  const x=empty();x[field]=true;assert.throws(()=>audit.evaluate(x),/AUDIT_FORBIDDEN_PRIVILEGE/);
 }
 for(const t of audit.TABLES)for(const v of [...audit.VERBS,'ANY_COLUMN_INSERT','ANY_COLUMN_UPDATE']){
  const x=empty();x.tables[t][v]=true;assert.throws(()=>audit.evaluate(x),/AUDIT_DIRECT_MUTATION/);
 }
 const bad=empty();bad.tables.scopes.UPDATE=null;
 assert.throws(()=>audit.evaluate(bad),/AUDIT_FIELD_INVALID/);
});
test('rejects guessed role, missing projections, and missing legitimate atomic draft grants',()=>{
 const x=empty();x.session_user='qa_admin';assert.throws(()=>audit.evaluate(x),/AUDIT_ROLE_MISMATCH/);
 const y=empty();delete y.tables.identities;assert.throws(()=>audit.evaluate(y),/AUDIT_TABLE_PROJECTION_INVALID/);
 const z=empty();z.atomic.draft=false;assert.throws(()=>audit.evaluate(z),/AUDIT_EXPECTED_SYNTHETIC_GRANT_MISSING/);
});
test('read-only audit is integrated only after authenticated caller rollback is proven',()=>{
 const sql=audit.buildSql();
 assert.match(sql,/SELECT row_to_json/);
 assert.match(sql,/has_any_column_privilege/);
 assert.match(sql,/pg_has_role/);
 assert.doesNotMatch(sql,/GRANT |REVOKE |UPDATE kts_|INSERT INTO kts_/);
 const idx=runner.indexOf("if(!receipt.authenticated_caller_probe.rollback_verified)");
 const auditAt=runner.indexOf('settlement-pg-authenticated-privilege-audit.cjs');
 assert.ok(idx>=0&&auditAt>idx);
 assert.match(runner,/AUDIT_PROBE_FAILED/);
 assert.match(runner,/receipt\.authenticated_effective_grants/);
});
