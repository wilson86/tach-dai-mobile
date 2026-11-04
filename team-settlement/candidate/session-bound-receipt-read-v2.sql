-- REVIEW-ONLY, UNAPPROVED candidate for PostgreSQL 16. DO NOT EXECUTE.
-- This candidate is not in migrations and is NOT wired into HTTP, Ledger,
-- CI, Actions, a production connection pool, or a key-management process.
-- Required before any execution: independent review of owner, key custody,
-- kts_crypto.hmac provenance/ACL, row locks, exact JS/SQL vector parity,
-- effective grants, logging, and ALL direct Ledger tenant read paths.
-- Prerequisite protected table (NOT created here): kts_auth.receipt_v2_verifier_keys
-- columns: key_id text UNIQUE NOT NULL, secret_bytes bytea NOT NULL (32 bytes),
-- activated_at timestamptz NOT NULL, stop_verify_at timestamptz NOT NULL,
-- revoked_at timestamptz NULL. Key must be provisioned out of band;
-- no secret values or privileges are embedded in this repository.
-- Prerequisite: kts_auth.sessions.session_handle 32-hex server-only UNIQUE index.
-- Never use a bearer, token hash, session hash, or browser field as the HMAC key.
-- Requires a READ WRITE transaction for FOR SHARE locks; this procedure
-- performs NO persistent mutation but cannot be called in READ ONLY mode.
BEGIN;
DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname='kts_receipt_read_owner' AND NOT rolcanlogin
      AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole
      AND NOT rolcreatedb AND NOT rolreplication
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles r ON r.oid=m.member OR r.oid=m.roleid
    WHERE r.rolname='kts_receipt_read_owner'
  ) OR pg_catalog.to_regclass('kts_auth.receipt_v2_verifier_keys') IS NULL
    OR pg_catalog.to_regprocedure('kts_crypto.hmac(bytea,bytea,text)') IS NULL
    OR pg_catalog.to_regprocedure(
      'kts_team.candidate_receipt_read_v2(text,text,text,text,text[],text,bigint,bigint,text)'
    ) IS NOT NULL
  THEN
    RAISE EXCEPTION 'TEAM_V2_OWNER_CRYPTO_KEYSTORE_UNQUALIFIED';
  END IF;
END;
$guard$;

CREATE FUNCTION kts_team.candidate_receipt_read_v2(
  p_key_id text, p_session_handle text, p_workspace_id text, p_user_id text,
  p_keys text[], p_nonce text, p_issued bigint, p_expires bigint, p_proof text
) RETURNS TABLE (
  workspace_id text, idempotency_key text, request_sha256 text,
  event_id text, actor_user_id text, partner_id text,
  business_date text, region text, scope_revision bigint,
  feed_seq bigint, event_kind text, payload_sha256 text
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
SET row_security = on
AS $receipt_v2$
DECLARE
  v_user text; v_workspace text; v_role text; v_key bytea;
  v_now bigint;
  v_message text := '';
  v_piece text;
  v_value text;
  v_keys_count integer;
  v_rowcount bigint;
BEGIN
  -- Strict validation before any Auth, secret or tenant-table lookup.
  IF p_key_id IS NULL OR p_key_id !~ '^[a-f0-9]{16}$'
    OR p_session_handle IS NULL OR p_session_handle !~ '^[a-f0-9]{32}$'
    OR p_workspace_id IS NULL OR p_workspace_id !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'
    OR p_user_id IS NULL OR p_user_id !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'
    OR p_nonce IS NULL OR p_nonce !~ '^[a-f0-9]{32}$'
    OR p_proof IS NULL OR p_proof !~ '^[a-f0-9]{64}$'
    OR p_issued IS NULL OR p_expires IS NULL
    OR p_issued < 0 OR p_expires < 0
    OR p_expires <= p_issued OR p_expires - p_issued > 30
    OR p_keys IS NULL OR pg_catalog.array_ndims(p_keys) <> 1
    OR pg_catalog.cardinality(p_keys) NOT BETWEEN 1 AND 30
  THEN
    RAISE EXCEPTION 'TEAM_RECEIPT_V2_PROOF_DENIED';
  END IF;
  v_now := pg_catalog.floor(
    pg_catalog.extract(epoch FROM pg_catalog.clock_timestamp()))::bigint;
  IF p_issued > v_now OR p_expires <= v_now THEN
    RAISE EXCEPTION 'TEAM_RECEIPT_V2_PROOF_DENIED';
  END IF;
  v_keys_count := pg_catalog.cardinality(p_keys);
  -- Prevent ambiguous keys, order permutations, duplication and SQL arrays
  -- with NULL elements; the JS signer accepts ascending unique draft keys.
  IF EXISTS (
       SELECT 1 FROM pg_catalog.unnest(p_keys) AS e(k)
       WHERE e.k IS NULL OR e.k !~ '^draft_[a-f0-9]{32}$'
     ) OR ARRAY(
       SELECT DISTINCT e.k FROM pg_catalog.unnest(p_keys) AS e(k)
       ORDER BY e.k
     ) IS DISTINCT FROM p_keys
  THEN
    RAISE EXCEPTION 'TEAM_RECEIPT_V2_PROOF_DENIED';
  END IF;

  -- Authoritative session lookup is INDEXABLE by server-held random handle.
  -- Its row lock is kept until the surrounding SQL transaction ends.
  BEGIN
    SELECT s.user_id,s.workspace_id INTO STRICT v_user,v_workspace
    FROM kts_auth.sessions AS s
    WHERE s.session_handle=p_session_handle
      AND s.revoked_at IS NULL
      AND s.expires_at > pg_catalog.clock_timestamp()
    FOR SHARE;
  EXCEPTION WHEN no_data_found OR too_many_rows THEN
    RAISE EXCEPTION 'TEAM_RECEIPT_V2_SESSION_DENIED';
  END;
  IF v_workspace IS DISTINCT FROM p_workspace_id OR
     v_user IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'TEAM_RECEIPT_V2_SESSION_DENIED';
  END IF;

  -- Never trust a Ledger/client-controlled tenant GUC. FORCE RLS policies
  -- will use the trusted DB session workspace in this transaction.
  PERFORM pg_catalog.set_config('kts.workspace_id',v_workspace,true);
  BEGIN
    SELECT m.team_role INTO STRICT v_role
    FROM kts_team.memberships AS m
    JOIN kts_team.identities AS i ON i.user_id=m.user_id
    WHERE m.workspace_id=v_workspace AND m.user_id=v_user
      AND m.revoked_at IS NULL AND i.disabled_at IS NULL
    FOR SHARE OF m,i;
  EXCEPTION WHEN no_data_found OR too_many_rows THEN
    RAISE EXCEPTION 'TEAM_RECEIPT_V2_MEMBERSHIP_DENIED';
  END;
  IF v_role NOT IN ('admin','operator') THEN
    RAISE EXCEPTION 'TEAM_RECEIPT_V2_MEMBERSHIP_DENIED';
  END IF;

  -- Protected verifier keys: provisioned independently, no Ledger direct
  -- SELECT, SQL function EXECUTE grant, PUBLIC or default ACL is assumed.
  BEGIN
    SELECT k.secret_bytes INTO STRICT v_key
    FROM kts_auth.receipt_v2_verifier_keys AS k
    WHERE k.key_id=p_key_id
      AND k.revoked_at IS NULL
      AND k.activated_at <= pg_catalog.clock_timestamp()
      AND k.stop_verify_at > pg_catalog.clock_timestamp();
  EXCEPTION WHEN no_data_found OR too_many_rows THEN
    RAISE EXCEPTION 'TEAM_RECEIPT_V2_PROOF_DENIED';
  END;
  IF v_key IS NULL OR pg_catalog.octet_length(v_key) <> 32 THEN
    RAISE EXCEPTION 'TEAM_RECEIPT_V2_PROOF_DENIED';
  END IF;

  -- The byte stream MUST exactly match JS receipt-backend-proof-v2.cjs:
  -- length (UTF-8 bytes as ASCII decimal) ":" value, concatenated for each
  -- purpose, key_id, session_handle, workspace_id, user_id, key count,
  -- each sorted unique key, nonce, issued_at and expires_at.
  -- All allowed user-controlled fields are ASCII by validation above.
  FOREACH v_piece IN ARRAY ARRAY[
    'kts-receipt-read-v2',p_key_id,p_session_handle,p_workspace_id,
    p_user_id,v_keys_count::text
  ] LOOP
    v_message := v_message ||
      pg_catalog.octet_length(pg_catalog.convert_to(v_piece,'UTF8'))::text
      || ':' || v_piece;
  END LOOP;
  FOREACH v_piece IN ARRAY p_keys LOOP
    v_message := v_message ||
      pg_catalog.octet_length(pg_catalog.convert_to(v_piece,'UTF8'))::text
      || ':' || v_piece;
  END LOOP;
  FOREACH v_piece IN ARRAY ARRAY[p_nonce,p_issued::text,p_expires::text] LOOP
    v_message := v_message ||
      pg_catalog.octet_length(pg_catalog.convert_to(v_piece,'UTF8'))::text
      || ':' || v_piece;
  END LOOP;

  -- Compare digest as encoded lowercase SHA256. This is NOT a substitute
  -- for a separately reviewed key owner/ACL and chosen-time comparison audit.
  IF pg_catalog.encode(kts_crypto.hmac(
      pg_catalog.convert_to(v_message,'UTF8'),v_key,'sha256'),'hex')
      IS DISTINCT FROM p_proof THEN
    RAISE EXCEPTION 'TEAM_RECEIPT_V2_PROOF_DENIED';
  END IF;

  -- A proof is replayable for the short validity window; do not describe
  -- this as one-time or nonce-replay-safe. Post-check expiry before return.
  IF p_expires <= pg_catalog.floor(
      pg_catalog.extract(epoch FROM pg_catalog.clock_timestamp()))::bigint THEN
    RAISE EXCEPTION 'TEAM_RECEIPT_V2_EXPIRED';
  END IF;
  RETURN QUERY
    SELECT r.workspace_id,r.idempotency_key,r.request_sha256,
           e.event_id,e.actor_user_id,e.partner_id,e.business_date::text,
           e.region,e.scope_revision,e.feed_seq,e.event_kind,e.payload_sha256
    FROM kts_team.idempotency_receipts AS r
    JOIN kts_team.scope_events AS e
      ON e.workspace_id=r.workspace_id AND e.event_id=r.event_id
    WHERE r.workspace_id=v_workspace
      AND e.actor_user_id=v_user AND r.idempotency_key=ANY(p_keys)
    ORDER BY r.idempotency_key;
END;
$receipt_v2$;

-- No EXECUTE grant to application roles. No PUBLIC default privileges.
REVOKE ALL ON FUNCTION kts_team.candidate_receipt_read_v2(
 text,text,text,text,text[],text,bigint,bigint,text
) FROM PUBLIC;
ALTER FUNCTION kts_team.candidate_receipt_read_v2(
 text,text,text,text,text[],text,bigint,bigint,text
) OWNER TO kts_receipt_read_owner;
COMMIT;
