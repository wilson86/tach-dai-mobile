-- REVIEW-ONLY / NOT APPROVED / DO NOT EXECUTE ON ANY LIVE DATABASE.
-- Only a schema contract for independent key-owner threat modelling.
-- Intentionally ROLLBACK, not COMMIT: psql execution is not key provisioning.
-- No secrets, roles, superuser grants, default ACLs, or runtime activation here.
-- This is NOT a secure key management or key distribution implementation.
BEGIN;
DO $preflight$
BEGIN
  IF pg_catalog.to_regnamespace('kts_auth') IS NULL OR
     pg_catalog.to_regclass('kts_auth.receipt_v2_verifier_keys') IS NOT NULL
  THEN
    RAISE EXCEPTION 'TEAM_RECEIPT_V2_KEY_STORE_REVIEW_ONLY_OR_ALREADY_EXISTS';
  END IF;
END;
$preflight$;
CREATE TABLE kts_auth.receipt_v2_verifier_keys (
  key_id text PRIMARY KEY CHECK (key_id ~ '^[a-f0-9]{16}$'),
  secret_bytes bytea NOT NULL CHECK (pg_catalog.octet_length(secret_bytes)=32),
  activated_at timestamptz NOT NULL,
  stop_signing_at timestamptz NOT NULL,
  stop_verify_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (stop_signing_at > activated_at),
  CHECK (stop_verify_at >= stop_signing_at),
  CHECK (revoked_at IS NULL OR revoked_at >= activated_at)
);
-- PostgreSQL grants nothing to PUBLIC on new tables by default, but make
-- the intent explicit. The SECURITY DEFINER owner / key-store owner / Auth
-- login role split and default ACL require separate independent approval.
REVOKE ALL ON TABLE kts_auth.receipt_v2_verifier_keys FROM PUBLIC;
ROLLBACK;
