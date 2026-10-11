-- KTS Settlement M1 synthetic auth persistence candidate. PostgreSQL 15+.
-- NEVER run against KTS Router or an unreviewed live database.
-- Store only password verifier material and one-way session hashes; never raw
-- passwords or bearer tokens. The API must verify credentials and membership
-- in its own transaction before inserting a session.
BEGIN;
CREATE SCHEMA IF NOT EXISTS kts_auth;

CREATE TABLE IF NOT EXISTS kts_auth.credentials (
  user_id text PRIMARY KEY REFERENCES kts_team.identities(user_id),
  password_hash text NOT NULL CHECK (
    length(password_hash) BETWEEN 32 AND 512 AND password_hash LIKE 'scrypt-v1$%'
  ),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kts_auth.sessions (
  session_hash text PRIMARY KEY CHECK (session_hash ~ '^[a-f0-9]{64}$'),
  user_id text NOT NULL REFERENCES kts_team.identities(user_id),
  workspace_id text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  FOREIGN KEY (workspace_id,user_id)
    REFERENCES kts_team.memberships(workspace_id,user_id),
  CHECK (expires_at > issued_at),
  CHECK (revoked_at IS NULL OR revoked_at >= issued_at)
);

CREATE INDEX IF NOT EXISTS auth_sessions_user_idx
  ON kts_auth.sessions(user_id,workspace_id,expires_at);
CREATE INDEX IF NOT EXISTS auth_sessions_active_idx
  ON kts_auth.sessions(session_hash,expires_at)
  WHERE revoked_at IS NULL;

-- No unauthenticated SQL client may inspect credential or session material.
-- Deployment must grant narrowly to a non-owner auth API role after review.
REVOKE ALL ON SCHEMA kts_auth FROM PUBLIC;
REVOKE ALL ON kts_auth.credentials,kts_auth.sessions FROM PUBLIC;
COMMIT;
