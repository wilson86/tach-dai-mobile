\set ON_ERROR_STOP on
-- A different TCP session uses only the ledger role: no shared auth access.
DO $$
BEGIN
  IF session_user <> 'team_ci_ledger_login' OR current_user <> 'team_ci_ledger_login' THEN
    RAISE EXCEPTION 'TEAM_LEDGER_TCP_LOGIN_NOT_DISTINCT';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles
            WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'TEAM_LEDGER_TCP_OVERPRIVILEGED';
  END IF;
  IF NOT has_table_privilege(current_user,'kts_team.scope_events','SELECT')
      OR NOT has_function_privilege(current_user,
         'kts_team.append_draft(text,text,date,text,bigint,text,text,text,jsonb)',
         'EXECUTE')
      OR has_schema_privilege(current_user,'kts_auth','USAGE') THEN
    RAISE EXCEPTION 'TEAM_LEDGER_TCP_ROLE_PRIVILEGE_MISMATCH';
  END IF;
  BEGIN
    EXECUTE 'SELECT count(*) FROM kts_auth.credentials';
    RAISE EXCEPTION 'TEAM_LEDGER_TCP_CREDENTIAL_READ_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    EXECUTE 'SELECT count(*) FROM kts_auth.sessions';
    RAISE EXCEPTION 'TEAM_LEDGER_TCP_SESSION_READ_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- No transaction-scoped tenant: RLS must not expose financial events.
  IF EXISTS(SELECT 1 FROM kts_team.scope_events) THEN
    RAISE EXCEPTION 'TEAM_LEDGER_TCP_UNSCOPED_EVENT_LEAK';
  END IF;
END
$$;
BEGIN;
SELECT set_config('kts.workspace_id','group_a',true);
DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM kts_team.scope_events WHERE workspace_id='group_a')
    OR EXISTS(SELECT 1 FROM kts_team.scope_events WHERE workspace_id='group_b') THEN
    RAISE EXCEPTION 'TEAM_LEDGER_TCP_TENANT_ISOLATION_FAILED';
  END IF;
END
$$;
ROLLBACK;
\echo POSTGRES_CI_LEDGER_TCP_ROLE_PASS
