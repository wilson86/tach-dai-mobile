#!/usr/bin/env bash
# Fail-closed preflight before any public Pages deployment.
set -euo pipefail
node --version
node .github/scripts/settlement-predeploy-integrity.cjs
node --test .github/scripts/settlement-history-audit.test.cjs
node --experimental-websocket .github/scripts/settlement-cdp-browser.cjs indexeddb
node --experimental-websocket .github/scripts/settlement-cdp-browser.cjs offline-cold
echo "SETTLEMENT_PREDEPLOY_GATE=PASS"
