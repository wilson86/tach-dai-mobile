\set ON_ERROR_STOP on
-- FUTURE disposable synthetic test only; never run on an existing pilot root.
-- Prerequisites: migrations 001-004, postgres-smoke.sql and postgres-draft.sql.
-- Expected to FAIL against the current function until actor-bound replay is fixed.
-- All test data is in this transaction; failure/disconnect rolls it back.
DO $$
BEGIN
  IF current_database() !~ '^kts_fixture_[a-z0-9_]+$' OR
     current_setting('kts.synthetic_fixture',true) IS DISTINCT FROM 'enabled' THEN
    RAISE EXCEPTION 'TEAM_SYNTHETIC_DATABASE_REQUIRED';
  END IF;
END $$;
BEGIN;
SELECT set_config('kts.workspace_id','group_a',true);
INSERT INTO kts_team.identities(user_id,auth_subject)
  VALUES ('fixture_replay_operator_b','fixture:replay:operator:b');
INSERT INTO kts_team.memberships(workspace_id,user_id,team_role)
  VALUES ('group_a','fixture_replay_operator_b','operator');
SET LOCAL ROLE team_smoke_writer;
SELECT set_config('kts.actor_user_id','user_1',true);
DO $$
DECLARE first_result jsonb; same_actor_result jsonb; other_actor_denied boolean := false;
BEGIN
  first_result := kts_team.append_draft('group_a','customer_1','2041-01-01','mn',0,
    'fixture_replay_event_a','fixture_replay_key',repeat('e',64),'{"synthetic":true}'::jsonb);
  IF first_result->>'replayed' <> 'false' OR first_result->>'new_revision' <> '1' THEN
    RAISE EXCEPTION 'TEAM_FIXTURE_FIRST_WRITE_FAILED';
  END IF;
  same_actor_result := kts_team.append_draft('group_a','customer_1','2041-01-01','mn',0,
    'fixture_replay_event_retry','fixture_replay_key',repeat('e',64),'{"synthetic":true}'::jsonb);
  IF same_actor_result->>'replayed' <> 'true' OR
     same_actor_result->>'event_id' <> first_result->>'event_id' THEN
    RAISE EXCEPTION 'TEAM_SAME_ACTOR_REPLAY_BROKEN';
  END IF;
  PERFORM set_config('kts.actor_user_id','fixture_replay_operator_b',true);
  BEGIN
    PERFORM kts_team.append_draft('group_a','customer_1','2041-01-01','mn',0,
      'fixture_replay_event_b','fixture_replay_key',repeat('e',64),'{"synthetic":true}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='TEAM_IDEMPOTENCY_CONTEXT_MISMATCH' THEN other_actor_denied := true;
    ELSE RAISE; END IF;
  END;
  IF NOT other_actor_denied THEN RAISE EXCEPTION 'TEAM_CROSS_ACTOR_REPLAY_ACCEPTED'; END IF;
  IF (SELECT count(*) FROM kts_team.scope_events WHERE workspace_id='group_a'
      AND event_id IN ('fixture_replay_event_a','fixture_replay_event_b')) <> 1 OR
     (SELECT count(*) FROM kts_team.idempotency_receipts WHERE workspace_id='group_a'
      AND idempotency_key='fixture_replay_key') <> 1 THEN
    RAISE EXCEPTION 'TEAM_REPLAY_CHANGED_EVENT_OR_RECEIPT_COUNT';
  END IF;
END $$;
ROLLBACK;
