-- REVIEW-ONLY candidate, NEVER add to migrations or execute against live DB.
-- Needs an independently reviewed non-login owner with minimum SELECT grants;
-- this file DOES NOT create roles/grant privileges/activate an app route.
-- PostgreSQL16 DDL compilation + SQL security QA = NOT_RUN on this SHA.
BEGIN;
DO $precheck$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
     WHERE rolname='kts_receipt_read_owner'
       AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls
       AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles r ON r.oid=m.member OR r.oid=m.roleid
    WHERE r.rolname='kts_receipt_read_owner'
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_roles r ON r.oid=c.relowner
    WHERE r.rolname='kts_receipt_read_owner'
      AND c.relnamespace IN ('kts_team'::regnamespace,'kts_auth'::regnamespace)
      AND c.relkind IN ('r','p')
  ) OR pg_catalog.to_regprocedure(
    'kts_team.candidate_receipt_read_v1(text,text,text,bigint,text[],text)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'TEAM_RECEIPT_READ_OWNER_OR_PREEXISTING_FUNCTION_UNQUALIFIED';
  END IF;
END;
$precheck$;

CREATE FUNCTION kts_team.candidate_receipt_read_v1(
  p_session_id text, p_workspace_id text, p_nonce text,
  p_expires bigint, p_keys text[], p_proof text
) RETURNS TABLE (
  workspace_id text, idempotency_key text, request_sha256 text,
  event_id text, actor_user_id text, partner_id text,
  business_date text, region text, scope_revision bigint,
  feed_seq bigint, event_kind text, payload_sha256 text
) LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog
AS $receipt_read$
DECLARE
  v_secret text; v_user text; v_workspace text; v_expires timestamptz;
  v_role text; v_message text;
  v_now bigint := pg_catalog.floor(EXTRACT(epoch FROM pg_catalog.clock_timestamp()))::bigint;
BEGIN
  -- A caller-supplied tenant GUC or actor GUC is NEVER authentication.
  -- All authorization inputs are bound to a per-session, expiry-limited HMAC.
  -- The session hash is derivable from the bearer: this HMAC is NOT proof
  -- that the request came from a trusted backend rather than a bearer holder.
  IF p_session_id IS NULL OR p_session_id !~ '^[a-f0-9]{64}$'
    OR p_nonce IS NULL OR p_nonce !~ '^[a-f0-9]{32}$'
    OR p_proof IS NULL OR p_proof !~ '^[a-f0-9]{64}$'
    OR p_workspace_id IS NULL OR p_workspace_id !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'
    OR p_expires IS NULL OR p_expires <= v_now OR p_expires > v_now+30
    OR p_keys IS NULL OR pg_catalog.array_ndims(p_keys)<>1
    OR pg_catalog.cardinality(p_keys) NOT BETWEEN 1 AND 30
    OR EXISTS (SELECT 1 FROM pg_catalog.unnest(p_keys) AS t(k)
               WHERE k IS NULL OR k !~ '^draft_[a-f0-9]{32}$')
    OR ARRAY(SELECT DISTINCT t.k FROM pg_catalog.unnest(p_keys) AS t(k)
             ORDER BY t.k) IS DISTINCT FROM p_keys
  THEN
    RAISE EXCEPTION 'TEAM_RECEIPT_READ_PROOF_INVALID';
  END IF;
  -- A synthetic OWNER with narrowly reviewed rights reads only auth sessions.
  -- Session_hash is a one-way hash of the bearer token, NEVER returned.
  BEGIN
    SELECT s.session_hash,s.user_id,s.workspace_id,s.expires_at
      INTO STRICT v_secret,v_user,v_workspace,v_expires
      FROM kts_auth.sessions s
     WHERE pg_catalog.encode(pg_catalog.sha256(
       pg_catalog.convert_to(s.session_hash,'UTF8')),'hex')=p_session_id
       AND s.revoked_at IS NULL AND s.expires_at > pg_catalog.clock_timestamp();
  EXCEPTION WHEN no_data_found OR too_many_rows THEN
    RAISE EXCEPTION 'TEAM_RECEIPT_READ_SESSION_INVALID';
  END;
  IF v_workspace IS DISTINCT FROM p_workspace_id THEN
    RAISE EXCEPTION 'TEAM_RECEIPT_READ_SESSION_INVALID';
  END IF;
  -- Domain-separated and bound to the exact sorted request-key list,
  -- signed tenant, expiry and one-use caller-generated nonce.
  -- This read-only function DOES NOT provide nonce replay protection;
  -- repeated exact signed reads remain possible until expiry.
  v_message:=pg_catalog.concat_ws('|','kts-receipt-read-v1',p_session_id,
    p_workspace_id,pg_catalog.array_to_string(p_keys,','),p_nonce,p_expires::text);
  IF pg_catalog.encode(kts_crypto.hmac(
       pg_catalog.convert_to(v_message,'UTF8'),
       pg_catalog.decode(v_secret,'hex'),'sha256'),'hex')
     IS DISTINCT FROM p_proof THEN
    RAISE EXCEPTION 'TEAM_RECEIPT_READ_PROOF_INVALID';
  END IF;
  -- Discard any attacker-supplied kts.workspace_id setting. The tenant
  -- comes only from the verified session, then membership is rechecked.
  PERFORM pg_catalog.set_config('kts.workspace_id',v_workspace,true);
  SELECT m.team_role INTO v_role
    FROM kts_team.memberships m
    JOIN kts_team.identities i ON i.user_id=m.user_id
   WHERE m.workspace_id=v_workspace AND m.user_id=v_user
     AND m.revoked_at IS NULL AND i.disabled_at IS NULL;
  IF NOT FOUND OR v_role NOT IN ('admin','operator')
     OR v_expires <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'TEAM_RECEIPT_READ_MEMBERSHIP_DENIED';
  END IF;
  -- This function is intended to be invoked in a READ ONLY transaction.
  -- No row locks: concurrent revocation between query and HTTP response
  -- requires separate HTTP post-check and independent race acceptance.
  RETURN QUERY
    SELECT r.workspace_id,r.idempotency_key,r.request_sha256,
           e.event_id,e.actor_user_id,e.partner_id,e.business_date::text,
           e.region,e.scope_revision,e.feed_seq,e.event_kind,e.payload_sha256
      FROM kts_team.idempotency_receipts r
      JOIN kts_team.scope_events e
        ON e.workspace_id=r.workspace_id AND e.event_id=r.event_id
     WHERE r.workspace_id=v_workspace AND e.actor_user_id=v_user
       AND r.idempotency_key=ANY(p_keys)
     ORDER BY r.idempotency_key;
END;
$receipt_read$;
-- This function is NOT wired into the app and has no runtime EXECUTE grant.
REVOKE ALL ON FUNCTION kts_team.candidate_receipt_read_v1(
  text,text,text,bigint,text[],text) FROM PUBLIC;
ALTER FUNCTION kts_team.candidate_receipt_read_v1(
  text,text,text,bigint,text[],text) OWNER TO kts_receipt_read_owner;
COMMIT;
