#!/usr/bin/env bash
set -euo pipefail
# Disposable GitHub Actions PostgreSQL container ONLY, after SQL test fixtures.
# This script MUST NOT run against production, Router DB, or an external host.
if [[ "${PGDATABASE:-}" != "team_contract_test" ||
      "${PGUSER:-}" != "postgres" ||
      "${PGHOST:-}" != "localhost" ||
      "${PGPORT:-}" != "5432" ||
      "${GITHUB_ACTIONS:-}" != "true" ]]; then
  echo "TEAM_CI_ISOLATED_DB_REQUIRED" >&2
  exit 1
fi
AUTH_PASSWORD="$(openssl rand -hex 24)"
LEDGER_PASSWORD="$(openssl rand -hex 24)"
# Generated random credentials stay inside this step and are never printed.
psql -X -v ON_ERROR_STOP=1 -q -c "CREATE ROLE team_ci_auth_login LOGIN IN ROLE team_auth_candidate PASSWORD '${AUTH_PASSWORD}'"
psql -X -v ON_ERROR_STOP=1 -q -c "CREATE ROLE team_ci_ledger_login LOGIN IN ROLE team_smoke_writer PASSWORD '${LEDGER_PASSWORD}'"
env PGUSER=team_ci_auth_login PGPASSWORD="${AUTH_PASSWORD}" \
  psql -X -h 127.0.0.1 -v ON_ERROR_STOP=1 -q -f team-settlement/tests/postgres-ci-auth-tcp.sql
env PGUSER=team_ci_ledger_login PGPASSWORD="${LEDGER_PASSWORD}" \
  psql -X -h 127.0.0.1 -v ON_ERROR_STOP=1 -q -f team-settlement/tests/postgres-ci-ledger-tcp.sql
# A fresh financial draft is committed over a distinct authenticated TCP
# session. A SECOND TCP session replays that idempotency key and proves the
# immutable persisted revision/event/feed without making another write.
psql -X -v ON_ERROR_STOP=1 -q -c \
  "INSERT INTO kts_team.counterparties(workspace_id,partner_id,partner_kind,display_name) VALUES ('group_a','tcp_ci_partner','customer','Synthetic TCP Partner')"
env PGUSER=team_ci_ledger_login PGPASSWORD="${LEDGER_PASSWORD}" \
  psql -X -h 127.0.0.1 -v ON_ERROR_STOP=1 -q -f team-settlement/tests/postgres-ci-durable-first.sql
env PGUSER=team_ci_ledger_login PGPASSWORD="${LEDGER_PASSWORD}" \
  psql -X -h 127.0.0.1 -v ON_ERROR_STOP=1 -q -f team-settlement/tests/postgres-ci-durable-replay.sql
echo "POSTGRES_CI_DISTINCT_CREDENTIALED_TCP_ROLE_PROOF_PASS"
