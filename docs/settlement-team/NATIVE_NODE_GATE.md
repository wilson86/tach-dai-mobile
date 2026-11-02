# KTS Settlement — Native Node gate on Windows (C: only)

Goal: qualify the two client regression suites and synthetic pilot UI suite with the **actual Node runtime** on the exact source HEAD. This gate is local and does not authorize release.

## Preconditions
- Isolated checkout of `wilson86/tach-dai-mobile` on C:, branch `codex/settlement-synthetic-receipt-review-20261103`.
- `git rev-parse HEAD` must match the `--expected-sha` argument; tracked working tree clean.
- Windows with Node.js already installed; do not install packages or add paid CI. Use a clean synthetic checkout; do not run inside production or an E:/F: folder.

## Run
```powershell
cd C:\Path\To\Your\Isolated\Settlement\Checkout
git rev-parse HEAD
node scripts/settlement-node-qa-gate.cjs --expected-sha=<COPY_FULL_GITHUB_HEAD_SHA>
```

The runner verifies the exact Git SHA, tracked source, real test paths, Windows C: scope; then runs exactly three tests under native `node --test`. It does **not** create a browser listener, initialize PostgreSQL, invoke GitHub Actions, mutate customer/production data or access E:/F: intentionally.

Evidence: `.qa-evidence/settlement-node-gate/NODE_QA_<SHA>.json` within the isolated checkout. Preserve FAIL evidence. For the same SHA, same Node version and same tested files, a prior PASS is reused without re-running. The runner cannot prove Web Locks, durable browser storage, effective PostgreSQL role grants, FORCE RLS, atomic revocation or lost COMMIT. Those remain release blockers.

## Safety
- Source SHA mismatch, dirty tracked files, non-Windows or non-C workspace => **fail closed**.
- `PASS` requires native Node exit 0 and valid TAP counts with 0 failures; no CI PASS claim.
- `COST_USD=0`; `MERGE=NO`; `DEPLOY=NO`; `PRODUCTION_MUTATION=NONE`; `WRITE_BLOCK=ENABLED`.
