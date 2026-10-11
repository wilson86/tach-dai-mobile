\set ON_ERROR_STOP on
-- Actual separate TCP/credential login as non-superuser in disposable CI.
DO $$
BEGIN
  IF session_user <> 'team_ci_auth_login' OR current_user <> 'team_ci_auth_login' THEN
    RAISE EXCEPTION 'TEAM_AUTH_TCP_LOGIN_NOT_DISTINCT';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles
            WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'TEAM_AUTH_TCP_OVERPRIVILEGED';
  END IF;
  IF NOT has_table_privilege(current_user,'kts_auth.credentials','SELECT')
      OR NOT has_table_privilege(current_user,'kts_auth.sessions','SELECT')
      OR NOT has_column_privilege(current_user,'kts_auth.sessions','session_hash','INSERT')
      OR NOT has_column_privilege(current_user,'kts_auth.sessions','user_id','INSERT')
      OR NOT has_column_privilege(current_user,'kts_auth.sessions','workspace_id','INSERT')
      OR NOT has_column_privilege(current_user,'kts_auth.sessions','issued_at','INSERT')
      OR NOT has_column_privilege(current_user,'kts_auth.sessions','expires_at','INSERT')
      OR NOT has_column_privilege(current_user,'kts_auth.sessions','revoked_at','UPDATE')
      OR has_table_privilege(current_user,'kts_team.scope_events','SELECT')
      OR has_function_privilege(current_user,
         'kts_team.append_draft(text,text,date,text,bigint,text,text,text,jsonb)',
         'EXECUTE') THEN
    RAISE EXCEPTION 'TEAM_AUTH_TCP_ROLE_PRIVILEGE_MISMATCH';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM kts_auth.credentials WHERE user_id='user_1') THEN
    RAISE EXCEPTION 'TEAM_AUTH_TCP_CREDENTIAL_READ_MISSING';
  END IF;
  BEGIN
    EXECUTE 'SELECT count(*) FROM kts_team.scope_events';
    RAISE EXCEPTION 'TEAM_AUTH_TCP_LEDGER_READ_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;
\echo POSTGRES_CI_AUTH_TCP_ROLE_PASS
