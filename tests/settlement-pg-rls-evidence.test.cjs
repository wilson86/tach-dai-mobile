'use strict';
// Source-contract checks ONLY: PostgreSQL still needs an isolated native run.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const sql=fs.readFileSync(path.join(root,'team-settlement/tests/postgres-rls-denied-write.sql'),'utf8');
const runner=fs.readFileSync(path.join(root,'scripts/settlement-pg-isolated-migrations.cjs'),'utf8');
test('RLS negative fixture proves same-tenant INSERT possible before foreign denial',()=>{
  assert.match(sql,/GRANT INSERT ON kts_team\.counterparties TO team_smoke_reader/);
  assert.match(sql,/SET LOCAL ROLE team_smoke_reader/);
  assert.match(sql,/VALUES\('group_a','synthetic_allowed'/);
  assert.match(sql,/LOCAL_WORKSPACE_INSERT_NOT_VISIBLE/);
});
test('RLS negative fixture distinguishes actual RLS policy rejection from other 42501 errors',()=>{
  assert.match(sql,/GET STACKED DIAGNOSTICS v_code = RETURNED_SQLSTATE/);
  assert.match(sql,/v_code='42501' AND v_message LIKE '%row-level security policy%'/);
  assert.match(sql,/RAISE NOTICE 'SYNTHETIC_RLS_WRITE_DENIAL_SQLSTATE=%'/);
  assert.match(sql,/CROSS_WORKSPACE_WRITE_NOT_DENIED_BY_RLS/);
  assert.match(sql,/ROLLBACK/);
  assert.doesNotMatch(sql,/EXCEPTION WHEN insufficient_privilege THEN NULL/);
});
test('runner records bounded SQL evidence and gates on RLS notice plus exit and marker',()=>{
  assert.match(runner,/receipt\.synthetic_psql_evidence=/);
  assert.match(runner,/tenant_read:\{exit_code:smoke\.exit_code,stdout_tail:smoke\.output/);
  assert.match(runner,/tenant_write=\{exit_code:write\.exit_code/);
  assert.match(runner,/write\.ok&&[\s\S]*write\.output\.includes\('SYNTHETIC_CROSS_WORKSPACE_WRITE_DENIED'\)&&[\s\S]*write\.error\.includes\('SYNTHETIC_RLS_WRITE_DENIAL_SQLSTATE=42501'\)/);
  assert.match(runner,/write_block:'ENABLED'/);
});
