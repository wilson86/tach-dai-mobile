'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const bootstrap=read('team-settlement/candidate/atomic-compile-bootstrap.sql');
const runner=read('scripts/settlement-pg-isolated-migrations.cjs');
const candidate=read('team-settlement/candidate/atomic-review-v1.sql');
test('atomic preconditions are explicit, restricted to scratch role and crypto schema',()=>{
  assert.match(bootstrap,/CREATE ROLE kts_atomic_owner NOLOGIN NOSUPERUSER NOBYPASSRLS/);
  assert.match(bootstrap,/CREATE EXTENSION pgcrypto WITH SCHEMA kts_crypto/);
  assert.match(bootstrap,/REVOKE ALL ON SCHEMA kts_crypto FROM PUBLIC/);
  assert.doesNotMatch(bootstrap,/GRANT\s+(?:EXECUTE|SELECT|INSERT|UPDATE|DELETE)/i);
  assert.match(bootstrap,/SYNTHETIC_ATOMIC_PREREQUISITES_READY/);
});
test('candidate remains outside four canonical migrations and without runtime grant',()=>{
  assert.match(runner,/const SQL=\[[\s\S]+004_review_workflow\.sql'[\s\S]+\];/);
  const first=runner.slice(runner.indexOf('const SQL='),runner.indexOf('const ROOT='));
  assert.doesNotMatch(first,/atomic-review-v1\.sql/);
  assert.match(candidate,/REVOKE ALL ON FUNCTION kts_team\.atomic_review_v1/);
  assert.match(candidate,/ALTER FUNCTION kts_team\.atomic_draft_v1[\s\S]+OWNER TO kts_atomic_owner/);
  assert.doesNotMatch(candidate,/GRANT EXECUTE/i);
});
test('runner can only mark atomic DDL pass after 2 SQL stages and four no-PUBLIC-execute owners',()=>{
  assert.match(runner,/receipt\.status==='MIGRATIONS_AND_LIMITED_CATALOG_PASS'/);
  assert.match(runner,/atomic-compile-bootstrap\.sql/);
  assert.match(runner,/atomic-review-v1\.sql/);
  assert.match(runner,/receipt\.atomic_ddl\.stages\.length===2/);
  assert.match(runner,/receipt\.atomic_ddl\.stages\.every\(s=>s\.passed\)/);
  assert.match(runner,/catalog\.ok&&catalog\.output\.trim\(\)==='4'/);
  assert.match(runner,/r\.rolname='kts_atomic_owner'/);
  assert.match(runner,/p\.prosecdef/);
  assert.match(runner,/acl\.grantee=0 AND acl\.privilege_type='EXECUTE'/);
  assert.match(runner,/receipt\.status='BLOCKED_ATOMIC_CANDIDATE_DDL'/);
  assert.match(runner,/ATOMIC_DDL_REVIEW_ONLY_PASS/);
});
