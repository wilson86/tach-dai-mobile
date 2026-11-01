\set ON_ERROR_STOP on
-- FUTURE disposable synthetic test only; never run on an existing pilot root.
-- Prerequisites: migrations 001-004, postgres-smoke.sql and postgres-draft.sql.
-- Source now checks actor/scope/event context; this real PostgreSQL regression
-- has NOT RUN on the changed SHA. Never treat a source check as DB PASS.
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
        candidate record; blocked boolean;
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
  -- Wrong actor, business identity, event revision/kind and request digest
  -- must fail without creating another event or receipt. These cases exercise
  -- the real SQL replay branch only in a future disposable PostgreSQL session.
  FOR candidate IN
    SELECT * FROM (VALUES
      ('partner','fixture_other_partner','2041-01-01'::date,'mn',0,repeat('e',64),'TEAM_IDEMPOTENCY_CONTEXT_MISMATCH'),
      ('date','customer_1','2041-01-02'::date,'mn',0,repeat('e',64),'TEAM_IDEMPOTENCY_CONTEXT_MISMATCH'),
      ('region','customer_1','2041-01-01'::date,'mt',0,repeat('e',64),'TEAM_IDEMPOTENCY_CONTEXT_MISMATCH'),
      ('revision_and_kind','customer_1','2041-01-01'::date,'mn',1,repeat('e',64),'TEAM_IDEMPOTENCY_CONTEXT_MISMATCH'),
      ('request_hash','customer_1','2041-01-01'::date,'mn',0,repeat('f',64),'TEAM_IDEMPOTENCY_CONFLICT')
    ) AS mismatched(label, partner_id, business_date, region, base_revision, request_hash, error_code)
  LOOP
    blocked := false;
    BEGIN
      PERFORM kts_team.append_draft('group_a',candidate.partner_id,candidate.business_date,
        candidate.region,candidate.base_revision,'fixture_unapproved_retry',
        'fixture_replay_key',candidate.request_hash,'{"synthetic":true}'::jsonb);
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM=candidate.error_code THEN blocked := true;
      ELSE RAISE; END IF;
    END;
    IF NOT blocked THEN
      RAISE EXCEPTION 'TEAM_REPLAY_NEGATIVE_ACCEPTED_%',candidate.label;
    END IF;
  END LOOP;
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
