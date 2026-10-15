\set ON_ERROR_STOP on
-- Disposable Github Actions PostgreSQL ONLY; never run against KTS Router.
-- This is not a production grant or migration.
-- Data seeded by postgres-smoke.sql and postgres-draft.sql.
SET ROLE team_smoke_reader;
BEGIN;
SET TRANSACTION READ ONLY;
SELECT set_config('kts.workspace_id','group_a',true);
SELECT set_config('kts.actor_user_id','user_1',true);
DO $recovery$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n
  FROM kts_team.idempotency_receipts r
  JOIN kts_team.scope_events e
    ON e.workspace_id=r.workspace_id AND e.event_id=r.event_id
  WHERE r.workspace_id='group_a' AND e.actor_user_id='user_1'
    AND r.idempotency_key=ANY(ARRAY['req_1','missing_key']::text[]);
  IF n<>1 THEN RAISE EXCEPTION 'RECOVERY_ORIGINAL_RECEIPT_NOT_FOUND'; END IF;

  SELECT count(*) INTO n
  FROM kts_team.idempotency_receipts r
  JOIN kts_team.scope_events e
    ON e.workspace_id=r.workspace_id AND e.event_id=r.event_id
  WHERE r.workspace_id='group_a' AND e.actor_user_id='user_2'
    AND r.idempotency_key=ANY(ARRAY['req_1']::text[]);
  IF n<>0 THEN RAISE EXCEPTION 'RECOVERY_OTHER_ACTOR_EXPOSED'; END IF;

  SELECT count(*) INTO n
  FROM kts_team.idempotency_receipts r
  JOIN kts_team.scope_events e
    ON e.workspace_id=r.workspace_id AND e.event_id=r.event_id
  WHERE r.workspace_id='group_b' AND e.actor_user_id='user_2'
    AND r.idempotency_key=ANY(ARRAY['req_1']::text[]);
  IF n<>0 THEN RAISE EXCEPTION 'RECOVERY_CROSS_TENANT_EXPOSED'; END IF;
END
$recovery$;
ROLLBACK;
RESET ROLE;

-- A role with SQL UPDATE privilege must still be blocked by an explicit
-- READ ONLY transaction; no data may be touched even in a test transaction.
SET ROLE team_smoke_writer;
BEGIN;
SET TRANSACTION READ ONLY;
SELECT set_config('kts.workspace_id','group_a',true);
DO $readonly$
DECLARE denied boolean:=false;
BEGIN
  BEGIN
    UPDATE kts_team.scopes SET revision=revision+1
      WHERE workspace_id='group_a' AND partner_id='customer_1';
  EXCEPTION WHEN read_only_sql_transaction THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'RECOVERY_READ_ONLY_BYPASS'; END IF;
END
$readonly$;
ROLLBACK;
RESET ROLE;
\echo POSTGRES_RECOVERY_READ_ONLY_ACTOR_TENANT_PASS
