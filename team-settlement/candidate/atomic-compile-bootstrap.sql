\set ON_ERROR_STOP on
-- SYNTHETIC NEW POSTGRESQL ONLY: This is not a production migration.
-- The owned scratch PGDATA is created and supervised by the C-only QA runner.
-- No runtime grant, no connection to an existing database or KTS Router.
BEGIN;
CREATE ROLE kts_atomic_owner NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE SCHEMA kts_crypto;
REVOKE ALL ON SCHEMA kts_crypto FROM PUBLIC;
CREATE EXTENSION pgcrypto WITH SCHEMA kts_crypto;
-- Extension's owner must be the synthetic bootstrap superuser.
DO $qa$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_extension e
    JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace
    JOIN pg_catalog.pg_roles r ON r.oid=e.extowner
    WHERE e.extname='pgcrypto' AND n.nspname='kts_crypto' AND r.rolsuper
  ) THEN
    RAISE EXCEPTION 'SYNTHETIC_PGCRYPTO_OWNER_INVALID';
  END IF;
END;
$qa$;
COMMIT;
\echo SYNTHETIC_ATOMIC_PREREQUISITES_READY
