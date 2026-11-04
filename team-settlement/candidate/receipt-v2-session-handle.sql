-- REVIEW-ONLY, NEVER deploy automatically. PostgreSQL16 synthetic scratch only
-- after explicit independent owner/crypto/session design approval.
-- Existing sessions retain NULL and may NOT use V2. No backfill from bearer.
BEGIN;
ALTER TABLE kts_auth.sessions ADD COLUMN session_handle text;
ALTER TABLE kts_auth.sessions
  ADD CONSTRAINT receipt_v2_session_handle_hex
  CHECK (session_handle IS NULL OR session_handle ~ '^[a-f0-9]{32}$');
CREATE UNIQUE INDEX receipt_v2_session_handle_unique
  ON kts_auth.sessions(session_handle) WHERE session_handle IS NOT NULL;
-- No public EXECUTE, Ledger SELECT, or session-handle exposure is granted.
COMMIT;
