'use strict';
// Static migration baseline for a future privilege redesign. This does not
// execute PostgreSQL and cannot prove runtime isolation or authorization.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const draft=fs.readFileSync('team-settlement/migrations/002_draft_transaction.sql','utf8');
const review=fs.readFileSync('team-settlement/migrations/004_review_workflow.sql','utf8');
const repo=fs.readFileSync('team-settlement/postgres-ledger-repository.cjs','utf8');
for(const [name,sql] of [['draft',draft],['review',review]])test(`${name} keeps the source prerequisites the candidate must preserve`,()=>{
  assert.match(sql,/SECURITY INVOKER/i);assert.match(sql,/current_setting\('kts\.actor_user_id', true\)/);
  assert.match(sql,/current_setting\('kts\.workspace_id', true\)/);assert.match(sql,/TEAM_ROLE_DENIED/);
  assert.match(sql,/pg_advisory_xact_lock/);assert.match(sql,/FOR UPDATE/);assert.match(sql,/TEAM_REVISION_CONFLICT/);
  assert.match(sql,/request_sha256/);assert.match(sql,/INSERT INTO kts_team\.scope_events/);assert.match(sql,/INSERT INTO kts_team\.idempotency_receipts/);
});
test('shared ledger pool sets actor and workspace through transaction-local settings',()=>{
  assert.match(repo,/set_config\('kts\.workspace_id',\$1,true\), set_config\('kts\.actor_user_id',\$2,true\)/);
  assert.match(review,/TEAM_SEPARATION_OF_DUTIES/);
});
