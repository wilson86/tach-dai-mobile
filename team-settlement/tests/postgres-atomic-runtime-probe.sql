\set ON_ERROR_STOP on
-- Synthetic ephemeral cluster only. These fixture grants are not deployment grants.
GRANT USAGE ON SCHEMA kts_auth,kts_team,kts_crypto TO kts_atomic_owner;
GRANT SELECT,UPDATE ON kts_auth.sessions TO kts_atomic_owner;
GRANT SELECT,UPDATE ON kts_team.memberships,kts_team.identities TO kts_atomic_owner;
GRANT SELECT,UPDATE ON kts_team.workspaces TO kts_atomic_owner;
GRANT SELECT ON kts_team.counterparties,kts_team.scope_events,kts_team.idempotency_receipts TO kts_atomic_owner;
GRANT SELECT,INSERT,UPDATE ON kts_team.scopes TO kts_atomic_owner;
GRANT INSERT ON kts_team.scope_events,kts_team.idempotency_receipts TO kts_atomic_owner;
GRANT EXECUTE ON FUNCTION kts_team.append_draft(text,text,date,text,bigint,text,text,text,jsonb) TO kts_atomic_owner;
GRANT EXECUTE ON FUNCTION kts_team.advance_review(text,text,date,text,text,bigint,text,text,text) TO kts_atomic_owner;
CREATE ROLE synthetic_atomic_caller NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT USAGE ON SCHEMA kts_team TO synthetic_atomic_caller;
GRANT EXECUTE ON FUNCTION kts_team.atomic_draft_v1(text,text,bigint,text,text,text,date,text,text,bigint,text,text,text,text) TO synthetic_atomic_caller;
GRANT EXECUTE ON FUNCTION kts_team.atomic_draft_reconcile_v1(text,text,bigint,text,text,text,date,text,text,bigint,text,text,text) TO synthetic_atomic_caller;
-- Test effective access under the actual restricted caller, not the superuser.
SET ROLE synthetic_atomic_caller;
SELECT set_config('kts.workspace_id','group_b',false);
SELECT set_config('kts.actor_user_id','user_2',false);
DO $$ DECLARE raw_denied boolean:=false; direct_denied boolean:=false; owner_denied boolean:=false; BEGIN
 IF pg_has_role(current_user,'kts_atomic_owner','MEMBER') OR
    has_schema_privilege(current_user,'kts_team','CREATE') OR
    has_function_privilege(current_user,'kts_team.append_draft(text,text,date,text,bigint,text,text,text,jsonb)','EXECUTE') OR
    has_function_privilege(current_user,'kts_team.advance_review(text,text,date,text,text,bigint,text,text,text)','EXECUTE') THEN
   RAISE EXCEPTION 'PROBE_CALLER_EFFECTIVE_PRIVILEGE_ESCALATION';
 END IF;
 BEGIN
  PERFORM kts_team.append_draft('group_b','customer_1','2026-10-12','mn',1,'forged_event','forged_key',repeat('f',64),'{}'::jsonb);
 EXCEPTION WHEN insufficient_privilege THEN raw_denied:=true; END;
 BEGIN
  UPDATE kts_team.scopes SET revision=99 WHERE workspace_id='group_b';
 EXCEPTION WHEN insufficient_privilege THEN direct_denied:=true; END;
 BEGIN
  EXECUTE 'SET ROLE kts_atomic_owner';
 EXCEPTION WHEN insufficient_privilege THEN owner_denied:=true; END;
 IF NOT raw_denied OR NOT direct_denied OR NOT owner_denied THEN
  RAISE EXCEPTION 'PROBE_CALLER_ACCESS_NOT_DENIED raw=% direct=% owner=%',raw_denied,direct_denied,owner_denied;
 END IF;
END $$;
RESET ROLE;
\echo SYNTHETIC_CALLER_RAW_WRITE_AND_OWNER_DENIAL_PASS
INSERT INTO kts_auth.sessions(session_hash,user_id,workspace_id,issued_at,expires_at)
 VALUES(repeat('a',64),'user_1','group_a',clock_timestamp(),clock_timestamp()+interval '10 minutes');
-- Fixed material is deliberately synthetic. Generate a request-bound proof using the same SQL contract.
SELECT encode(sha256(convert_to(repeat('a',64),'UTF8')),'hex') AS sid,
       floor(extract(epoch from clock_timestamp()))::bigint+55 AS expires \gset
SELECT encode(kts_crypto.hmac(convert_to(concat_ws('|','kts-draft-v1',:'sid','group_a','customer_1','2026-10-12','mn','edit_draft','1','probe_event','probe_key',repeat('c',64),encode(sha256(convert_to('{"synthetic":true}','UTF8')),'hex'),repeat('1',32),:'expires'),'UTF8'),decode(repeat('a',64),'hex'),'sha256'),'hex') AS proof \gset
SELECT encode(kts_crypto.hmac(convert_to(concat_ws('|','kts-draft-lookup-v1',:'sid','group_a','customer_1','2026-10-12','mn','edit_draft','1','lookup','probe_key',repeat('c',64),encode(sha256(convert_to('{"synthetic":true}','UTF8')),'hex'),repeat('2',32),:'expires'),'UTF8'),decode(repeat('a',64),'hex'),'sha256'),'hex') AS lookup_proof \gset
CREATE TEMP TABLE atomic_probe_result(result jsonb);
CREATE TEMP TABLE atomic_probe_args(sid text,expires bigint,proof text,lookup_proof text);
INSERT INTO atomic_probe_args VALUES (:'sid',:'expires',:'proof',:'lookup_proof');
CREATE TEMP TABLE atomic_probe_cases AS
 SELECT v.label,v.nonce,v.event_id,v.key_id,v.digest,
   encode(kts_crypto.hmac(convert_to(concat_ws('|',v.domain,:'sid','group_a','customer_1',
    '2026-10-12','mn','edit_draft','1',v.event_id,v.key_id,v.digest,
    encode(sha256(convert_to('{"synthetic":true}','UTF8')),'hex'),v.nonce,:'expires'),'UTF8'),
    decode(repeat('a',64),'hex'),'sha256'),'hex') AS proof
 FROM (VALUES
  ('idempotent',repeat('3',32),'probe_event','probe_key',repeat('c',64),'kts-draft-v1'),
  ('stale_cas',repeat('4',32),'stale_event','stale_key',repeat('d',64),'kts-draft-v1'),
  ('missing_receipt',repeat('5',32),'lookup','missing_key',repeat('c',64),'kts-draft-lookup-v1'),
  ('mismatch_receipt',repeat('6',32),'lookup','probe_key',repeat('d',64),'kts-draft-lookup-v1')
 ) v(label,nonce,event_id,key_id,digest,domain);
GRANT ALL ON atomic_probe_result TO synthetic_atomic_caller;
GRANT SELECT ON atomic_probe_args TO synthetic_atomic_caller;
GRANT SELECT ON atomic_probe_cases TO synthetic_atomic_caller;
SET ROLE synthetic_atomic_caller;
SELECT set_config('kts.workspace_id','group_b',false);
SELECT set_config('kts.actor_user_id','user_2',false);
INSERT INTO atomic_probe_result SELECT kts_team.atomic_draft_v1(:'sid',repeat('1',32),:'expires'::bigint,:'proof','group_a','customer_1','2026-10-12','mn','edit_draft',1,'probe_event','probe_key',repeat('c',64),'{"synthetic":true}');
DO $$ BEGIN IF (SELECT result->>'new_revision' FROM atomic_probe_result)<>'2' THEN RAISE EXCEPTION 'PROBE_REVISION'; END IF; END $$;
DO $$ DECLARE a record; denied boolean:=false; result jsonb; BEGIN
 SELECT * INTO a FROM atomic_probe_args;
 BEGIN
  PERFORM kts_team.atomic_draft_v1(a.sid,repeat('1',32),a.expires,a.proof,'group_a','customer_1','2026-10-12','mn','edit_draft',1,'probe_event','probe_key',repeat('c',64),'{"synthetic":true}');
 EXCEPTION WHEN unique_violation THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'PROBE_NONCE_REPLAY_ACCEPTED'; END IF;
 result:=kts_team.atomic_draft_reconcile_v1(a.sid,repeat('2',32),a.expires,a.lookup_proof,'group_a','customer_1','2026-10-12','mn','edit_draft',1,'probe_key',repeat('c',64),'{"synthetic":true}');
 IF result->>'classification'<>'MATCHED_SERVER_RECEIPT' OR result->>'event_id'<>'probe_event' THEN RAISE EXCEPTION 'PROBE_RECONCILIATION'; END IF;
END $$;
DO $$ DECLARE a record; c record; result jsonb; denied boolean:=false; BEGIN
 SELECT * INTO a FROM atomic_probe_args;
 SELECT * INTO c FROM atomic_probe_cases WHERE label='idempotent';
 result:=kts_team.atomic_draft_v1(a.sid,c.nonce,a.expires,c.proof,'group_a','customer_1','2026-10-12','mn','edit_draft',1,c.event_id,c.key_id,c.digest,'{"synthetic":true}');
 IF result->>'replayed'<>'true' OR result->>'event_id'<>'probe_event' THEN RAISE EXCEPTION 'PROBE_IDEMPOTENCY'; END IF;
 SELECT * INTO c FROM atomic_probe_cases WHERE label='stale_cas';
 BEGIN
  PERFORM kts_team.atomic_draft_v1(a.sid,c.nonce,a.expires,c.proof,'group_a','customer_1','2026-10-12','mn','edit_draft',1,c.event_id,c.key_id,c.digest,'{"synthetic":true}');
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='TEAM_REVISION_CONFLICT' THEN denied:=true; ELSE RAISE; END IF; END;
 IF NOT denied THEN RAISE EXCEPTION 'PROBE_STALE_CAS_ACCEPTED'; END IF;
 FOR c IN SELECT * FROM atomic_probe_cases WHERE label IN ('missing_receipt','mismatch_receipt') LOOP
  result:=kts_team.atomic_draft_reconcile_v1(a.sid,c.nonce,a.expires,c.proof,'group_a','customer_1','2026-10-12','mn','edit_draft',1,c.key_id,c.digest,'{"synthetic":true}');
  IF result->>'classification'<>'UNKNOWN' THEN RAISE EXCEPTION 'PROBE_FALSE_RECEIPT_MATCH'; END IF;
 END LOOP;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM kts_team.scope_events WHERE workspace_id='group_a' AND event_id='probe_event' AND actor_user_id='user_1') THEN RAISE EXCEPTION 'PROBE_ACTOR_OR_WORKSPACE'; END IF;
 IF (SELECT count(*) FROM kts_team.idempotency_receipts WHERE workspace_id='group_a' AND idempotency_key='probe_key')<>1 THEN RAISE EXCEPTION 'PROBE_RECEIPT_COUNT'; END IF;
END $$;
UPDATE kts_auth.sessions SET revoked_at=clock_timestamp() WHERE session_hash=repeat('a',64);
SET ROLE synthetic_atomic_caller;
DO $$ DECLARE a record; denied boolean:=false; BEGIN
 SELECT * INTO a FROM atomic_probe_args;
 BEGIN
  PERFORM kts_team.atomic_draft_reconcile_v1(a.sid,repeat('2',32),a.expires,a.lookup_proof,'group_a','customer_1','2026-10-12','mn','edit_draft',1,'probe_key',repeat('c',64),'{"synthetic":true}');
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='TEAM_ATOMIC_SESSION_INVALID' THEN denied:=true; ELSE RAISE; END IF; END;
 IF NOT denied THEN RAISE EXCEPTION 'PROBE_REVOKED_SESSION_ACCEPTED'; END IF;
END $$;
RESET ROLE;
\echo SYNTHETIC_ATOMIC_DRAFT_SESSION_AND_GUC_PASS
\echo SYNTHETIC_NONCE_REPLAY_AND_RECEIPT_LOOKUP_PASS
\echo SYNTHETIC_CAS_IDEMPOTENCY_REVOKED_AND_UNKNOWN_PASS
