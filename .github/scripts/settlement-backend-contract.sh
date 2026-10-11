#!/usr/bin/env bash
# Synthetic, non-mutating test API contract gate shared by PR and Pages.
# Abort if somebody redirects qualification traffic to another environment.
: "${SETTLEMENT_API_BASE:?SETTLEMENT_API_BASE_REQUIRED}"
: "${ALLOWED_ORIGIN:?ALLOWED_ORIGIN_REQUIRED}"
if [[ "$SETTLEMENT_API_BASE" != "https://kts-settlement-api-test.onrender.com" ]]; then
  echo "REFUSE_NON_TEST_BACKEND" >&2
  exit 1
fi
if [[ "$ALLOWED_ORIGIN" != "https://wilson86.github.io" ]]; then
  echo "REFUSE_UNTRUSTED_TEST_ORIGIN" >&2
  exit 1
fi
set -euo pipefail
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

curl_common=(
  --fail --silent --show-error --location
  --retry 4 --retry-delay 2 --retry-all-errors
  --connect-timeout 10 --max-time 40
)

curl "${curl_common[@]}" \
  -D "$tmp/health.headers" \
  -H "Origin: ${ALLOWED_ORIGIN}" \
  "${SETTLEMENT_API_BASE}/health" \
  -o "$tmp/health.json"

python3 - "$tmp/health.json" <<'PY'
import json, sys
p=json.load(open(sys.argv[1],encoding='utf-8'))
assert p.get('ok') is True, p
assert p.get('service')=='kts-settlement-api', p
assert p.get('kqxs_provider_mode')=='dual-public-web', p
assert p.get('kqxs_cross_source_verification') is True, p
assert p.get('parser_identity_path')=='/api/settlement/parser-identity', p
PY

cors="$(awk 'BEGIN{IGNORECASE=1}/^Access-Control-Allow-Origin:/{sub(/^[^:]+:[[:space:]]*/,"");gsub("\r","");print;exit}' "$tmp/health.headers")"
if [ "$cors" != "$ALLOWED_ORIGIN" ]; then
  echo "BACKEND_CORS_HEALTH_MISMATCH expected=$ALLOWED_ORIGIN actual=$cors" >&2
  exit 1
fi

status="$(curl --silent --show-error \
  --retry 4 --retry-delay 2 --retry-all-errors \
  --connect-timeout 10 --max-time 40 \
  -o /dev/null -D "$tmp/options.headers" -w '%{http_code}' \
  -X OPTIONS \
  -H "Origin: ${ALLOWED_ORIGIN}" \
  -H 'Access-Control-Request-Method: POST' \
  "${SETTLEMENT_API_BASE}/api/settlement/parse")"
if [ "$status" != "204" ]; then
  echo "BACKEND_CORS_PREFLIGHT_STATUS=$status" >&2
  exit 1
fi

cors="$(awk 'BEGIN{IGNORECASE=1}/^Access-Control-Allow-Origin:/{sub(/^[^:]+:[[:space:]]*/,"");gsub("\r","");print;exit}' "$tmp/options.headers")"
if [ "$cors" != "$ALLOWED_ORIGIN" ]; then
  echo "BACKEND_CORS_PREFLIGHT_MISMATCH expected=$ALLOWED_ORIGIN actual=$cors" >&2
  exit 1
fi

curl "${curl_common[@]}" \
  -D "$tmp/identity.headers" \
  -H "Origin: ${ALLOWED_ORIGIN}" \
  "${SETTLEMENT_API_BASE}/api/settlement/parser-identity" \
  -o "$tmp/identity.json"

python3 - "$tmp/identity.json" <<'PY'
import json, re, sys
p=json.load(open(sys.argv[1],encoding='utf-8'))
assert p.get('ok') is True, p
assert p.get('identity_contract')=='kts-parser-identity-v1', p
ids=p.get('identities') or {}
for key in ('mb','mn_mt'):
    row=ids.get(key) or {}
    value=str(row.get('identity_sha256') or '')
    assert re.fullmatch(r'[0-9a-f]{64}',value), (key,row)
PY

cors="$(awk 'BEGIN{IGNORECASE=1}/^Access-Control-Allow-Origin:/{sub(/^[^:]+:[[:space:]]*/,"");gsub("\r","");print;exit}' "$tmp/identity.headers")"
if [ "$cors" != "$ALLOWED_ORIGIN" ]; then
  echo "BACKEND_CORS_IDENTITY_MISMATCH expected=$ALLOWED_ORIGIN actual=$cors" >&2
  exit 1
fi

curl "${curl_common[@]}" \
  -D "$tmp/parse.headers" \
  -H "Origin: ${ALLOWED_ORIGIN}" \
  -H 'Content-Type: application/json' \
  --data '{"region":"mb","raw_text":"92 61 da 1n"}' \
  "${SETTLEMENT_API_BASE}/api/settlement/parse" \
  -o "$tmp/parse.json"

python3 - "$tmp/parse.json" <<'PY'
import json, re, sys
p=json.load(open(sys.argv[1],encoding='utf-8'))
canonical=p.get('canonical_payload') or {}
legs=canonical.get('legs') or []
assert legs and legs[0].get('code')=='DAT', p
identity=canonical.get('parser_identity') or {}
assert re.fullmatch(r'[0-9a-f]{64}',str(identity.get('identity_sha256') or '')), identity
PY

cors="$(awk 'BEGIN{IGNORECASE=1}/^Access-Control-Allow-Origin:/{sub(/^[^:]+:[[:space:]]*/,"");gsub("\r","");print;exit}' "$tmp/parse.headers")"
cache_control="$(awk 'BEGIN{IGNORECASE=1}/^Cache-Control:/{sub(/^[^:]+:[[:space:]]*/,"");gsub("\r","");print;exit}' "$tmp/parse.headers")"
if [ "$cors" != "$ALLOWED_ORIGIN" ]; then
  echo "BACKEND_CORS_PARSE_MISMATCH expected=$ALLOWED_ORIGIN actual=$cors" >&2
  exit 1
fi
if [ "$cache_control" != "no-store" ]; then
  echo "BACKEND_PARSE_CACHE_CONTROL_MISMATCH actual=$cache_control" >&2
  exit 1
fi

status="$(curl --silent --show-error \
  --retry 4 --retry-delay 2 --retry-all-errors \
  --connect-timeout 10 --max-time 40 \
  -o /dev/null -D "$tmp/kqxs-options.headers" -w '%{http_code}' \
  -X OPTIONS \
  -H "Origin: ${ALLOWED_ORIGIN}" \
  -H 'Access-Control-Request-Method: GET' \
  "${SETTLEMENT_API_BASE}/api/kqxs")"
if [ "$status" != "204" ]; then
  echo "BACKEND_KQXS_CORS_PREFLIGHT_STATUS=$status" >&2
  exit 1
fi

cors="$(awk 'BEGIN{IGNORECASE=1}/^Access-Control-Allow-Origin:/{sub(/^[^:]+:[[:space:]]*/,"");gsub("\r","");print;exit}' "$tmp/kqxs-options.headers")"
if [ "$cors" != "$ALLOWED_ORIGIN" ]; then
  echo "BACKEND_KQXS_CORS_PREFLIGHT_MISMATCH expected=$ALLOWED_ORIGIN actual=$cors" >&2
  exit 1
fi

curl "${curl_common[@]}" \
  -D "$tmp/parse-mn.headers" \
  -H "Origin: ${ALLOWED_ORIGIN}" \
  -H 'Content-Type: application/json' \
  --data '{"region":"mn","business_date":"2026-10-04","raw_text":"tg 75 b 1n"}' \
  "${SETTLEMENT_API_BASE}/api/settlement/parse" \
  -o "$tmp/parse-mn.json"

python3 - "$tmp/parse-mn.json" <<'PY'
import json, sys
p=json.load(open(sys.argv[1],encoding='utf-8'))
canonical=p.get('canonical_payload') or {}
assert canonical.get('region')=='mn', p
legs=canonical.get('legs') or []
assert legs, p
assert list(legs[0].get('station_codes') or [])==['tg'], p
PY

status="$(curl --silent --show-error \
  --connect-timeout 10 --max-time 40 \
  -o "$tmp/parse-mn-missing-date.json" -D "$tmp/parse-mn-missing-date.headers" -w '%{http_code}' \
  -H "Origin: ${ALLOWED_ORIGIN}" \
  -H 'Content-Type: application/json' \
  --data '{"region":"mn","raw_text":"tg 75 b 1n"}' \
  "${SETTLEMENT_API_BASE}/api/settlement/parse")"
if [ "$status" != "400" ]; then
  echo "BACKEND_MN_MISSING_DATE_STATUS=$status" >&2
  exit 1
fi
python3 - "$tmp/parse-mn-missing-date.json" <<'PY'
import json, sys
p=json.load(open(sys.argv[1],encoding='utf-8'))
assert p.get('error')=='BUSINESS_DATE_REQUIRED', p
PY

status="$(curl --silent --show-error \
  --connect-timeout 10 --max-time 40 \
  -o "$tmp/kqxs-invalid-date.json" -w '%{http_code}' \
  -H "Origin: ${ALLOWED_ORIGIN}" \
  "${SETTLEMENT_API_BASE}/api/kqxs?date=nope&region=mb")"
if [ "$status" != "400" ]; then
  echo "BACKEND_KQXS_INVALID_DATE_STATUS=$status" >&2
  exit 1
fi
python3 - "$tmp/kqxs-invalid-date.json" <<'PY'
import json, sys
p=json.load(open(sys.argv[1],encoding='utf-8'))
assert p.get('error')=='KQXS_DATE_REQUIRED', p
PY

status="$(curl --silent --show-error \
  --connect-timeout 10 --max-time 40 \
  -o "$tmp/kqxs-invalid-region.json" -w '%{http_code}' \
  -H "Origin: ${ALLOWED_ORIGIN}" \
  "${SETTLEMENT_API_BASE}/api/kqxs?date=2026-09-22&region=xx")"
if [ "$status" != "400" ]; then
  echo "BACKEND_KQXS_INVALID_REGION_STATUS=$status" >&2
  exit 1
fi
python3 - "$tmp/kqxs-invalid-region.json" <<'PY'
import json, sys
p=json.load(open(sys.argv[1],encoding='utf-8'))
assert p.get('error')=='KQXS_REGION_REQUIRED', p
PY

curl --silent --show-error \
  --connect-timeout 10 --max-time 40 \
  -D "$tmp/wrong-origin.headers" \
  -H 'Origin: https://example.invalid' \
  "${SETTLEMENT_API_BASE}/health" \
  -o /dev/null
wrong_cors="$(awk 'BEGIN{IGNORECASE=1}/^Access-Control-Allow-Origin:/{sub(/^[^:]+:[[:space:]]*/,"");gsub("\r","");print;exit}' "$tmp/wrong-origin.headers")"
if [ "$wrong_cors" = "https://example.invalid" ] || [ "$wrong_cors" = "*" ]; then
  echo "BACKEND_CORS_OVERBROAD actual=$wrong_cors" >&2
  exit 1
fi
if [ -n "$wrong_cors" ] && [ "$wrong_cors" != "$ALLOWED_ORIGIN" ]; then
  echo "BACKEND_CORS_UNEXPECTED_VALUE actual=$wrong_cors" >&2
  exit 1
fi

echo "SETTLEMENT_TEST_PARSER_POST=PASS code=DAT"
echo "SETTLEMENT_TEST_MN_PARSER=PASS station=tg"
echo "SETTLEMENT_TEST_FAIL_CLOSED=PASS parser_date+kqxs_scope"
echo "SETTLEMENT_TEST_CORS_RESTRICTED=PASS"
echo "SETTLEMENT_TEST_KQXS_PREFLIGHT=PASS origin=${ALLOWED_ORIGIN}"
echo "SETTLEMENT_TEST_BACKEND_CONTRACT=PASS origin=${ALLOWED_ORIGIN}"
