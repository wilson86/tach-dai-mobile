-- DESIGN CANDIDATE ONLY. Never apply to production or a live pilot.
-- Requires separately reviewed kts_crypto.hmac(bytea,bytea,text), a trusted
-- kts_crypto schema, and a pre-provisioned non-login kts_atomic_owner. No
-- runtime grants are made here. Not yet executed against PostgreSQL.
BEGIN;
DO $check$
BEGIN
  -- These legacy callees must run with the reviewed atomic owner's privileges,
  -- not switch to another (possibly RLS-bypassing) definer. Missing overloads,
  -- changed execution identity, and changed search paths are all denied.
  IF (SELECT count(*) FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_language l ON l.oid=p.prolang
        WHERE p.oid IN (
          pg_catalog.to_regprocedure('kts_team.append_draft(text,text,date,text,bigint,text,text,text,jsonb)'),
          pg_catalog.to_regprocedure('kts_team.advance_review(text,text,date,text,text,bigint,text,text,text)'))
          AND p.prokind='f' AND NOT p.prosecdef AND l.lanname='plpgsql'
          AND p.prorettype='pg_catalog.jsonb'::pg_catalog.regtype
          AND p.proconfig=ARRAY['search_path=pg_catalog, kts_team']::text[])<>2 THEN
    RAISE EXCEPTION 'TEAM_ATOMIC_LEGACY_DEPENDENCY_UNQUALIFIED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
      WHERE rolname='kts_atomic_owner' AND NOT rolcanlogin AND NOT rolsuper
        AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication)
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members am
          JOIN pg_catalog.pg_roles r ON (r.oid=am.member OR r.oid=am.roleid) WHERE r.rolname='kts_atomic_owner')
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_roles r ON r.oid=c.relowner
          JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
          WHERE r.rolname='kts_atomic_owner' AND n.nspname IN ('kts_auth','kts_team'))
     OR (SELECT count(*) FROM pg_catalog.pg_class c
          JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='kts_team' AND c.relkind='r'
            AND c.relname IN ('workspaces','memberships','counterparties','scopes','scope_events','idempotency_receipts')
            AND c.relrowsecurity AND c.relforcerowsecurity)<>6
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_extension e
       JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace
       JOIN pg_catalog.pg_roles owner_role ON owner_role.oid=e.extowner
       JOIN pg_catalog.pg_proc p ON p.oid=pg_catalog.to_regprocedure('kts_crypto.hmac(bytea,bytea,text)')
       JOIN pg_catalog.pg_depend d ON d.classid='pg_catalog.pg_proc'::pg_catalog.regclass
         AND d.objid=p.oid AND d.refclassid='pg_catalog.pg_extension'::pg_catalog.regclass
         AND d.refobjid=e.oid AND d.deptype='e'
       WHERE e.extname='pgcrypto' AND n.nspname='kts_crypto' AND p.pronamespace=n.oid
         AND p.proowner=e.extowner AND owner_role.rolsuper
         AND NOT EXISTS (
           SELECT 1 FROM pg_catalog.aclexplode(COALESCE(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) acl
           WHERE acl.grantee=0 AND acl.privilege_type='CREATE'
         )
     ) THEN
    RAISE EXCEPTION 'TEAM_ATOMIC_OWNER_OR_CRYPTO_UNQUALIFIED';
  END IF;
END;
$check$;

CREATE TABLE kts_auth.atomic_review_nonces (
  session_id text NOT NULL CHECK (session_id ~ '^[a-f0-9]{64}$'),
  nonce text NOT NULL CHECK (nonce ~ '^[a-f0-9]{32}$'),
  used_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (session_id,nonce)
);
REVOKE ALL ON kts_auth.atomic_review_nonces FROM PUBLIC;
ALTER TABLE kts_auth.atomic_review_nonces OWNER TO kts_atomic_owner;

CREATE FUNCTION kts_team.atomic_review_v1(
  p_session_id text,p_nonce text,p_expires bigint,p_proof text,
  p_workspace_id text,p_partner_id text,p_business_date date,p_region text,
  p_action text,p_expected_revision bigint,p_event_id text,p_idempotency_key text,
  p_request_sha256 text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog
AS $fn$
DECLARE
  v_hash text; v_user text; v_workspace text; v_message text; v_session_expires timestamptz;
  v_result jsonb;
  v_expected_state text; v_expected_event_kind text;
  v_now bigint := pg_catalog.floor(EXTRACT(epoch FROM pg_catalog.clock_timestamp()))::bigint;
BEGIN
  IF p_session_id IS NULL OR p_session_id !~ '^[a-f0-9]{64}$'
    OR p_nonce IS NULL OR p_nonce !~ '^[a-f0-9]{32}$'
    OR p_proof IS NULL OR p_proof !~ '^[a-f0-9]{64}$'
    OR p_expires IS NULL OR p_expires <= v_now OR p_expires > v_now+60
    OR p_workspace_id IS NULL OR p_workspace_id !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'
    OR p_partner_id IS NULL OR p_partner_id !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'
    OR p_event_id IS NULL OR p_event_id !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'
    OR p_idempotency_key IS NULL OR p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'
    OR p_business_date IS NULL OR p_region NOT IN ('mn','mt','mb') OR p_region IS NULL
    OR p_action NOT IN ('submit_review','approve_review') OR p_action IS NULL
    OR p_expected_revision IS NULL OR p_expected_revision<0 OR p_expected_revision>=9007199254740991
    OR p_request_sha256 IS NULL OR p_request_sha256 !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'TEAM_ATOMIC_PROOF_INVALID';
  END IF;
  -- Action has already been validated: preserve exact event/state mapping.
  -- Avoid CASE expressions embedded in the receipt IF rejected by PG16 DDL.
  IF p_action='submit_review' THEN
    v_expected_state:='PENDING_REVIEW';
    v_expected_event_kind:='SUBMITTED';
  ELSE
    v_expected_state:='REVIEWED';
    v_expected_event_kind:='REVIEWED';
  END IF;
  BEGIN
    SELECT s.session_hash,s.user_id,s.workspace_id,s.expires_at INTO STRICT v_hash,v_user,v_workspace,v_session_expires
      FROM kts_auth.sessions s
      WHERE pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(s.session_hash,'UTF8')),'hex')=p_session_id
        AND s.revoked_at IS NULL AND s.expires_at>pg_catalog.clock_timestamp()
      FOR SHARE;
  EXCEPTION WHEN no_data_found OR too_many_rows THEN
    RAISE EXCEPTION 'TEAM_ATOMIC_SESSION_INVALID';
  END;
  IF v_workspace<>p_workspace_id THEN RAISE EXCEPTION 'TEAM_ATOMIC_SESSION_INVALID'; END IF;
  v_message:=pg_catalog.concat_ws('|','kts-review-v1',p_session_id,p_workspace_id,p_partner_id,
    pg_catalog.to_char(p_business_date,'YYYY-MM-DD'),p_region,p_action,p_expected_revision::text,
    p_event_id,p_idempotency_key,p_request_sha256,p_nonce,p_expires::text);
  IF pg_catalog.encode(kts_crypto.hmac(pg_catalog.convert_to(v_message,'UTF8'),pg_catalog.decode(v_hash,'hex'),'sha256'),'hex') IS DISTINCT FROM p_proof THEN
    RAISE EXCEPTION 'TEAM_ATOMIC_PROOF_INVALID';
  END IF;
  PERFORM pg_catalog.set_config('kts.workspace_id',v_workspace,true);
  PERFORM pg_catalog.set_config('kts.actor_user_id',v_user,true);
  -- Serialize membership removal or identity disabling against this write.
  PERFORM 1 FROM kts_team.memberships m JOIN kts_team.identities i ON i.user_id=m.user_id
    WHERE m.workspace_id=v_workspace AND m.user_id=v_user AND m.revoked_at IS NULL AND i.disabled_at IS NULL
    FOR SHARE OF m,i;
  IF NOT FOUND THEN RAISE EXCEPTION 'TEAM_ATOMIC_SESSION_INVALID'; END IF;
  -- Lock acquisition can wait; stale wall-clock checks cannot authorize a
  -- proof or session that expired while waiting for the locked rows.
  IF p_expires <= pg_catalog.floor(EXTRACT(epoch FROM pg_catalog.clock_timestamp()))::bigint
      OR v_session_expires <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'TEAM_ATOMIC_SESSION_INVALID';
  END IF;
  INSERT INTO kts_auth.atomic_review_nonces(session_id,nonce) VALUES(p_session_id,p_nonce);
  v_result:=kts_team.advance_review(p_workspace_id,p_partner_id,p_business_date,p_region,p_action,
    p_expected_revision,p_event_id,p_idempotency_key,p_request_sha256);
  -- Verify authoritative receipt/event identity even for idempotent replay.
  -- A mismatch aborts this transaction, including the nonce and any writes.
  IF pg_catalog.jsonb_typeof(v_result) IS DISTINCT FROM 'object'
     OR pg_catalog.jsonb_typeof(v_result->'replayed') IS DISTINCT FROM 'boolean'
     OR ((v_result->>'replayed')='false' AND v_result->>'event_id' IS DISTINCT FROM p_event_id)
     OR v_result->>'state' IS DISTINCT FROM v_expected_state
     OR NOT EXISTS (
       SELECT 1 FROM kts_team.idempotency_receipts r JOIN kts_team.scope_events e
         ON e.workspace_id=r.workspace_id AND e.event_id=r.event_id
       WHERE r.workspace_id=v_workspace AND r.idempotency_key=p_idempotency_key
         AND r.request_sha256=p_request_sha256 AND e.payload_sha256=p_request_sha256
         AND e.actor_user_id=v_user AND e.partner_id=p_partner_id
         AND e.business_date=p_business_date AND e.region=p_region
         AND e.event_kind=v_expected_event_kind
         AND e.scope_revision=p_expected_revision+1
         AND e.event_id=v_result->>'event_id' AND e.feed_seq::text=v_result->>'feed_seq'
         AND e.scope_revision::text=v_result->>'new_revision'
     ) THEN
    RAISE EXCEPTION 'TEAM_ATOMIC_RECEIPT_MISMATCH';
  END IF;
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION kts_team.atomic_review_v1(text,text,bigint,text,text,text,date,text,text,bigint,text,text,text) FROM PUBLIC;
ALTER FUNCTION kts_team.atomic_review_v1(text,text,bigint,text,text,text,date,text,text,bigint,text,text,text) OWNER TO kts_atomic_owner;

-- Receipt lookup is separate from mutation: missing or mismatched evidence is
-- UNKNOWN and cannot cause an insert or a retry. SELECT FOR SHARE takes locks;
-- this is not a PostgreSQL READ ONLY transaction. Runtime access stays disabled.
CREATE FUNCTION kts_team.atomic_review_reconcile_v1(
  p_session_id text,p_nonce text,p_expires bigint,p_proof text,
  p_workspace_id text,p_partner_id text,p_business_date date,p_region text,
  p_action text,p_expected_revision bigint,p_idempotency_key text,p_request_sha256 text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog
AS $lookup$
DECLARE
  v_hash text; v_user text; v_workspace text; v_message text; v_role text;
  v_session_expires timestamptz; v_event kts_team.scope_events%ROWTYPE;
  v_now bigint := pg_catalog.floor(EXTRACT(epoch FROM pg_catalog.clock_timestamp()))::bigint;
BEGIN
  IF p_session_id IS NULL OR p_session_id !~ '^[a-f0-9]{64}$'
    OR p_nonce IS NULL OR p_nonce !~ '^[a-f0-9]{32}$'
    OR p_proof IS NULL OR p_proof !~ '^[a-f0-9]{64}$'
    OR p_expires IS NULL OR p_expires <= v_now OR p_expires > v_now+60
    OR p_workspace_id IS NULL OR p_workspace_id !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'
    OR p_partner_id IS NULL OR p_partner_id !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'
    OR p_idempotency_key IS NULL OR p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'
    OR p_business_date IS NULL OR p_region NOT IN ('mn','mt','mb') OR p_region IS NULL
    OR p_action NOT IN ('submit_review','approve_review') OR p_action IS NULL
    OR p_expected_revision IS NULL OR p_expected_revision<0 OR p_expected_revision>=9007199254740991
    OR p_request_sha256 IS NULL OR p_request_sha256 !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'TEAM_ATOMIC_PROOF_INVALID';
  END IF;
  BEGIN
    SELECT s.session_hash,s.user_id,s.workspace_id,s.expires_at INTO STRICT v_hash,v_user,v_workspace,v_session_expires
      FROM kts_auth.sessions s
      WHERE pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(s.session_hash,'UTF8')),'hex')=p_session_id
        AND s.revoked_at IS NULL AND s.expires_at>pg_catalog.clock_timestamp()
      FOR SHARE;
  EXCEPTION WHEN no_data_found OR too_many_rows THEN
    RAISE EXCEPTION 'TEAM_ATOMIC_SESSION_INVALID';
  END;
  IF v_workspace<>p_workspace_id THEN RAISE EXCEPTION 'TEAM_ATOMIC_SESSION_INVALID'; END IF;
  v_message:=pg_catalog.concat_ws('|','kts-review-lookup-v1',p_session_id,p_workspace_id,p_partner_id,
    pg_catalog.to_char(p_business_date,'YYYY-MM-DD'),p_region,p_action,p_expected_revision::text,
    'lookup',p_idempotency_key,p_request_sha256,p_nonce,p_expires::text);
  IF pg_catalog.encode(kts_crypto.hmac(pg_catalog.convert_to(v_message,'UTF8'),pg_catalog.decode(v_hash,'hex'),'sha256'),'hex') IS DISTINCT FROM p_proof THEN
    RAISE EXCEPTION 'TEAM_ATOMIC_PROOF_INVALID';
  END IF;
  PERFORM pg_catalog.set_config('kts.workspace_id',v_workspace,true);
  SELECT m.team_role INTO v_role FROM kts_team.memberships m JOIN kts_team.identities i ON i.user_id=m.user_id
    WHERE m.workspace_id=v_workspace AND m.user_id=v_user AND m.revoked_at IS NULL AND i.disabled_at IS NULL
    FOR SHARE OF m,i;
  IF NOT FOUND OR (p_action='submit_review' AND COALESCE(v_role,'') NOT IN ('operator','admin'))
      OR (p_action='approve_review' AND COALESCE(v_role,'') NOT IN ('reviewer','admin'))
      OR p_expires <= pg_catalog.floor(EXTRACT(epoch FROM pg_catalog.clock_timestamp()))::bigint
      OR v_session_expires <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'TEAM_ATOMIC_SESSION_INVALID';
  END IF;
  SELECT e.* INTO v_event FROM kts_team.idempotency_receipts r JOIN kts_team.scope_events e
    ON e.workspace_id=r.workspace_id AND e.event_id=r.event_id
    WHERE r.workspace_id=v_workspace AND r.idempotency_key=p_idempotency_key
      AND r.request_sha256=p_request_sha256 AND e.payload_sha256=p_request_sha256
      AND e.actor_user_id=v_user AND e.partner_id=p_partner_id AND e.business_date=p_business_date
      AND e.region=p_region AND e.scope_revision=p_expected_revision+1
      AND e.event_kind=CASE p_action WHEN 'submit_review' THEN 'SUBMITTED' ELSE 'REVIEWED' END;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('classification','UNKNOWN'); END IF;
  RETURN pg_catalog.jsonb_build_object('classification','MATCHED_SERVER_RECEIPT',
    'event_id',v_event.event_id,'feed_seq',v_event.feed_seq,'new_revision',v_event.scope_revision,
    'state',CASE p_action WHEN 'submit_review' THEN 'PENDING_REVIEW' ELSE 'REVIEWED' END);
END;
$lookup$;
REVOKE ALL ON FUNCTION kts_team.atomic_review_reconcile_v1(text,text,bigint,text,text,text,date,text,text,bigint,text,text) FROM PUBLIC;
ALTER FUNCTION kts_team.atomic_review_reconcile_v1(text,text,bigint,text,text,text,date,text,text,bigint,text,text) OWNER TO kts_atomic_owner;

-- Draft boundary uses its own proof domain and binds the exact UTF-8 snapshot.
-- No runtime permissions are granted by this candidate.
CREATE FUNCTION kts_team.atomic_draft_v1(
  p_session_id text,p_nonce text,p_expires bigint,p_proof text,
  p_workspace_id text,p_partner_id text,p_business_date date,p_region text,
  p_action text,p_expected_revision bigint,p_event_id text,p_idempotency_key text,
  p_request_sha256 text,p_snapshot_text text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog
AS $draft$
DECLARE
  v_hash text; v_user text; v_workspace text; v_message text; v_role text;
  v_session_expires timestamptz; v_result jsonb; v_snapshot jsonb;
  v_now bigint := pg_catalog.floor(EXTRACT(epoch FROM pg_catalog.clock_timestamp()))::bigint;
BEGIN
  IF p_session_id IS NULL OR p_session_id !~ '^[a-f0-9]{64}$'
    OR p_nonce IS NULL OR p_nonce !~ '^[a-f0-9]{32}$'
    OR p_proof IS NULL OR p_proof !~ '^[a-f0-9]{64}$'
    OR p_expires IS NULL OR p_expires <= v_now OR p_expires > v_now+60
    OR p_workspace_id IS NULL OR p_workspace_id !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'
    OR p_partner_id IS NULL OR p_partner_id !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'
    OR p_event_id IS NULL OR p_event_id !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'
    OR p_idempotency_key IS NULL OR p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'
    OR p_business_date IS NULL OR p_region NOT IN ('mn','mt','mb') OR p_region IS NULL
    OR p_action NOT IN ('create_draft','edit_draft') OR p_action IS NULL
    OR p_expected_revision IS NULL OR p_expected_revision<0 OR p_expected_revision>=9007199254740991
    OR p_request_sha256 IS NULL OR p_request_sha256 !~ '^[a-f0-9]{64}$'
    OR p_snapshot_text IS NULL OR pg_catalog.octet_length(pg_catalog.convert_to(p_snapshot_text,'UTF8'))>65536 THEN
    RAISE EXCEPTION 'TEAM_ATOMIC_PROOF_INVALID';
  END IF;
  BEGIN
    SELECT s.session_hash,s.user_id,s.workspace_id,s.expires_at INTO STRICT v_hash,v_user,v_workspace,v_session_expires
      FROM kts_auth.sessions s
      WHERE pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(s.session_hash,'UTF8')),'hex')=p_session_id
        AND s.revoked_at IS NULL AND s.expires_at>pg_catalog.clock_timestamp()
      FOR SHARE;
  EXCEPTION WHEN no_data_found OR too_many_rows THEN
    RAISE EXCEPTION 'TEAM_ATOMIC_SESSION_INVALID';
  END;
  IF v_workspace<>p_workspace_id THEN RAISE EXCEPTION 'TEAM_ATOMIC_SESSION_INVALID'; END IF;
  v_message:=pg_catalog.concat_ws('|','kts-draft-v1',p_session_id,p_workspace_id,p_partner_id,
    pg_catalog.to_char(p_business_date,'YYYY-MM-DD'),p_region,p_action,p_expected_revision::text,
    p_event_id,p_idempotency_key,p_request_sha256,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_snapshot_text,'UTF8')),'hex'),p_nonce,p_expires::text);
  IF pg_catalog.encode(kts_crypto.hmac(pg_catalog.convert_to(v_message,'UTF8'),pg_catalog.decode(v_hash,'hex'),'sha256'),'hex') IS DISTINCT FROM p_proof THEN
    RAISE EXCEPTION 'TEAM_ATOMIC_PROOF_INVALID';
  END IF;
  PERFORM pg_catalog.set_config('kts.workspace_id',v_workspace,true);
  PERFORM pg_catalog.set_config('kts.actor_user_id',v_user,true);
  SELECT m.team_role INTO v_role FROM kts_team.memberships m JOIN kts_team.identities i ON i.user_id=m.user_id
    WHERE m.workspace_id=v_workspace AND m.user_id=v_user AND m.revoked_at IS NULL AND i.disabled_at IS NULL
    FOR SHARE OF m,i;
  IF NOT FOUND OR COALESCE(v_role,'') NOT IN ('admin','operator')
      OR p_expires <= pg_catalog.floor(EXTRACT(epoch FROM pg_catalog.clock_timestamp()))::bigint
      OR v_session_expires <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'TEAM_ATOMIC_SESSION_INVALID';
  END IF;
  v_snapshot:=p_snapshot_text::jsonb;
  IF pg_catalog.jsonb_typeof(v_snapshot) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'TEAM_DRAFT_SNAPSHOT_INVALID'; END IF;
  INSERT INTO kts_auth.atomic_review_nonces(session_id,nonce) VALUES(p_session_id,p_nonce);
  v_result:=kts_team.append_draft(p_workspace_id,p_partner_id,p_business_date,p_region,p_expected_revision,
    p_event_id,p_idempotency_key,p_request_sha256,v_snapshot);
  IF pg_catalog.jsonb_typeof(v_result) IS DISTINCT FROM 'object'
     OR pg_catalog.jsonb_typeof(v_result->'replayed') IS DISTINCT FROM 'boolean'
     OR ((v_result->>'replayed')='false' AND v_result->>'event_id' IS DISTINCT FROM p_event_id)
     OR NOT EXISTS (
       SELECT 1 FROM kts_team.idempotency_receipts r JOIN kts_team.scope_events e
         ON e.workspace_id=r.workspace_id AND e.event_id=r.event_id
       WHERE r.workspace_id=v_workspace AND r.idempotency_key=p_idempotency_key
         AND r.request_sha256=p_request_sha256 AND e.payload_sha256=p_request_sha256
         AND e.actor_user_id=v_user AND e.partner_id=p_partner_id AND e.result_snapshot=v_snapshot
         AND e.business_date=p_business_date AND e.region=p_region
         AND e.event_kind=CASE WHEN p_expected_revision=0 THEN 'DRAFT_CREATED' ELSE 'DRAFT_CHANGED' END
         AND e.scope_revision=p_expected_revision+1
         AND e.event_id=v_result->>'event_id' AND e.feed_seq::text=v_result->>'feed_seq'
         AND e.scope_revision::text=v_result->>'new_revision'
     ) THEN RAISE EXCEPTION 'TEAM_ATOMIC_RECEIPT_MISMATCH'; END IF;
  RETURN v_result;
END;
$draft$;
REVOKE ALL ON FUNCTION kts_team.atomic_draft_v1(text,text,bigint,text,text,text,date,text,text,bigint,text,text,text,text) FROM PUBLIC;
ALTER FUNCTION kts_team.atomic_draft_v1(text,text,bigint,text,text,text,date,text,text,bigint,text,text,text,text) OWNER TO kts_atomic_owner;

-- Lookup is separate from mutation and returns UNKNOWN for missing/mismatched
-- evidence. It takes row locks, so it is not a READ ONLY transaction.
CREATE FUNCTION kts_team.atomic_draft_reconcile_v1(
  p_session_id text,p_nonce text,p_expires bigint,p_proof text,
  p_workspace_id text,p_partner_id text,p_business_date date,p_region text,
  p_action text,p_expected_revision bigint,p_idempotency_key text,p_request_sha256 text,p_snapshot_text text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog
AS $draft_lookup$
DECLARE
  v_hash text; v_user text; v_workspace text; v_message text; v_role text;
  v_session_expires timestamptz; v_event kts_team.scope_events%ROWTYPE; v_snapshot jsonb;
  v_now bigint := pg_catalog.floor(EXTRACT(epoch FROM pg_catalog.clock_timestamp()))::bigint;
BEGIN
  IF p_session_id IS NULL OR p_session_id !~ '^[a-f0-9]{64}$'
    OR p_nonce IS NULL OR p_nonce !~ '^[a-f0-9]{32}$'
    OR p_proof IS NULL OR p_proof !~ '^[a-f0-9]{64}$'
    OR p_expires IS NULL OR p_expires <= v_now OR p_expires > v_now+60
    OR p_workspace_id IS NULL OR p_workspace_id !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'
    OR p_partner_id IS NULL OR p_partner_id !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'
    OR p_idempotency_key IS NULL OR p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'
    OR p_business_date IS NULL OR p_region NOT IN ('mn','mt','mb') OR p_region IS NULL
    OR p_action NOT IN ('create_draft','edit_draft') OR p_action IS NULL
    OR p_expected_revision IS NULL OR p_expected_revision<0 OR p_expected_revision>=9007199254740991
    OR p_request_sha256 IS NULL OR p_request_sha256 !~ '^[a-f0-9]{64}$'
    OR p_snapshot_text IS NULL OR pg_catalog.octet_length(pg_catalog.convert_to(p_snapshot_text,'UTF8'))>65536 THEN
    RAISE EXCEPTION 'TEAM_ATOMIC_PROOF_INVALID';
  END IF;
  BEGIN
    SELECT s.session_hash,s.user_id,s.workspace_id,s.expires_at INTO STRICT v_hash,v_user,v_workspace,v_session_expires
      FROM kts_auth.sessions s
      WHERE pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(s.session_hash,'UTF8')),'hex')=p_session_id
        AND s.revoked_at IS NULL AND s.expires_at>pg_catalog.clock_timestamp()
      FOR SHARE;
  EXCEPTION WHEN no_data_found OR too_many_rows THEN
    RAISE EXCEPTION 'TEAM_ATOMIC_SESSION_INVALID';
  END;
  IF v_workspace<>p_workspace_id THEN RAISE EXCEPTION 'TEAM_ATOMIC_SESSION_INVALID'; END IF;
  v_message:=pg_catalog.concat_ws('|','kts-draft-lookup-v1',p_session_id,p_workspace_id,p_partner_id,
    pg_catalog.to_char(p_business_date,'YYYY-MM-DD'),p_region,p_action,p_expected_revision::text,
    'lookup',p_idempotency_key,p_request_sha256,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_snapshot_text,'UTF8')),'hex'),p_nonce,p_expires::text);
  IF pg_catalog.encode(kts_crypto.hmac(pg_catalog.convert_to(v_message,'UTF8'),pg_catalog.decode(v_hash,'hex'),'sha256'),'hex') IS DISTINCT FROM p_proof THEN
    RAISE EXCEPTION 'TEAM_ATOMIC_PROOF_INVALID';
  END IF;
  PERFORM pg_catalog.set_config('kts.workspace_id',v_workspace,true);
  SELECT m.team_role INTO v_role FROM kts_team.memberships m JOIN kts_team.identities i ON i.user_id=m.user_id
    WHERE m.workspace_id=v_workspace AND m.user_id=v_user AND m.revoked_at IS NULL AND i.disabled_at IS NULL
    FOR SHARE OF m,i;
  IF NOT FOUND OR COALESCE(v_role,'') NOT IN ('admin','operator')
      OR p_expires <= pg_catalog.floor(EXTRACT(epoch FROM pg_catalog.clock_timestamp()))::bigint
      OR v_session_expires <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'TEAM_ATOMIC_SESSION_INVALID';
  END IF;
  v_snapshot:=p_snapshot_text::jsonb;
  IF pg_catalog.jsonb_typeof(v_snapshot) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'TEAM_DRAFT_SNAPSHOT_INVALID'; END IF;
  SELECT e.* INTO v_event FROM kts_team.idempotency_receipts r JOIN kts_team.scope_events e
    ON e.workspace_id=r.workspace_id AND e.event_id=r.event_id
    WHERE r.workspace_id=v_workspace AND r.idempotency_key=p_idempotency_key
      AND r.request_sha256=p_request_sha256 AND e.payload_sha256=p_request_sha256
      AND e.actor_user_id=v_user AND e.partner_id=p_partner_id AND e.business_date=p_business_date
      AND e.region=p_region AND e.scope_revision=p_expected_revision+1 AND e.result_snapshot=v_snapshot
      AND e.event_kind=CASE WHEN p_expected_revision=0 THEN 'DRAFT_CREATED' ELSE 'DRAFT_CHANGED' END;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('classification','UNKNOWN'); END IF;
  RETURN pg_catalog.jsonb_build_object('classification','MATCHED_SERVER_RECEIPT',
    'event_id',v_event.event_id,'feed_seq',v_event.feed_seq,'new_revision',v_event.scope_revision);
END;
$draft_lookup$;
REVOKE ALL ON FUNCTION kts_team.atomic_draft_reconcile_v1(text,text,bigint,text,text,text,date,text,text,bigint,text,text,text) FROM PUBLIC;
ALTER FUNCTION kts_team.atomic_draft_reconcile_v1(text,text,bigint,text,text,text,date,text,text,bigint,text,text,text) OWNER TO kts_atomic_owner;
COMMIT;
