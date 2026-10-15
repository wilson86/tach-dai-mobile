-- M2 synthetic-only human review transitions; no money, close, reopen or production migration.
-- Apply ONLY after 001, 002, 003 on a fresh disposable isolated PostgreSQL DB.
-- SECURITY INVOKER, RLS and externally verified SET LOCAL workspace/actor required.
BEGIN;
CREATE OR REPLACE FUNCTION kts_team.advance_review(
  p_workspace_id text,
  p_partner_id text,
  p_business_date date,
  p_region text,
  p_action text,
  p_expected_revision bigint,
  p_event_id text,
  p_idempotency_key text,
  p_request_sha256 text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, kts_team
AS $fn$
DECLARE
  v_actor text;
  v_role text;
  v_existing kts_team.idempotency_receipts%ROWTYPE;
  v_original kts_team.scope_events%ROWTYPE;
  v_revision bigint;
  v_state text;
  v_submitted_by text;
  v_reviewed_by text;
  v_feed_seq bigint;
  v_next text;
  v_kind text;
BEGIN
  v_actor := NULLIF(current_setting('kts.actor_user_id', true),'');
  IF v_actor IS NULL THEN RAISE EXCEPTION 'TEAM_ACTOR_UNVERIFIED'; END IF;
  IF current_setting('kts.workspace_id', true) IS DISTINCT FROM p_workspace_id THEN
    RAISE EXCEPTION 'TEAM_WORKSPACE_DENIED';
  END IF;
  IF p_action NOT IN ('submit_review','approve_review') OR p_action IS NULL THEN
    RAISE EXCEPTION 'TEAM_REVIEW_ACTION_FORBIDDEN';
  END IF;
  IF p_expected_revision IS NULL OR p_expected_revision < 0 THEN
    RAISE EXCEPTION 'TEAM_REVISION_INVALID';
  END IF;
  IF p_partner_id IS NULL OR p_business_date IS NULL OR
     p_region NOT IN ('mn','mt','mb') OR p_region IS NULL THEN
    RAISE EXCEPTION 'TEAM_SCOPE_INVALID';
  END IF;
  IF p_event_id IS NULL OR p_event_id !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'
     OR p_idempotency_key IS NULL OR p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'
     OR p_request_sha256 IS NULL OR p_request_sha256 !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'TEAM_REQUEST_INVALID';
  END IF;
  SELECT m.team_role INTO v_role
    FROM kts_team.memberships m JOIN kts_team.identities i ON i.user_id=m.user_id
    WHERE m.workspace_id=p_workspace_id AND m.user_id=v_actor
      AND m.revoked_at IS NULL AND i.disabled_at IS NULL;
  IF (p_action='submit_review' AND COALESCE(v_role,'') NOT IN ('operator','admin'))
     OR (p_action='approve_review' AND COALESCE(v_role,'') NOT IN ('reviewer','admin')) THEN
    RAISE EXCEPTION 'TEAM_ROLE_DENIED';
  END IF;
  v_next := CASE p_action WHEN 'submit_review' THEN 'PENDING_REVIEW'
                           ELSE 'REVIEWED' END;
  v_kind := CASE p_action WHEN 'submit_review' THEN 'SUBMITTED'
                           ELSE 'REVIEWED' END;
  -- Same-key retries serialize independently of scope locking, as in append_draft.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id||':idem:'||p_idempotency_key,0));
  SELECT * INTO v_existing FROM kts_team.idempotency_receipts
    WHERE workspace_id=p_workspace_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_existing.request_sha256 <> p_request_sha256 THEN
      RAISE EXCEPTION 'TEAM_IDEMPOTENCY_CONFLICT';
    END IF;
    SELECT * INTO v_original FROM kts_team.scope_events
      WHERE workspace_id=p_workspace_id AND event_id=v_existing.event_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'TEAM_IDEMPOTENCY_RECEIPT_ORPHANED'; END IF;
    IF v_original.actor_user_id <> v_actor OR v_original.event_kind <> v_kind OR
       v_original.partner_id <> p_partner_id OR
       v_original.business_date <> p_business_date OR v_original.region <> p_region OR
       v_original.scope_revision <> p_expected_revision+1 THEN
      RAISE EXCEPTION 'TEAM_IDEMPOTENCY_CONTEXT_MISMATCH';
    END IF;
    RETURN jsonb_build_object(
      'event_id',v_existing.event_id,'replayed',true,
      'new_revision',v_original.scope_revision,'feed_seq',v_original.feed_seq,
      'state',v_next);
  END IF;
  SELECT revision,state,submitted_by,reviewed_by
    INTO v_revision,v_state,v_submitted_by,v_reviewed_by
    FROM kts_team.scopes WHERE workspace_id=p_workspace_id AND partner_id=p_partner_id
      AND business_date=p_business_date AND region=p_region FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TEAM_SCOPE_NOT_FOUND'; END IF;
  IF v_revision <> p_expected_revision THEN RAISE EXCEPTION 'TEAM_REVISION_CONFLICT'; END IF;
  IF p_action='submit_review' THEN
    IF v_state <> 'DRAFT' THEN RAISE EXCEPTION 'TEAM_SUBMIT_REQUIRES_DRAFT'; END IF;
  ELSE
    IF v_state <> 'PENDING_REVIEW' THEN RAISE EXCEPTION 'TEAM_APPROVE_REQUIRES_PENDING'; END IF;
    IF v_submitted_by IS NULL THEN RAISE EXCEPTION 'TEAM_SUBMITTER_UNVERIFIED'; END IF;
    IF v_submitted_by = v_actor THEN RAISE EXCEPTION 'TEAM_SEPARATION_OF_DUTIES'; END IF;
  END IF;
  UPDATE kts_team.scopes SET
    state=v_next, revision=revision+1, updated_at=now(),
    submitted_by=CASE WHEN p_action='submit_review' THEN v_actor ELSE submitted_by END,
    reviewed_by=CASE WHEN p_action='approve_review' THEN v_actor ELSE reviewed_by END
    WHERE workspace_id=p_workspace_id AND partner_id=p_partner_id
      AND business_date=p_business_date AND region=p_region
      AND revision=p_expected_revision;
  IF NOT FOUND THEN RAISE EXCEPTION 'TEAM_REVISION_CONFLICT'; END IF;
  UPDATE kts_team.workspaces SET feed_seq=feed_seq+1
    WHERE workspace_id=p_workspace_id RETURNING feed_seq INTO v_feed_seq;
  IF NOT FOUND THEN RAISE EXCEPTION 'TEAM_WORKSPACE_DENIED'; END IF;
  INSERT INTO kts_team.scope_events(
    workspace_id,event_id,partner_id,business_date,region,scope_revision,feed_seq,
    actor_user_id,event_kind,payload_sha256,result_snapshot
  ) VALUES (
    p_workspace_id,p_event_id,p_partner_id,p_business_date,p_region,p_expected_revision+1,v_feed_seq,
    v_actor,v_kind,p_request_sha256,jsonb_build_object('synthetic_review_only',true,
      'from_state',v_state,'to_state',v_next,'actor_user_id',v_actor,
      'submitted_by',CASE WHEN p_action='submit_review' THEN v_actor ELSE v_submitted_by END)
  );
  INSERT INTO kts_team.idempotency_receipts(
    workspace_id,idempotency_key,request_sha256,event_id
  ) VALUES(p_workspace_id,p_idempotency_key,p_request_sha256,p_event_id);
  RETURN jsonb_build_object('event_id',p_event_id,'replayed',false,
    'new_revision',p_expected_revision+1,'feed_seq',v_feed_seq,'state',v_next);
END;
$fn$;
REVOKE ALL ON FUNCTION kts_team.advance_review(text,text,date,text,text,bigint,text,text,text) FROM PUBLIC;
COMMIT;
-- Deliberately NO GRANT to production/users. Disposable CI grants only team_smoke_writer.
-- CLOSED, close_scope, reopen_scope and actual money remain NOT IMPLEMENTED.
