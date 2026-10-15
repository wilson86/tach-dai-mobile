\set ON_ERROR_STOP on
-- Standalone synthetic SQL qualification for new async PostgreSQL auth contract.
-- This script is run only in disposable GitHub Actions PostgreSQL, after
-- existing 001,002,003 migrations and postgres-smoke/auth fixtures.
-- No real login, raw bearer, password or customer data.
INSERT INTO kts_auth.sessions(session_hash,user_id,workspace_id,issued_at,expires_at)
VALUES (repeat('b',64),'user_1','group_a',now(),now()+interval '1 day');

CREATE ROLE team_auth_candidate NOLOGIN;
GRANT USAGE ON SCHEMA kts_auth,kts_team TO team_auth_candidate;
GRANT SELECT ON kts_auth.credentials,kts_auth.sessions TO team_auth_candidate;
GRANT UPDATE (revoked_at) ON kts_auth.sessions TO team_auth_candidate;
GRANT INSERT (session_hash,user_id,workspace_id,issued_at,expires_at)
  ON kts_auth.sessions TO team_auth_candidate;
GRANT SELECT (user_id,auth_subject,disabled_at) ON kts_team.identities TO team_auth_candidate;
GRANT SELECT (workspace_id,user_id,team_role,revoked_at) ON kts_team.memberships TO team_auth_candidate;

SET ROLE team_auth_candidate;
BEGIN;
SELECT set_config('kts.workspace_id','group_a',true);
-- Validate *denied* privileges as well as the granted auth read paths.
-- A login/session role must never mutate member roles or financial events.
DO $$
BEGIN
  IF has_table_privilege(current_user,'kts_auth.credentials','UPDATE')
      OR has_table_privilege(current_user,'kts_auth.sessions','DELETE')
      OR has_table_privilege(current_user,'kts_team.memberships','UPDATE')
      OR has_table_privilege(current_user,'kts_team.scope_events','SELECT')
      OR has_schema_privilege(current_user,'kts_team','CREATE')
      OR has_function_privilege(current_user,
          'kts_team.append_draft(text,text,date,text,bigint,text,text,text,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'TEAM_AUTH_DB_ROLE_OVERPRIVILEGED';
  END IF;
END
$$;
DO $$
DECLARE v_user text; v_role text; v_hash text;
BEGIN
  -- These mirror the async auth service's login + session + membership reads.
  SELECT i.user_id,m.team_role,c.password_hash INTO v_user,v_role,v_hash
  FROM kts_team.identities i
  JOIN kts_auth.credentials c ON c.user_id=i.user_id
  JOIN kts_team.memberships m ON m.user_id=i.user_id
  WHERE i.auth_subject='synthetic:login:1' AND m.workspace_id='group_a'
    AND m.revoked_at IS NULL;
  IF v_user <> 'user_1' OR v_role <> 'operator' OR v_hash NOT LIKE 'scrypt-v1$%' THEN
    RAISE EXCEPTION 'TEAM_AUTH_LOGIN_SQL_CONTRACT_FAILED';
  END IF;
  SELECT user_id, workspace_id INTO v_user,v_role FROM kts_auth.sessions
  WHERE session_hash=repeat('b',64) AND revoked_at IS NULL
    AND expires_at>now() FOR SHARE;
  IF v_user <> 'user_1' OR v_role <> 'group_a' THEN
    RAISE EXCEPTION 'TEAM_AUTH_SESSION_SQL_CONTRACT_FAILED';
  END IF;
  SELECT m.team_role INTO v_role FROM kts_team.memberships m
  JOIN kts_team.identities i ON i.user_id=m.user_id
  WHERE m.workspace_id='group_a' AND m.user_id='user_1'
    AND m.revoked_at IS NULL AND i.disabled_at IS NULL;
  IF v_role <> 'operator' THEN
    RAISE EXCEPTION 'TEAM_AUTH_ACTIVE_MEMBERSHIP_SQL_CONTRACT_FAILED';
  END IF;
END
$$;
ROLLBACK;
RESET ROLE;

-- SQL must never accept revoked sessions, even when hash and tenant are valid.
UPDATE kts_auth.sessions SET revoked_at=now() WHERE session_hash=repeat('b',64);
SET ROLE team_auth_candidate;
BEGIN;
SELECT set_config('kts.workspace_id','group_a',true);
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM kts_auth.sessions
           WHERE session_hash=repeat('b',64) AND revoked_at IS NULL
             AND expires_at>now() FOR SHARE) THEN
    RAISE EXCEPTION 'TEAM_AUTH_REVOKED_SESSION_LEAK';
 END IF;
END
$$;
ROLLBACK;
RESET ROLE;

\echo POSTGRES_M1_DURABLE_AUTH_SQL_ROLE_BOUNDARIES_PASS
