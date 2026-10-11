-- KTS Settlement Group M0 (DESIGN CANDIDATE). PostgreSQL 15+ syntax.
-- NEVER run against existing KTS Router DB. Do not deploy until security review.
-- All identifiers opaque. All financial amount math delegated to verified settlement engine.
-- Runtime role must NOT own these tables and must NOT have BYPASSRLS.
BEGIN;
CREATE SCHEMA IF NOT EXISTS kts_team;

CREATE TABLE IF NOT EXISTS kts_team.workspaces (
  workspace_id text PRIMARY KEY CHECK (workspace_id ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$'),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 160),
  feed_seq bigint NOT NULL DEFAULT 0 CHECK (feed_seq >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS kts_team.identities (
  user_id text PRIMARY KEY CHECK (user_id ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$'),
  auth_subject text NOT NULL UNIQUE CHECK (length(auth_subject) BETWEEN 1 AND 255),
  disabled_at timestamptz
);
CREATE TABLE IF NOT EXISTS kts_team.memberships (
  workspace_id text NOT NULL REFERENCES kts_team.workspaces(workspace_id),
  user_id text NOT NULL REFERENCES kts_team.identities(user_id),
  team_role text NOT NULL CHECK (team_role IN ('admin','operator','reviewer','viewer')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  PRIMARY KEY (workspace_id, user_id)
);
CREATE TABLE IF NOT EXISTS kts_team.counterparties (
  workspace_id text NOT NULL REFERENCES kts_team.workspaces(workspace_id),
  partner_id text NOT NULL CHECK (partner_id ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$'),
  partner_kind text NOT NULL CHECK (partner_kind IN ('customer','owner')),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 160),
  inactive_at timestamptz,
  PRIMARY KEY (workspace_id, partner_id)
);
CREATE TABLE IF NOT EXISTS kts_team.scopes (
  workspace_id text NOT NULL,
  partner_id text NOT NULL,
  business_date date NOT NULL,
  region text NOT NULL CHECK (region IN ('mn','mt','mb')),
  state text NOT NULL DEFAULT 'DRAFT'
    CHECK (state IN ('DRAFT','PENDING_REVIEW','REVIEWED','CLOSED','REOPEN_REQUESTED')),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  submitted_by text,
  reviewed_by text,
  verified_kqxs_sha256 text,
  locked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id,partner_id,business_date,region),
  FOREIGN KEY (workspace_id,partner_id) REFERENCES kts_team.counterparties(workspace_id,partner_id),
  FOREIGN KEY (workspace_id,submitted_by) REFERENCES kts_team.memberships(workspace_id,user_id),
  FOREIGN KEY (workspace_id,reviewed_by) REFERENCES kts_team.memberships(workspace_id,user_id),
  CHECK (verified_kqxs_sha256 IS NULL OR verified_kqxs_sha256 ~ '^[a-f0-9]{64}$'),
  CHECK (reviewed_by IS NULL OR submitted_by IS DISTINCT FROM reviewed_by),
  CHECK ((state NOT IN ('REVIEWED','CLOSED') OR reviewed_by IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS kts_team.scope_events (
  workspace_id text NOT NULL,
  event_id text NOT NULL CHECK (event_id ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$'),
  partner_id text NOT NULL,
  business_date date NOT NULL,
  region text NOT NULL,
  scope_revision bigint NOT NULL CHECK (scope_revision >= 0),
  -- Assigned while holding workspace row lock; commit-order-safe tenant feed.
  feed_seq bigint NOT NULL CHECK (feed_seq > 0),
  actor_user_id text NOT NULL,
  event_kind text NOT NULL CHECK (event_kind IN
    ('DRAFT_CREATED','DRAFT_CHANGED','SUBMITTED','REVIEWED','CLOSED','REOPEN_REQUESTED','REOPENED','CORRECTION')),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  result_snapshot jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id,event_id),
  UNIQUE (workspace_id,feed_seq),
  UNIQUE (workspace_id,partner_id,business_date,region,scope_revision),
  FOREIGN KEY (workspace_id,partner_id,business_date,region)
    REFERENCES kts_team.scopes(workspace_id,partner_id,business_date,region),
  FOREIGN KEY (workspace_id,actor_user_id)
    REFERENCES kts_team.memberships(workspace_id,user_id)
);
CREATE TABLE IF NOT EXISTS kts_team.idempotency_receipts (
  workspace_id text NOT NULL REFERENCES kts_team.workspaces(workspace_id),
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$'),
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[a-f0-9]{64}$'),
  event_id text NOT NULL,
  committed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id,idempotency_key),
  FOREIGN KEY (workspace_id,event_id) REFERENCES kts_team.scope_events(workspace_id,event_id)
);

-- PostgreSQL row-level security is an additional defense, NOT a substitute for
-- server-side authentication, membership checks and authorization checks.
-- Each request must begin a scoped DB transaction and SET LOCAL the verified tenant.
ALTER TABLE kts_team.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE kts_team.workspaces FORCE ROW LEVEL SECURITY;
CREATE POLICY team_workspaces_scope ON kts_team.workspaces
  USING (workspace_id = current_setting('kts.workspace_id', true))
  WITH CHECK (workspace_id = current_setting('kts.workspace_id', true));
ALTER TABLE kts_team.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE kts_team.memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY team_memberships_scope ON kts_team.memberships
  USING (workspace_id = current_setting('kts.workspace_id', true))
  WITH CHECK (workspace_id = current_setting('kts.workspace_id', true));
ALTER TABLE kts_team.counterparties ENABLE ROW LEVEL SECURITY;
ALTER TABLE kts_team.counterparties FORCE ROW LEVEL SECURITY;
CREATE POLICY team_counterparties_scope ON kts_team.counterparties
  USING (workspace_id = current_setting('kts.workspace_id', true))
  WITH CHECK (workspace_id = current_setting('kts.workspace_id', true));
ALTER TABLE kts_team.scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE kts_team.scopes FORCE ROW LEVEL SECURITY;
CREATE POLICY team_scopes_scope ON kts_team.scopes
  USING (workspace_id = current_setting('kts.workspace_id', true))
  WITH CHECK (workspace_id = current_setting('kts.workspace_id', true));
ALTER TABLE kts_team.scope_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE kts_team.scope_events FORCE ROW LEVEL SECURITY;
CREATE POLICY team_events_scope ON kts_team.scope_events
  USING (workspace_id = current_setting('kts.workspace_id', true))
  WITH CHECK (workspace_id = current_setting('kts.workspace_id', true));
ALTER TABLE kts_team.idempotency_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE kts_team.idempotency_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY team_receipts_scope ON kts_team.idempotency_receipts
  USING (workspace_id = current_setting('kts.workspace_id', true))
  WITH CHECK (workspace_id = current_setting('kts.workspace_id', true));

CREATE OR REPLACE FUNCTION kts_team.prevent_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'TEAM_AUDIT_APPEND_ONLY';
END;
$$;
CREATE TRIGGER team_scope_events_immutable
BEFORE UPDATE OR DELETE ON kts_team.scope_events
FOR EACH ROW EXECUTE FUNCTION kts_team.prevent_event_mutation();
CREATE TRIGGER team_receipts_immutable
BEFORE UPDATE OR DELETE ON kts_team.idempotency_receipts
FOR EACH ROW EXECUTE FUNCTION kts_team.prevent_event_mutation();
COMMIT;

-- Deployment note: avoid granting runtime role DDL, DELETE or BYPASSRLS.
-- Do not store login password or settlement customer messages in these tables.
