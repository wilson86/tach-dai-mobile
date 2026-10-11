\set ON_ERROR_STOP on
-- Disposable synthetic PostgreSQL integration gate only. No customer data.
INSERT INTO kts_team.workspaces(workspace_id,display_name)
VALUES ('group_a','Synthetic Group A'),('group_b','Synthetic Group B');
INSERT INTO kts_team.identities(user_id,auth_subject)
VALUES ('user_1','synthetic:login:1'),('user_2','synthetic:login:2');
INSERT INTO kts_team.memberships(workspace_id,user_id,team_role)
VALUES ('group_a','user_1','operator'),('group_a','user_2','reviewer'),('group_b','user_2','admin');
INSERT INTO kts_team.counterparties(workspace_id,partner_id,partner_kind,display_name)
VALUES ('group_a','customer_1','customer','Synthetic A'),('group_b','customer_1','owner','Synthetic B');
INSERT INTO kts_team.scopes(workspace_id,partner_id,business_date,region,state,revision,submitted_by)
VALUES ('group_a','customer_1','2026-10-12','mn','DRAFT',1,'user_1'),
       ('group_b','customer_1','2026-10-12','mn','DRAFT',1,'user_2');
UPDATE kts_team.workspaces SET feed_seq=1 WHERE workspace_id IN ('group_a','group_b');
INSERT INTO kts_team.scope_events
  (workspace_id,event_id,partner_id,business_date,region,scope_revision,feed_seq,actor_user_id,event_kind,payload_sha256,result_snapshot)
VALUES
  ('group_a','event_a1','customer_1','2026-10-12','mn',1,1,'user_1','DRAFT_CREATED',repeat('a',64),'{"synthetic":true}'),
  ('group_b','event_b1','customer_1','2026-10-12','mn',1,1,'user_2','DRAFT_CREATED',repeat('b',64),'{"synthetic":true}');
INSERT INTO kts_team.idempotency_receipts(workspace_id,idempotency_key,request_sha256,event_id)
VALUES('group_a','req_1',repeat('a',64),'event_a1'),
      ('group_b','req_1',repeat('b',64),'event_b1');

-- Unique receipt keys prevent double charge inside the SAME workspace.
DO $$
BEGIN
  BEGIN
    INSERT INTO kts_team.idempotency_receipts(workspace_id,idempotency_key,request_sha256,event_id)
    VALUES('group_a','req_1',repeat('c',64),'event_a1');
    RAISE EXCEPTION 'DUPLICATE_IDEMPOTENCY_NOT_BLOCKED';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END
$$;

-- Append-only events and receipts cannot be edited or deleted.
DO $$
BEGIN
  BEGIN
    UPDATE kts_team.scope_events SET payload_sha256=repeat('c',64)
    WHERE workspace_id='group_a' AND event_id='event_a1';
    RAISE EXCEPTION 'EVENT_UPDATE_WAS_ALLOWED';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'TEAM_AUDIT_APPEND_ONLY' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM kts_team.idempotency_receipts WHERE workspace_id='group_a' AND idempotency_key='req_1';
    RAISE EXCEPTION 'RECEIPT_DELETE_WAS_ALLOWED';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'TEAM_AUDIT_APPEND_ONLY' THEN RAISE; END IF;
  END;
END
$$;

-- The app reader is NOT a table owner and does NOT have BYPASSRLS.
CREATE ROLE team_smoke_reader NOLOGIN;
GRANT USAGE ON SCHEMA kts_team TO team_smoke_reader;
GRANT SELECT ON kts_team.workspaces,kts_team.memberships,kts_team.counterparties,
  kts_team.scopes,kts_team.scope_events,kts_team.idempotency_receipts TO team_smoke_reader;
GRANT SELECT (user_id,disabled_at) ON kts_team.identities TO team_smoke_reader;
SET ROLE team_smoke_reader;

-- Fail closed without a workspace setting (zero rows).
DO $$
BEGIN
  IF (SELECT count(*) FROM kts_team.scopes) <> 0 THEN
    RAISE EXCEPTION 'UNSCOPED_TEAM_READ_LEAK';
  END IF;
END
$$;

BEGIN;
SELECT set_config('kts.workspace_id','group_a',true);
DO $$
BEGIN
  IF (SELECT count(*) FROM kts_team.scopes) <> 1 THEN RAISE EXCEPTION 'TENANT_A_SCOPE_NOT_EXACT'; END IF;
  IF (SELECT count(*) FROM kts_team.scope_events) <> 1 THEN RAISE EXCEPTION 'TENANT_A_EVENT_LEAK'; END IF;
  IF (SELECT count(*) FROM kts_team.memberships m
      JOIN kts_team.identities i ON i.user_id=m.user_id
      WHERE m.workspace_id='group_a' AND m.user_id='user_1'
        AND m.revoked_at IS NULL AND i.disabled_at IS NULL) <> 1 THEN
    RAISE EXCEPTION 'ACTIVE_MEMBER_READ_VERIFY_FAILED';
  END IF;
  IF (SELECT count(*) FROM kts_team.idempotency_receipts) <> 1 THEN RAISE EXCEPTION 'TENANT_A_RECEIPT_LEAK'; END IF;
  IF (SELECT count(*) FROM kts_team.counterparties) <> 1 THEN RAISE EXCEPTION 'TENANT_A_PARTNER_LEAK'; END IF;
  IF (SELECT count(*) FROM kts_team.workspaces) <> 1 THEN RAISE EXCEPTION 'TENANT_A_WORKSPACE_LEAK'; END IF;
END
$$;
ROLLBACK;

BEGIN;
SELECT set_config('kts.workspace_id','group_b',true);
DO $$
BEGIN
  IF (SELECT count(*) FROM kts_team.scopes) <> 1 THEN RAISE EXCEPTION 'TENANT_B_SCOPE_NOT_EXACT'; END IF;
  IF (SELECT count(*) FROM kts_team.scope_events) <> 1 THEN RAISE EXCEPTION 'TENANT_B_EVENT_LEAK'; END IF;
END
$$;
ROLLBACK;
RESET ROLE;
\echo POSTGRES_TEAM_M0_SYNTHETIC_RLS_AND_IMMUTABILITY_PASS
