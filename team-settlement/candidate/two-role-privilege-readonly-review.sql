\set ON_ERROR_STOP on
-- READ-ONLY synthetic review ONLY; no grants, no role provisioning, no DML.
-- Must be invoked by an explicitly approved supervised fresh C: scratch PG16.
\if :{?KTS_DISPOSABLE_PG_ONLY}
\else
  \echo BLOCKED_REQUIRE_EXPLICIT_KTS_DISPOSABLE_PG_ONLY
  SELECT 1/0; -- missing opt-in: ON_ERROR_STOP exits nonzero
\endif
BEGIN TRANSACTION READ ONLY;
DO $review$
DECLARE n integer;
BEGIN
  IF current_setting('server_version_num')::integer NOT BETWEEN 160000 AND 169999 THEN
    RAISE EXCEPTION 'REVIEW_REQUIRES_PG16_ISOLATED';
  END IF;
  SELECT count(*) INTO n FROM pg_catalog.pg_roles
   WHERE rolname IN ('synthetic_auth_login','synthetic_ledger_login')
     AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole;
  IF n <> 2 THEN RAISE EXCEPTION 'REVIEW_TWO_REAL_LOGIN_ROLES_MISSING'; END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m
     JOIN pg_catalog.pg_roles r ON r.oid=m.member
     WHERE r.rolname IN ('synthetic_auth_login','synthetic_ledger_login'))
  THEN RAISE EXCEPTION 'REVIEW_ROLE_MEMBERSHIP_INHERITANCE'; END IF;

  -- Explicit default ACL overrides are not reviewed in this fixture.
  -- Their absence does NOT mean ordinary PostgreSQL function PUBLIC EXECUTE is safe.
  SELECT count(*) INTO n FROM pg_catalog.pg_default_acl;
  IF n <> 0 THEN RAISE EXCEPTION 'REVIEW_DEFAULT_ACL_OVERRIDE_UNREVIEWED'; END IF;

  -- Require six sensitive server functions; reject default/explicit PUBLIC
  -- EXECUTE as well as any direct or PUBLIC/inherited execute by either login.
  WITH target(sig) AS (VALUES
    ('kts_team.append_draft(text,text,date,text,bigint,text,text,text,jsonb)'),
    ('kts_team.advance_review(text,text,date,text,text,bigint,text,text,text)'),
    ('kts_team.atomic_review_v1(text,text,bigint,text,text,text,date,text,text,bigint,text,text,text)'),
    ('kts_team.atomic_review_reconcile_v1(text,text,bigint,text,text,text,date,text,text,bigint,text,text)'),
    ('kts_team.atomic_draft_v1(text,text,bigint,text,text,text,date,text,text,bigint,text,text,text,text)'),
    ('kts_team.atomic_draft_reconcile_v1(text,text,bigint,text,text,text,date,text,text,bigint,text,text,text)')
  )
  SELECT count(*) INTO n FROM target t
    LEFT JOIN pg_catalog.pg_proc p ON p.oid=pg_catalog.to_regprocedure(t.sig)
  WHERE p.oid IS NULL OR
        EXISTS(SELECT 1 FROM pg_catalog.aclexplode(
          COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
          WHERE a.grantee=0 AND a.privilege_type='EXECUTE') OR
        pg_catalog.has_function_privilege('synthetic_auth_login',p.oid,'EXECUTE') OR
        pg_catalog.has_function_privilege('synthetic_ledger_login',p.oid,'EXECUTE');
  IF n <> 0 THEN RAISE EXCEPTION 'REVIEW_FUNCTION_PUBLIC_OR_LOGIN_EXECUTE'; END IF;

  -- Neither login may write financial tables, even via column grants.
  WITH target(tab) AS (VALUES
    ('kts_team.workspaces'),('kts_team.memberships'),('kts_team.counterparties'),
    ('kts_team.scopes'),('kts_team.scope_events'),('kts_team.idempotency_receipts')
  ), actor(role_name) AS (VALUES
    ('synthetic_auth_login'),('synthetic_ledger_login')
  )
  SELECT count(*) INTO n FROM target t CROSS JOIN actor r
  WHERE pg_catalog.has_table_privilege(r.role_name,t.tab,'INSERT') OR
        pg_catalog.has_table_privilege(r.role_name,t.tab,'UPDATE') OR
        pg_catalog.has_table_privilege(r.role_name,t.tab,'DELETE') OR
        pg_catalog.has_table_privilege(r.role_name,t.tab,'TRUNCATE') OR
        pg_catalog.has_table_privilege(r.role_name,t.tab,'REFERENCES') OR
        pg_catalog.has_table_privilege(r.role_name,t.tab,'TRIGGER') OR
        pg_catalog.has_any_column_privilege(r.role_name,t.tab,'INSERT') OR
        pg_catalog.has_any_column_privilege(r.role_name,t.tab,'UPDATE');
  IF n <> 0 THEN RAISE EXCEPTION 'REVIEW_FINANCIAL_TABLE_WRITE_GRANTED'; END IF;

  IF NOT (
   pg_catalog.has_schema_privilege('synthetic_auth_login','kts_auth','USAGE') AND
   pg_catalog.has_schema_privilege('synthetic_auth_login','kts_team','USAGE') AND
   pg_catalog.has_schema_privilege('synthetic_ledger_login','kts_team','USAGE') AND
   pg_catalog.has_table_privilege('synthetic_auth_login','kts_auth.credentials','SELECT') AND
   pg_catalog.has_table_privilege('synthetic_auth_login','kts_auth.sessions','SELECT') AND
   pg_catalog.has_table_privilege('synthetic_auth_login','kts_auth.sessions','INSERT') AND
   pg_catalog.has_column_privilege('synthetic_auth_login','kts_auth.sessions','revoked_at','UPDATE') AND
   pg_catalog.has_table_privilege('synthetic_auth_login','kts_team.memberships','SELECT') AND
   pg_catalog.has_table_privilege('synthetic_ledger_login','kts_team.memberships','SELECT') AND
   pg_catalog.has_table_privilege('synthetic_ledger_login','kts_team.scope_events','SELECT') AND
   pg_catalog.has_table_privilege('synthetic_ledger_login','kts_team.idempotency_receipts','SELECT') AND
   pg_catalog.has_column_privilege('synthetic_ledger_login','kts_team.identities','user_id','SELECT') AND
   pg_catalog.has_column_privilege('synthetic_ledger_login','kts_team.identities','disabled_at','SELECT') AND
   NOT pg_catalog.has_column_privilege('synthetic_ledger_login','kts_team.identities','auth_subject','SELECT') AND
   NOT pg_catalog.has_table_privilege('synthetic_ledger_login','kts_auth.sessions','SELECT') AND
   NOT pg_catalog.has_table_privilege('synthetic_ledger_login','kts_auth.credentials','SELECT') AND
   NOT pg_catalog.has_table_privilege('synthetic_auth_login','kts_team.idempotency_receipts','SELECT')
  ) THEN RAISE EXCEPTION 'REVIEW_TWO_ROLE_READ_BOUNDARY_MISMATCH'; END IF;
  IF pg_catalog.has_schema_privilege('synthetic_auth_login','kts_auth','CREATE')
     OR pg_catalog.has_schema_privilege('synthetic_auth_login','kts_team','CREATE')
     OR pg_catalog.has_schema_privilege('synthetic_ledger_login','kts_team','CREATE')
     OR pg_catalog.has_schema_privilege('synthetic_ledger_login','kts_auth','CREATE')
  THEN RAISE EXCEPTION 'REVIEW_RUNTIME_SCHEMA_CREATE'; END IF;
END;
$review$;
ROLLBACK;
\echo SYNTHETIC_TWO_ROLE_CATALOG_READONLY_PASS
