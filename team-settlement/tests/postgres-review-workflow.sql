\set ON_ERROR_STOP on
-- Disposable CI only. Requires 001/002/003/004 and postgres-draft.sql.
DO $guard$
BEGIN
 IF has_function_privilege('team_smoke_guest',
     'kts_team.advance_review(text,text,date,text,text,bigint,text,text,text)','EXECUTE') THEN
   RAISE EXCEPTION 'TEAM_REVIEW_FUNCTION_PUBLIC_EXECUTE_LEAK';
 END IF;
END
$guard$;
GRANT EXECUTE ON FUNCTION kts_team.advance_review(text,text,date,text,text,bigint,text,text,text)
  TO team_smoke_writer;

INSERT INTO kts_team.workspaces(workspace_id,display_name) VALUES
 ('review_demo','Review synthetic CI');
INSERT INTO kts_team.identities(user_id,auth_subject) VALUES
 ('review_op','synthetic_review_op'),
 ('review_checker','synthetic_review_checker'),
 ('review_admin','synthetic_review_admin'),
 ('review_view','synthetic_review_view');
INSERT INTO kts_team.memberships(workspace_id,user_id,team_role) VALUES
 ('review_demo','review_op','operator'),
 ('review_demo','review_checker','reviewer'),
 ('review_demo','review_admin','admin'),
 ('review_demo','review_view','viewer');
INSERT INTO kts_team.counterparties(workspace_id,partner_id,partner_kind,display_name) VALUES
 ('review_demo','fake_partner_1','customer','Synthetic partner 1'),
 ('review_demo','fake_partner_2','customer','Synthetic partner 2');

SET ROLE team_smoke_writer;
BEGIN;
SELECT set_config('kts.workspace_id','review_demo',true);
SELECT set_config('kts.actor_user_id','review_op',true);
DO $body$
DECLARE
 v jsonb; repeat_v jsonb;
BEGIN
 v := kts_team.append_draft('review_demo','fake_partner_1','2026-10-14','mn',0,
   'review_draft_1','review_key_draft',repeat('a',64),'{"synthetic":true}'::jsonb);
 IF v->>'new_revision'<>'1' OR v->>'feed_seq'<>'1' THEN
   RAISE EXCEPTION 'TEAM_REVIEW_SEED_DRAFT_FAILED';
 END IF;
 v := kts_team.advance_review('review_demo','fake_partner_1','2026-10-14','mn',
   'submit_review',1,'review_submitted_1','review_key_submit',repeat('b',64));
 IF v->>'state'<>'PENDING_REVIEW' OR v->>'new_revision'<>'2' OR v->>'feed_seq'<>'2'
    OR v->>'replayed'<>'false' THEN
   RAISE EXCEPTION 'TEAM_REVIEW_SUBMIT_FAILED';
 END IF;
 repeat_v := kts_team.advance_review('review_demo','fake_partner_1','2026-10-14','mn',
   'submit_review',1,'event_unused','review_key_submit',repeat('b',64));
 IF repeat_v->>'event_id'<>'review_submitted_1' OR repeat_v->>'replayed'<>'true' OR
    repeat_v->>'new_revision'<>'2' THEN
   RAISE EXCEPTION 'TEAM_REVIEW_SUBMIT_REPLAY_MISMATCH';
 END IF;
END $body$;
COMMIT;
RESET ROLE;

SET ROLE team_smoke_writer;
BEGIN;
SELECT set_config('kts.workspace_id','review_demo',true);
SELECT set_config('kts.actor_user_id','review_checker',true);
DO $body$
DECLARE v jsonb; replay jsonb; denied boolean;
BEGIN
 v := kts_team.advance_review('review_demo','fake_partner_1','2026-10-14','mn',
   'approve_review',2,'review_approved_1','review_key_approve',repeat('c',64));
 IF v->>'state'<>'REVIEWED' OR v->>'new_revision'<>'3' OR v->>'feed_seq'<>'3' THEN
   RAISE EXCEPTION 'TEAM_REVIEW_APPROVE_FAILED';
 END IF;
 replay := kts_team.advance_review('review_demo','fake_partner_1','2026-10-14','mn',
   'approve_review',2,'event_unused','review_key_approve',repeat('c',64));
 IF replay->>'event_id'<>'review_approved_1' OR replay->>'replayed'<>'true' THEN
   RAISE EXCEPTION 'TEAM_REVIEW_APPROVE_REPLAY_FAILED';
 END IF;
 denied:=false;
 BEGIN
   PERFORM kts_team.advance_review('review_demo','fake_partner_1','2026-10-14','mn',
     'approve_review',2,'event_bad','review_key_approve',repeat('d',64));
 EXCEPTION WHEN others THEN
   IF SQLERRM='TEAM_IDEMPOTENCY_CONFLICT' THEN denied:=true; ELSE RAISE; END IF;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'TEAM_REVIEW_KEY_REUSE_ALLOWED'; END IF;
 denied:=false;
 BEGIN
   PERFORM kts_team.advance_review('review_demo','fake_partner_1','2026-10-14','mn',
     'close_scope',3,'event_close','review_key_close',repeat('e',64));
 EXCEPTION WHEN others THEN
   IF SQLERRM='TEAM_REVIEW_ACTION_FORBIDDEN' THEN denied:=true; ELSE RAISE; END IF;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'TEAM_REVIEW_CLOSE_ALLOWED'; END IF;
END $body$;
COMMIT;
RESET ROLE;

-- Role/cross-workspace, replay ownership, CAS and post-review immutability.
SET ROLE team_smoke_writer;
BEGIN;
SELECT set_config('kts.workspace_id','review_demo',true);
SELECT set_config('kts.actor_user_id','review_op',true);
DO $body$
DECLARE denied boolean;
BEGIN
 denied:=false;
 BEGIN
   PERFORM kts_team.advance_review('review_demo','fake_partner_1','2026-10-14','mn',
     'approve_review',3,'event_bad','review_key_operator',repeat('f',64));
 EXCEPTION WHEN others THEN
   IF SQLERRM='TEAM_ROLE_DENIED' THEN denied:=true; ELSE RAISE; END IF;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'TEAM_OPERATOR_APPROVE_ALLOWED'; END IF;
 denied:=false;
 BEGIN
   PERFORM kts_team.advance_review('review_demo','fake_partner_1','2026-10-14','mn',
     'submit_review',3,'event_bad','review_key_stale',repeat('f',64));
 EXCEPTION WHEN others THEN
   IF SQLERRM='TEAM_SUBMIT_REQUIRES_DRAFT' THEN denied:=true; ELSE RAISE; END IF;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'TEAM_REVIEWED_SCOPE_RESUBMITTED'; END IF;
 denied:=false;
 BEGIN
   PERFORM kts_team.append_draft('review_demo','fake_partner_1','2026-10-14','mn',3,
     'event_bad','review_key_edited',repeat('f',64),'{"synthetic":true}'::jsonb);
 EXCEPTION WHEN others THEN
   IF SQLERRM='TEAM_CLOSED_OR_PENDING_IMMUTABLE' THEN denied:=true; ELSE RAISE; END IF;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'TEAM_REVIEWED_SCOPE_EDITED'; END IF;
 denied:=false;
 BEGIN
   PERFORM kts_team.advance_review('group_a','fake_partner_1','2026-10-14','mn',
     'submit_review',1,'event_bad','review_key_cross',repeat('f',64));
 EXCEPTION WHEN others THEN
   IF SQLERRM='TEAM_WORKSPACE_DENIED' THEN denied:=true; ELSE RAISE; END IF;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'TEAM_REVIEW_CROSS_WORKSPACE_ALLOWED'; END IF;
END $body$;
COMMIT;
RESET ROLE;

-- Admin may submit a second scope, but admin cannot self-approve it.
SET ROLE team_smoke_writer;
BEGIN;
SELECT set_config('kts.workspace_id','review_demo',true);
SELECT set_config('kts.actor_user_id','review_admin',true);
DO $body$
DECLARE denied boolean:=false;
BEGIN
 PERFORM kts_team.append_draft('review_demo','fake_partner_2','2026-10-14','mt',0,
   'review_draft_2','review_key_draft_2',repeat('a',64),'{"synthetic":true}'::jsonb);
 PERFORM kts_team.advance_review('review_demo','fake_partner_2','2026-10-14','mt',
   'submit_review',1,'review_submitted_2','review_key_submit_2',repeat('b',64));
 BEGIN
   PERFORM kts_team.advance_review('review_demo','fake_partner_2','2026-10-14','mt',
     'approve_review',2,'event_bad','review_key_self',repeat('c',64));
 EXCEPTION WHEN others THEN
   IF SQLERRM='TEAM_SEPARATION_OF_DUTIES' THEN denied:=true; ELSE RAISE; END IF;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'TEAM_REVIEW_SELF_APPROVAL_ALLOWED'; END IF;
END $body$;
COMMIT;
RESET ROLE;

SET ROLE team_smoke_writer;
BEGIN;
SELECT set_config('kts.workspace_id','review_demo',true);
SELECT set_config('kts.actor_user_id','review_admin',true);
DO $body$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
  PERFORM kts_team.advance_review('review_demo','fake_partner_1','2026-10-14','mn',
    'approve_review',2,'event_other','review_key_approve',repeat('c',64));
 EXCEPTION WHEN others THEN
   IF SQLERRM='TEAM_IDEMPOTENCY_CONTEXT_MISMATCH' THEN denied:=true; ELSE RAISE; END IF;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'TEAM_REVIEW_OTHER_ACTOR_REPLAY_ALLOWED'; END IF;
END $body$;
COMMIT;
RESET ROLE;

DO $facts$
BEGIN
 IF (SELECT state FROM kts_team.scopes WHERE workspace_id='review_demo'
     AND partner_id='fake_partner_1')<>'REVIEWED' OR
    (SELECT submitted_by FROM kts_team.scopes WHERE workspace_id='review_demo'
     AND partner_id='fake_partner_1')<>'review_op' OR
    (SELECT reviewed_by FROM kts_team.scopes WHERE workspace_id='review_demo'
     AND partner_id='fake_partner_1')<>'review_checker' OR
    (SELECT revision FROM kts_team.scopes WHERE workspace_id='review_demo'
     AND partner_id='fake_partner_1')<>3 OR
    (SELECT count(*) FROM kts_team.scope_events WHERE workspace_id='review_demo'
     AND partner_id='fake_partner_1')<>3 OR
    (SELECT count(*) FROM kts_team.idempotency_receipts WHERE workspace_id='review_demo'
     AND idempotency_key IN ('review_key_submit','review_key_approve'))<>2 OR
    (SELECT feed_seq FROM kts_team.workspaces WHERE workspace_id='review_demo')<>5 THEN
   RAISE EXCEPTION 'TEAM_REVIEW_DURABLE_AUDIT_OR_CAS_MISMATCH';
 END IF;
 IF EXISTS(SELECT 1 FROM kts_team.scopes WHERE workspace_id='review_demo' AND state='CLOSED') THEN
   RAISE EXCEPTION 'TEAM_REVIEW_UNAUTHORIZED_FINALIZATION';
 END IF;
END $facts$;
\echo POSTGRES_TEAM_SYNTHETIC_REVIEW_WORKFLOW_PASS
