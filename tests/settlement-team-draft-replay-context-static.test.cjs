'use strict';
// Source-level regression for the draft replay actor/context fix.
// NOT PostgreSQL proof; the disposable SQL regression must still execute.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const sql=fs.readFileSync('team-settlement/migrations/002_draft_transaction.sql','utf8');
const replayStart=sql.indexOf('  IF FOUND THEN\n    IF v_saved.request_sha256');
const replayEnd=sql.indexOf('\n  END IF;',replayStart);
assert.ok(replayStart>0 && replayEnd>replayStart,'UNEXPECTED_REPLAY_BLOCK');
const replay=sql.slice(replayStart,replayEnd);

test('same-key draft replay is bound to the original actor and exact business scope',()=>{
  for(const expression of [
    /v_replay_event\.actor_user_id IS DISTINCT FROM v_actor/,
    /v_replay_event\.partner_id IS DISTINCT FROM p_partner_id/,
    /v_replay_event\.business_date IS DISTINCT FROM p_business_date/,
    /v_replay_event\.region IS DISTINCT FROM p_region/,
    /v_replay_event\.scope_revision IS DISTINCT FROM \(p_expected_revision\+1\)/,
    /v_replay_event\.event_kind IS DISTINCT FROM/,
    /v_replay_event\.payload_sha256 IS DISTINCT FROM p_request_sha256/,
    /RAISE EXCEPTION 'TEAM_IDEMPOTENCY_CONTEXT_MISMATCH'/
  ])assert.match(replay,expression);
});
test('replay looks up the exact receipt event and returns its immutable feed identity',()=>{
  assert.match(replay,/WHERE workspace_id=p_workspace_id AND event_id=v_saved\.event_id;/);
  assert.match(replay,/TEAM_IDEMPOTENCY_RECEIPT_ORPHANED/);
  assert.match(replay,/v_replay_event\.scope_revision,'feed_seq',v_replay_event\.feed_seq/);
  assert.match(replay,/v_saved\.request_sha256<>p_request_sha256/);
});
test('does not weaken trusted-invoker and append-only audit contracts',()=>{
  assert.match(sql,/SECURITY INVOKER/);
  assert.match(sql,/current_setting\('kts\.actor_user_id', true\)/);
  assert.match(sql,/current_setting\('kts\.workspace_id', true\)/);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/INSERT INTO kts_team\.scope_events/);
  assert.match(sql,/INSERT INTO kts_team\.idempotency_receipts/);
});
