\set ON_ERROR_STOP on
-- Disposable CI only: executed AFTER postgres-draft, postgres-auth and
-- postgres-durable-auth-contract. All rows are synthetic.
-- This uses SET ROLE (not actual independent credentialed TCP pools).
-- team_auth_candidate and team_smoke_writer must already exist.
SET ROLE team_auth_candidate;
DO $$
BEGIN
  IF current_user <> 'team_auth_candidate' THEN
    RAISE EXCEPTION 'TEAM_AUTH_EFFECTIVE_ROLE_WRONG';
  END IF;
  IF NOT has_table_privilege(current_user,'kts_auth.credentials','SELECT')
    OR NOT has_table_privilege(current_user,'kts_auth.sessions','SELECT')
    OR has_table_privilege(current_user,'kts_team.scope_events','SELECT')
    OR has_table_privilege(current_user,'kts_team.scopes','INSERT')
    OR has_table_privilege(current_user,'kts_team.workspaces','UPDATE')
    OR has_function_privilege(current_user,
       'kts_team.append_draft(text,text,date,text,bigint,text,text,text,jsonb)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'TEAM_AUTH_ROLE_FINANCIAL_ACCESS_LEAK';
  END IF;
END
$$;
RESET ROLE;

SET ROLE team_smoke_writer;
DO $$
BEGIN
  IF current_user <> 'team_smoke_writer' THEN
    RAISE EXCEPTION 'TEAM_LEDGER_EFFECTIVE_ROLE_WRONG';
  END IF;
  IF NOT has_table_privilege(current_user,'kts_team.scope_events','SELECT')
    OR NOT has_function_privilege(current_user,
       'kts_team.append_draft(text,text,date,text,bigint,text,text,text,jsonb)',
       'EXECUTE')
    OR has_schema_privilege(current_user,'kts_auth','USAGE')
    OR has_table_privilege(current_user,'kts_team.memberships','UPDATE') THEN
    RAISE EXCEPTION 'TEAM_LEDGER_ROLE_CREDENTIAL_ACCESS_LEAK';
  END IF;
  -- A role without schema USAGE cannot directly resolve protected tables.
  -- Check actual denied reads rather than calling a privilege helper that
  -- itself may raise "permission denied for schema kts_auth".
  BEGIN
    EXECUTE 'SELECT count(*) FROM kts_auth.sessions';
    RAISE EXCEPTION 'TEAM_LEDGER_SESSION_READ_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    EXECUTE 'SELECT count(*) FROM kts_auth.credentials';
    RAISE EXCEPTION 'TEAM_LEDGER_CREDENTIAL_READ_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- Without the transaction-local workspace, tenant RLS must return zero.
  IF EXISTS (SELECT 1 FROM kts_team.scope_events) THEN
    RAISE EXCEPTION 'TEAM_LEDGER_UNSCOPED_EVENTS_LEAK';
  END IF;
END
$$;

BEGIN;
SELECT set_config('kts.workspace_id','group_a',true);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM kts_team.scope_events
                 WHERE workspace_id='group_a') OR
     EXISTS (SELECT 1 FROM kts_team.scope_events
             WHERE workspace_id='group_b') THEN
    RAISE EXCEPTION 'TEAM_LEDGER_ROLE_TENANT_A_ISOLATION_FAILED';
  END IF;
END
$$;
ROLLBACK;

BEGIN;
SELECT set_config('kts.workspace_id','group_b',true);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM kts_team.scope_events
                 WHERE workspace_id='group_b') OR
     EXISTS (SELECT 1 FROM kts_team.scope_events
             WHERE workspace_id='group_a') THEN
    RAISE EXCEPTION 'TEAM_LEDGER_ROLE_TENANT_B_ISOLATION_FAILED';
  END IF;
END
$$;
ROLLBACK;
RESET ROLE;
\echo POSTGRES_TEAM_AUTH_LEDGER_ROLES_ISOLATED_PASS
