\set ON_ERROR_STOP on
-- Disposable PostgreSQL synthetic-only test of M1 DRAFT transaction.
-- Runs after postgres-smoke.sql, never against operational data.
CREATE ROLE team_smoke_guest NOLOGIN;
GRANT USAGE ON SCHEMA kts_team TO team_smoke_guest;
DO $
BEGIN
  IF has_function_privilege('team_smoke_guest',
    'kts_team.append_draft(text,text,date,text,bigint,text,text,text,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'TEAM_FUNCTION_PUBLIC_EXECUTE_LEAK';
  END IF;
END
$;
CREATE ROLE team_smoke_writer NOLOGIN;
GRANT USAGE ON SCHEMA kts_team TO team_smoke_writer;
GRANT SELECT (user_id,disabled_at) ON kts_team.identities TO team_smoke_writer;
GRANT SELECT ON kts_team.memberships,kts_team.counterparties,kts_team.scopes,
  kts_team.scope_events,kts_team.idempotency_receipts TO team_smoke_writer;
GRANT INSERT,UPDATE ON kts_team.scopes TO team_smoke_writer;
GRANT INSERT ON kts_team.scope_events,kts_team.idempotency_receipts TO team_smoke_writer;
GRANT EXECUTE ON FUNCTION kts_team.append_draft(text,text,date,text,bigint,text,text,text,jsonb)
  TO team_smoke_writer;
SET ROLE team_smoke_writer;
BEGIN;
SELECT set_config('kts.workspace_id','group_a',true);
SELECT set_config('kts.actor_user_id','user_1',true);
DO $$
DECLARE first_result jsonb; replay_result jsonb; blocked boolean;
BEGIN
  first_result := kts_team.append_draft(
    'group_a','customer_1','2026-10-12','mn',1,
    'event_a2','req_2',repeat('c',64),'{"fake_test":true}'::jsonb);
  IF first_result->>'replayed'<>'false' OR first_result->>'new_revision'<>'2' THEN
    RAISE EXCEPTION 'TEAM_DRAFT_FIRST_WRITE_FAILED';
  END IF;
  replay_result := kts_team.append_draft(
    'group_a','customer_1','2026-10-12','mn',1,
    'event_a2','req_2',repeat('c',64),'{"fake_test":true}'::jsonb);
  IF replay_result->>'replayed'<>'true' OR replay_result->>'event_id'<>'event_a2' THEN
    RAISE EXCEPTION 'TEAM_DRAFT_IDEMPOTENT_RETRY_FAILED';
  END IF;

  blocked := false;
  BEGIN
    PERFORM kts_team.append_draft(
      'group_a','customer_1','2026-10-12','mn',1,
      'event_a3','req_3',repeat('d',64),'{"fake_test":true}'::jsonb);
  EXCEPTION WHEN others THEN
    IF SQLERRM='TEAM_REVISION_CONFLICT' THEN blocked:=true; ELSE RAISE; END IF;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'TEAM_DRAFT_STALE_REVISION_ALLOWED'; END IF;

  blocked := false;
  BEGIN
    PERFORM kts_team.append_draft(
      'group_a','customer_1','2026-10-12','mn',2,
      'event_a3','req_2',repeat('d',64),'{"fake_test":true}'::jsonb);
  EXCEPTION WHEN others THEN
    IF SQLERRM='TEAM_IDEMPOTENCY_CONFLICT' THEN blocked:=true; ELSE RAISE; END IF;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'TEAM_DRAFT_KEY_REUSE_ALLOWED'; END IF;

  blocked := false;
  BEGIN
    PERFORM kts_team.append_draft(
      'group_b','customer_1','2026-10-12','mn',1,
      'event_b2','req_3',repeat('d',64),'{"fake_test":true}'::jsonb);
  EXCEPTION WHEN others THEN
    IF SQLERRM='TEAM_WORKSPACE_DENIED' THEN blocked:=true; ELSE RAISE; END IF;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'TEAM_DRAFT_CROSS_TENANT_ALLOWED'; END IF;

  IF (SELECT revision FROM kts_team.scopes
      WHERE workspace_id='group_a' AND partner_id='customer_1') <> 2 THEN
    RAISE EXCEPTION 'TEAM_DRAFT_REVISION_WRONG';
  END IF;
  IF (SELECT count(*) FROM kts_team.scope_events WHERE workspace_id='group_a')<>2 THEN
    RAISE EXCEPTION 'TEAM_DRAFT_DOUBLE_EVENT';
  END IF;
  IF (SELECT count(*) FROM kts_team.idempotency_receipts WHERE workspace_id='group_a')<>2 THEN
    RAISE EXCEPTION 'TEAM_DRAFT_DOUBLE_RECEIPT';
  END IF;
END
$$;
COMMIT;

BEGIN;
SELECT set_config('kts.workspace_id','group_a',true);
SELECT set_config('kts.actor_user_id','user_2',true);
DO $$
DECLARE blocked boolean:=false;
BEGIN
  BEGIN
    PERFORM kts_team.append_draft(
      'group_a','customer_1','2026-10-12','mn',2,
      'event_bad','req_bad',repeat('d',64),'{"fake_test":true}'::jsonb);
  EXCEPTION WHEN others THEN
    IF SQLERRM='TEAM_ROLE_DENIED' THEN blocked:=true; ELSE RAISE; END IF;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'TEAM_REVIEWER_WRITE_ALLOWED'; END IF;
END
$$;
ROLLBACK;
RESET ROLE;
\echo POSTGRES_M1_DRAFT_IDEMPOTENCY_CAS_TENANCY_ROLE_PASS

-- Authentication boundary must also reject deactivated identities, not just revoked memberships.
UPDATE kts_team.identities SET disabled_at=now() WHERE user_id='user_1';
SET ROLE team_smoke_writer;
BEGIN;
SELECT set_config('kts.workspace_id','group_a',true);
SELECT set_config('kts.actor_user_id','user_1',true);
DO $$
DECLARE denied boolean:=false;
BEGIN
  BEGIN
    PERFORM kts_team.append_draft(
      'group_a','customer_1','2026-10-12','mn',2,
      'disabled_event','disabled_key',repeat('a',64),'{"synthetic":true}'::jsonb);
  EXCEPTION WHEN others THEN
    IF SQLERRM='TEAM_ROLE_DENIED' THEN denied:=true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'TEAM_DISABLED_IDENTITY_CAN_WRITE'; END IF;
END
$$;
ROLLBACK;
RESET ROLE;
UPDATE kts_team.identities SET disabled_at=NULL WHERE user_id='user_1';

UPDATE kts_team.memberships SET revoked_at=now() WHERE workspace_id='group_a' AND user_id='user_1';
SET ROLE team_smoke_writer;
BEGIN;
SELECT set_config('kts.workspace_id','group_a',true);
SELECT set_config('kts.actor_user_id','user_1',true);
DO $$
DECLARE denied boolean:=false;
BEGIN
  BEGIN
    PERFORM kts_team.append_draft(
      'group_a','customer_1','2026-10-12','mn',2,
      'revoked_event','revoked_key',repeat('a',64),'{"synthetic":true}'::jsonb);
  EXCEPTION WHEN others THEN
    IF SQLERRM='TEAM_ROLE_DENIED' THEN denied:=true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'TEAM_REVOKED_MEMBER_CAN_WRITE'; END IF;
END
$$;
ROLLBACK;
RESET ROLE;
UPDATE kts_team.memberships SET revoked_at=NULL WHERE workspace_id='group_a' AND user_id='user_1';
\echo POSTGRES_TEAM_DISABLED_AND_REVOKED_MEMBER_DENY_PASS
