'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const P=require('../scripts/settlement-pg-driver-discovery-readonly.cjs');
const sql=fs.readFileSync(path.join(__dirname,'..','team-settlement','candidate',
 'two-role-privilege-readonly-review.sql'),'utf8');
const inventory=fs.readFileSync(path.join(__dirname,'..','scripts',
 'settlement-pg-driver-discovery-readonly.cjs'),'utf8');
const realpath=x=>x;
test('scope: C-only checkout accepted, UNC/E/F/relative/junction outside rejected',()=>{
 const c='C:\\KTS-Settlement\\TWO_POOL_4a3dd_20261104';
 assert.equal(P.insideC(c,{realpath}),c);
 assert.equal(P.insideC('C:/KTS-Settlement/TWO_POOL_4a3dd_20261104',{realpath}),c);
 for(const p of ['E:\\KTS-Settlement\\thing','F:/tmp/thing',
   'C:relative\\test','\\\\server\\share\\checkout','C:\\Windows\\temp'])
   assert.throws(()=>P.insideC(p,{realpath}),/PG_DRIVER_/);
 assert.throws(()=>P.insideC(c,{realpath:()=> 'E:\\escape\\test'}),
  /PG_DRIVER_REPARSE_OR_OUTSIDE_PROJECT/);
});
test('no pg module: explicitly blocked without network, install or release approval',()=>{
 const missing=()=>{const e=Error('Cannot find module pg');e.code='MODULE_NOT_FOUND';throw e};
 const result=P.find({root:'C:\\KTS-Settlement\\TWO_POOL_4a3dd_20261104',
  resolve:missing,realpath});
 assert.equal(result.status,'PG_MODULE_NOT_FOUND_IN_CHECKOUT');
 assert.equal(result.network,false);
 assert.equal(result.install,false);
 assert.equal(result.production_qualified,false);
 assert.equal(result.approval,'NOT_GRANTED');
 assert.doesNotMatch(inventory,/execFileSync\(['"]npm['"]/);
 assert.doesNotMatch(inventory,/require\(['"]pg['"]\)/);
});
test('real PostgreSQL catalog review is read-only and requires scratch opt-in',()=>{
 assert.match(sql,/^\\set ON_ERROR_STOP on/m);
 assert.match(sql,/^\\if :\{\?KTS_DISPOSABLE_PG_ONLY\}/m);
 assert.match(sql,/SELECT 1\/0; -- missing opt-in/);
 assert.match(sql,/BEGIN TRANSACTION READ ONLY;/);
 assert.match(sql,/ROLLBACK;/);
 assert.match(sql,/^\\echo SYNTHETIC_TWO_ROLE_CATALOG_READONLY_PASS/m);
 assert.doesNotMatch(sql,/(?:^|\n)\s*(?:CREATE ROLE|ALTER ROLE|GRANT|REVOKE|UPDATE|INSERT INTO|DELETE FROM|DROP)\b/im);
});
test('sensitive function ACL, two real logins, inherited grants and narrow ledger identity read guarded',()=>{
 const tokens=[
  'pg_catalog.pg_auth_members','pg_catalog.pg_default_acl',
  "a.grantee=0 AND a.privilege_type='EXECUTE'",
  "has_function_privilege('synthetic_auth_login'",
  "has_function_privilege('synthetic_ledger_login'",
  "has_column_privilege('synthetic_ledger_login','kts_team.identities','user_id'",
  "has_column_privilege('synthetic_ledger_login','kts_team.identities','disabled_at'",
  "NOT pg_catalog.has_column_privilege('synthetic_ledger_login','kts_team.identities','auth_subject'",
  "pg_catalog.has_any_column_privilege(r.role_name,t.tab,'UPDATE')",
  "pg_catalog.has_table_privilege(r.role_name,t.tab,'INSERT')",
  "REVIEW_TWO_REAL_LOGIN_ROLES_MISSING",
  "REVIEW_FUNCTION_PUBLIC_OR_LOGIN_EXECUTE"
 ];
 for(const marker of tokens)assert.ok(sql.includes(marker),'missing '+marker);
 for(const fn of ['atomic_review_v1','atomic_review_reconcile_v1',
    'atomic_draft_v1','atomic_draft_reconcile_v1','append_draft','advance_review'])
  assert.ok(sql.includes('kts_team.'+fn+'('),'missing function '+fn);
});
