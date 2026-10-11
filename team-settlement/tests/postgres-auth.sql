\set ON_ERROR_STOP on
-- Synthetic-only auth persistence smoke test. Runs after 001 + 002 + 003.
-- The test uses verifier material and a one-way token hash, never raw secrets.
INSERT INTO kts_auth.credentials(user_id,password_hash)
VALUES ('user_1','scrypt-v1$16384,8,1$synthetic-salt-123456$synthetic-verifier-1234567890');

INSERT INTO kts_auth.sessions(session_hash,user_id,workspace_id,issued_at,expires_at)
VALUES (repeat('a',64),'user_1','group_a','2026-10-12 10:00:00+07','2026-10-12 18:00:00+07');

DO $$
BEGIN
  IF has_table_privilege('public','kts_auth.credentials','SELECT') THEN
    RAISE EXCEPTION 'AUTH_CREDENTIAL_PUBLIC_READ_LEAK';
  END IF;
  IF has_table_privilege('public','kts_auth.sessions','SELECT') THEN
    RAISE EXCEPTION 'AUTH_SESSION_PUBLIC_READ_LEAK';
  END IF;
  IF (SELECT count(*) FROM kts_auth.sessions WHERE session_hash=repeat('a',64)) <> 1 THEN
    RAISE EXCEPTION 'AUTH_SESSION_INSERT_FAILED';
  END IF;
  IF (SELECT count(*) FROM kts_auth.sessions WHERE session_hash LIKE '%synthetic-token%') <> 0 THEN
    RAISE EXCEPTION 'AUTH_RAW_TOKEN_PERSISTED';
  END IF;
END
$$;

UPDATE kts_auth.sessions SET revoked_at='2026-10-12 11:00:00+07'
WHERE session_hash=repeat('a',64);
DO $$
BEGIN
  IF (SELECT revoked_at IS NULL FROM kts_auth.sessions WHERE session_hash=repeat('a',64)) THEN
    RAISE EXCEPTION 'AUTH_SESSION_REVOCATION_FAILED';
  END IF;
END
$$;

\echo POSTGRES_M1_AUTH_SESSION_PERSISTENCE_PASS
