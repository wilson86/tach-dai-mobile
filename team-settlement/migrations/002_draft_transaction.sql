-- M1 candidate: atomic DRAFT-only write path, callable solely by a trusted server.
-- The caller MUST authenticate and SET LOCAL kts.workspace_id and kts.actor_user_id.
-- SECURITY INVOKER intentionally requires runtime DB rights and enforces RLS.
-- Never connect this code to operational Router/Telegram or real financial data.
BEGIN;
CREATE OR REPLACE FUNCTION kts_team.append_draft(
  p_workspace_id text,
  p_partner_id text,
  p_business_date date,
  p_region text,
  p_expected_revision bigint,
  p_event_id text,
  p_idempotency_key text,
  p_request_sha256 text,
  p_snapshot jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, kts_team
AS $$
DECLARE
  v_actor text;
  v_role text;
  v_saved kts_team.idempotency_receipts%ROWTYPE;
  v_revision bigint;
  v_state text;
BEGIN
  v_actor := NULLIF(current_setting('kts.actor_user_id', true),'');
  IF v_actor IS NULL THEN RAISE EXCEPTION 'TEAM_ACTOR_UNVERIFIED'; END IF;
  IF current_setting('kts.workspace_id', true) IS DISTINCT FROM p_workspace_id THEN
    RAISE EXCEPTION 'TEAM_WORKSPACE_DENIED';
  END IF;
  SELECT team_role INTO v_role
  FROM kts_team.memberships
  WHERE workspace_id=p_workspace_id AND user_id=v_actor AND revoked_at IS NULL;
  IF COALESCE(v_role,'') NOT IN ('admin','operator') THEN
    RAISE EXCEPTION 'TEAM_ROLE_DENIED';
  END IF;
  IF p_expected_revision IS NULL OR p_expected_revision<0 OR
      p_partner_id IS NULL OR p_business_date IS NULL OR p_region NOT IN ('mn','mt','mb') THEN
    RAISE EXCEPTION 'TEAM_SCOPE_INVALID';
  END IF;
  IF p_event_id IS NULL OR p_event_id !~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$' OR
     p_idempotency_key IS NULL OR p_idempotency_key !~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$' OR
     p_request_sha256 IS NULL OR p_request_sha256 !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'TEAM_REQUEST_INVALID';
  END IF;
  IF p_snapshot IS NULL OR jsonb_typeof(p_snapshot)<>'object' OR
     octet_length(p_snapshot::text)>65536 THEN
    RAISE EXCEPTION 'TEAM_DRAFT_SNAPSHOT_INVALID';
  END IF;

  -- The advisory lock only serializes same-key retries. A row lock + revision
  -- check serializes *different* keys modifying the same financial scope.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id||':idem:'||p_idempotency_key,0));
  SELECT * INTO v_saved
  FROM kts_team.idempotency_receipts
  WHERE workspace_id=p_workspace_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_saved.request_sha256<>p_request_sha256 THEN
      RAISE EXCEPTION 'TEAM_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object('event_id',v_saved.event_id,'replayed',true);
  END IF;

  INSERT INTO kts_team.scopes(workspace_id,partner_id,business_date,region,state,revision)
  VALUES(p_workspace_id,p_partner_id,p_business_date,p_region,'DRAFT',0)
  ON CONFLICT (workspace_id,partner_id,business_date,region) DO NOTHING;

  SELECT revision,state INTO v_revision,v_state
  FROM kts_team.scopes
  WHERE workspace_id=p_workspace_id AND partner_id=p_partner_id AND
        business_date=p_business_date AND region=p_region FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TEAM_SCOPE_NOT_FOUND'; END IF;
  IF v_state<>'DRAFT' THEN RAISE EXCEPTION 'TEAM_CLOSED_OR_PENDING_IMMUTABLE'; END IF;
  IF v_revision<>p_expected_revision THEN RAISE EXCEPTION 'TEAM_REVISION_CONFLICT'; END IF;

  UPDATE kts_team.scopes
  SET revision=revision+1,updated_at=now()
  WHERE workspace_id=p_workspace_id AND partner_id=p_partner_id AND
        business_date=p_business_date AND region=p_region AND revision=p_expected_revision;
  IF NOT FOUND THEN RAISE EXCEPTION 'TEAM_REVISION_CONFLICT'; END IF;
  INSERT INTO kts_team.scope_events(
    workspace_id,event_id,partner_id,business_date,region,scope_revision,
    actor_user_id,event_kind,payload_sha256,result_snapshot
  ) VALUES (
    p_workspace_id,p_event_id,p_partner_id,p_business_date,p_region,p_expected_revision+1,
    v_actor,CASE WHEN p_expected_revision=0 THEN 'DRAFT_CREATED' ELSE 'DRAFT_CHANGED' END,
    p_request_sha256,p_snapshot
  );
  INSERT INTO kts_team.idempotency_receipts(
    workspace_id,idempotency_key,request_sha256,event_id
  ) VALUES(p_workspace_id,p_idempotency_key,p_request_sha256,p_event_id);
  RETURN jsonb_build_object(
    'event_id',p_event_id,'replayed',false,
    'new_revision',p_expected_revision+1
  );
END;
$$;
COMMIT;

-- GRANT EXECUTE only to reviewed runtime API role. Do not expose DB port.
-- This function handles DRAFT ONLY; there is NO live finalization endpoint.
