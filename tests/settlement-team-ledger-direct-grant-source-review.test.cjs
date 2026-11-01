'use strict';
// Independent source-contract review; this does not execute SQL or prove RLS.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('direct scope grant and invoker functions require a reviewed privilege redesign',()=>{
  const schema=fs.readFileSync('team-settlement/migrations/001_team_ledger.sql','utf8');
  const draft=fs.readFileSync('team-settlement/migrations/002_draft_transaction.sql','utf8');
  const review=fs.readFileSync('team-settlement/migrations/004_review_workflow.sql','utf8');
  const runner=fs.readFileSync('C:\\KTS-Settlement\\w20-2d63c84e\\Run-RealPilot20.ps1','utf8');
  assert.match(runner,/GRANT INSERT,UPDATE ON kts_team\.scopes TO \$ledger/);
  assert.match(schema,/CREATE POLICY team_scopes_scope ON kts_team\.scopes\s+USING \(workspace_id = current_setting\('kts\.workspace_id', true\)\)\s+WITH CHECK \(workspace_id = current_setting\('kts\.workspace_id', true\)\)/);
  assert.match(draft,/SECURITY INVOKER/i);assert.match(review,/SECURITY INVOKER/i);
  assert.match(review,/UPDATE kts_team\.scopes/i);
  assert.doesNotMatch(schema,/BEFORE\s+(?:UPDATE|INSERT|DELETE)[\s\S]{0,80}ON\s+kts_team\.scopes/i);
});
