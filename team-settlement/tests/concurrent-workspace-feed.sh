#!/usr/bin/env bash
set -euo pipefail
# Disposable PostgreSQL only. Two distinct financial scopes race in one workspace.
# Serialized workspace-row feed sequence must survive COMMIT ordering.
psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO kts_team.counterparties(workspace_id,partner_id,partner_kind,display_name)
VALUES ('group_a','customer_2','customer','Synthetic A2');
INSERT INTO kts_team.scopes(workspace_id,partner_id,business_date,region,state,revision,submitted_by)
VALUES ('group_a','customer_2','2026-10-12','mt','DRAFT',0,'user_1');
SQL
temp="$(mktemp -d)"
trap 'rm -rf "$temp"' EXIT

for i in 1 2; do
  if [[ "$i" == "1" ]]; then
    p=customer_1; region=mn; rev=3
  else
    p=customer_2; region=mt; rev=0
  fi
  (
    psql -X -q -v ON_ERROR_STOP=1 >"$temp/$i.log" 2>&1 <<SQL
BEGIN;
SET ROLE team_smoke_writer;
SELECT set_config('kts.workspace_id','group_a',true);
SELECT set_config('kts.actor_user_id','user_1',true);
SELECT kts_team.append_draft(
 'group_a','$p','2026-10-12','$region',$rev,
 'parallel_event_$i','parallel_key_$i',repeat('f',64),'{"synthetic":true}'::jsonb
);
COMMIT;
SQL
  ) &
  echo "$! $i" >>"$temp/pids"
done

while read -r pid i; do
  if ! wait "$pid"; then
    echo "PARALLEL_SCOPE_TRANSACTION_FAILED:$i"
    sed -E 's/(PASSWORD|TOKEN|BEARER).*/REDACTED/' "$temp/$i.log" | tail -10
    exit 1
  fi
done <"$temp/pids"

# There were 3 previous group_a events. The new two MUST be feed 4,5,
# independent of transaction start timestamps or eventual event IDs.
facts="$(psql -X -A -t -F : -v ON_ERROR_STOP=1 -c "SELECT
 (SELECT feed_seq FROM kts_team.workspaces WHERE workspace_id='group_a'),
 (SELECT count(*) FROM kts_team.scope_events WHERE workspace_id='group_a'),
 (SELECT count(DISTINCT feed_seq) FROM kts_team.scope_events WHERE workspace_id='group_a'),
 (SELECT string_agg(feed_seq::text,',' ORDER BY feed_seq)
    FROM kts_team.scope_events WHERE workspace_id='group_a');")"
if [[ "$facts" != "5:5:5:1,2,3,4,5" ]]; then
  echo "TEAM_WORKSPACE_FEED_SEQUENCE_FAILED"
  exit 1
fi
echo "POSTGRES_CROSS_SCOPE_COMMIT_ORDER_FEED_PASS"
