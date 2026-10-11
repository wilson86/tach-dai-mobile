#!/usr/bin/env bash
set -euo pipefail
# Synthetic, disposable PG only. All 30 attempts deliberately race the same revision.
dir="$(mktemp -d)"
trap 'rm -rf "$dir"' EXIT
for i in $(seq 1 30); do
  (
    psql -X -q -v ON_ERROR_STOP=1 >"$dir/$i.log" 2>&1 <<SQL
BEGIN;
SET ROLE team_smoke_writer;
SELECT set_config('kts.workspace_id','group_a',true);
SELECT set_config('kts.actor_user_id','user_1',true);
SELECT kts_team.append_draft(
  'group_a','customer_1','2026-10-12','mn',2,
  'event_race_$i','req_race_$i',repeat('e',64),'{"synthetic":true}'::jsonb
);
COMMIT;
SQL
  ) &
  echo "$! $i" >>"$dir/pids"
done

ok=0
conflicts=0
other=0
while read -r pid i; do
  if wait "$pid"; then
    ok=$((ok+1))
  elif grep -q 'TEAM_REVISION_CONFLICT' "$dir/$i.log"; then
    conflicts=$((conflicts+1))
  else
    other=$((other+1))
  fi
done <"$dir/pids"
echo "SYNTHETIC_30_CLIENTS_COMMITTED=$ok"
echo "SYNTHETIC_30_CLIENTS_CONFLICTS=$conflicts"
echo "SYNTHETIC_30_CLIENTS_OTHER_ERRORS=$other"
if [[ "$ok" != "1" || "$conflicts" != "29" || "$other" != "0" ]]; then
  echo "TEAM_CONCURRENT_CAS_FAILED"
  exit 1
fi
facts="$(psql -X -A -t -F : -v ON_ERROR_STOP=1 -c "SELECT
 (SELECT revision FROM kts_team.scopes WHERE workspace_id='group_a' AND partner_id='customer_1'
 AND business_date='2026-10-12' AND region='mn'),
 (SELECT count(*) FROM kts_team.scope_events WHERE workspace_id='group_a'),
 (SELECT count(*) FROM kts_team.idempotency_receipts WHERE workspace_id='group_a'),
 (SELECT feed_seq FROM kts_team.workspaces WHERE workspace_id='group_a');")"
if [[ "$facts" != "3:3:3:3" ]]; then
  echo "TEAM_CONCURRENT_LEDGER_COUNTS_FAILED"
  exit 1
fi
echo "POSTGRES_30_CLIENT_SYNTHETIC_CAS_PASS"
