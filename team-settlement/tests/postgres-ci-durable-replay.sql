\set ON_ERROR_STOP on
-- This is a FRESH TCP connection/DB session with no in-memory transaction.
BEGIN;
SELECT set_config('kts.workspace_id','group_a',true);
SELECT set_config('kts.actor_user_id','user_1',true);
DO $$
DECLARE receipt jsonb; old_seq bigint;
BEGIN
  SELECT feed_seq INTO old_seq FROM kts_team.scope_events
    WHERE workspace_id='group_a' AND event_id='tcp_ci_event_original';
  IF old_seq IS NULL THEN RAISE EXCEPTION 'TEAM_TCP_COMMITTED_EVENT_MISSING'; END IF;
  receipt:=kts_team.append_draft(
    'group_a','tcp_ci_partner','2026-10-12','mn',0,
    'tcp_ci_event_must_not_commit','tcp_ci_idem_original',repeat('c',64),
    '{"synthetic":"tcp-commit-proof"}'::jsonb);
  IF receipt->>'event_id'<>'tcp_ci_event_original' OR
     receipt->>'new_revision'<>'1' OR receipt->>'replayed'<>'true' OR
     (receipt->>'feed_seq')::bigint<>old_seq OR
     (SELECT revision FROM kts_team.scopes
      WHERE workspace_id='group_a' AND partner_id='tcp_ci_partner'
      AND business_date='2026-10-12' AND region='mn')<>1 OR
     (SELECT count(*) FROM kts_team.scope_events
      WHERE workspace_id='group_a' AND partner_id='tcp_ci_partner')<>1 OR
     EXISTS (SELECT 1 FROM kts_team.scope_events
      WHERE workspace_id='group_a' AND event_id='tcp_ci_event_must_not_commit') THEN
    RAISE EXCEPTION 'TEAM_TCP_REPLAY_WAS_NOT_IDEMPOTENT';
  END IF;
END
$$;
ROLLBACK;
\echo POSTGRES_CI_SECOND_TCP_REPLAY_PROOF_PASS
