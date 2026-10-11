\set ON_ERROR_STOP on
-- Financial draft candidate commits in a separately authenticated TCP session.
-- All data synthetic; database guaranteed disposable by guarded shell launcher.
BEGIN;
SELECT set_config('kts.workspace_id','group_a',true);
SELECT set_config('kts.actor_user_id','user_1',true);
DO $$
DECLARE receipt jsonb;
BEGIN
  receipt:=kts_team.append_draft(
    'group_a','tcp_ci_partner','2026-10-12','mn',0,
    'tcp_ci_event_original','tcp_ci_idem_original',repeat('c',64),
    '{"synthetic":"tcp-commit-proof"}'::jsonb);
  IF receipt->>'event_id'<>'tcp_ci_event_original' OR
     receipt->>'new_revision'<>'1' OR receipt->>'replayed'<>'false' OR
     (receipt->>'feed_seq')::bigint < 1 THEN
    RAISE EXCEPTION 'TEAM_TCP_FIRST_DRAFT_RECEIPT_INVALID';
  END IF;
END
$$;
COMMIT;
\echo POSTGRES_CI_DRAFT_TCP_COMMIT_PASS
