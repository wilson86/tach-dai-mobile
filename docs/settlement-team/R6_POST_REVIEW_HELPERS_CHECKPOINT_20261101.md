# KTS Settlement — post-review security proof helpers checkpoint (2026-11-01)

## Scope, authority and source

- Repository: `wilson86/tach-dai-mobile` (public); branch `codex/r6-rls-followup-20261029`.
- Tested code-bearing HEAD: `b0a8e9b2076ffb25ac064f9db3cb363ac8c59b09` (parent `9827484f7abc80038a198e70b09c259edcbfaf89`).
- Historical R6 source HEAD (Windows): `d0562c8979fceb5285b49b33ea4b2e353b31957c`; NOT a claim that Windows controls were rebuilt.
- Historical Windows checkpoint, reported, **not remotely read or hash-verified**: `C:\KTS-Settlement\w20-2d63c84e\KTS_MINIMAL_DRIVER_BRANCH_QA.json` SHA-256 `BB23D1AC7C489089627C67B8D85F4DD070057DBA03E46C70087C2AD201A15F80`.
- Reviewed existing GitHub `AGENTS.md`, canonical WILSON86 zero-cost policy, proposed context-guard from AI_ORCHESTRATOR PR #11. Context-guard **MANUAL_ONLY**; no native discovery. Other five Skills not available at inspected paths. Context risk **UNKNOWN**.
- No pull request created: `settlement-team-contract.yml` runs on selected PR paths; avoid triggering unnecessary hosted CI.

## Source changes in this batch — test infrastructure ONLY, no production app mutation

1. `team-settlement/reviewer-logout-http-proof.cjs`: opt-in in-memory two-stage proof contract. Requires the **same** synthetic Reviewer session bearer before logout (GET `/v1/session` must be 200 with Reviewer identity/workspace) and after confirmed UI logout (GET with same bearer must be exactly 401 `AUTH_SESSION_INVALID`). Rejects missing/mismatched evidence and callback errors, emits only sanitized non-secret receipts; clears the retained reference on completion/failure. **Not yet wired into Windows CDP driver**, and does not acquire the application's memory-only token itself. The caller MUST securely bind the token to the UI session, use strict TLS, and avoid serialization/screenshot/logging. A mocked callback passing is never real HTTP proof.
2. `team-settlement/ledger-scope-grant-audit.cjs`: opt-in, read-only query of the **actual ledger connection role** and table/column INSERT/UPDATE/DELETE grants on `kts_team.scopes`. Rejects privileged, incomplete or mismatched identities. Any direct mutation privileges yield `BLOCKED_DIRECT_SCOPE_MUTATION`; absence of direct grants still leaves same-workspace actor authorization and real RLS `NOT_VERIFIED`. **Not yet run against PostgreSQL**. Does not revoke grants or change a schema. Role name must be provided from trusted bootstrap, not guessed.
3. `tests/settlement-team-reviewer-logout-http-proof.test.cjs` and `tests/settlement-team-ledger-scope-grant-audit.test.cjs`: synthetic callback/SQL-row fixtures including fail-closed negative cases. No real network, CDP or database in these tests.

### Exact source identity (Git blobs matched between sandbox-tested bytes and GitHub)

| Path | Git blob SHA-1 |
|---|---|
| `team-settlement/reviewer-logout-http-proof.cjs` | `38e95d02d8af3ffc49bc851b391cf97fa6124fc5` |
| `team-settlement/ledger-scope-grant-audit.cjs` | `2c46784f845383bdb98e43c75db6f40bd7165eed` |
| `tests/settlement-team-reviewer-logout-http-proof.test.cjs` | `9698e6183d9d38de09796b18735df3428d836932` |
| `tests/settlement-team-ledger-scope-grant-audit.test.cjs` | `557acc00955af0a2853d0824d14d535c83f656be` |

### Focused local QA receipt

- Environment: isolated Linux sandbox, Node.js `v22.16.0`.
- Exact command after writing the same four Git-blobs: `node --test tests/settlement-team-reviewer-logout-http-proof.test.cjs tests/settlement-team-ledger-scope-grant-audit.test.cjs`.
- Result: **8 PASS, 0 FAIL, 0 SKIP**, 2 files; Git blob hashes checked against GitHub by re-fetch after commit.
- Covers single-use token retention, same-bearer before/after fixture, missing/wrong Reviewer and HTTP status, non-401 failure, callback error sanitization, scope grant privilege positive/negative/missing fields, and read-only SQL query text.
- **Evidence classification: LOCAL_SANDBOX_FIXTURE_PASS (not real HTTP, PostgreSQL, Windows or Android).**
- Other pre-existing tests on unchanged SHAs were not re-run. Windows R6 minimal fixture reported by Codex: 4/4 PASS, *not reproduced* here.
- GitHub CI on tested SHA: **NOT_RUN/NOT_VERIFIED**; no workflow manually triggered.

## Independent three-role gate

- Project manager: preserve shortest route to synthetic-only live acceptance; no feature expansion or release.
- Independent reviewer: `RELEASE_READINESS=BLOCKED`. Source helpers are not integrated into Windows and missing evidence cannot be converted into PASS.
- End user: not safe for real financial/customer use; Galaxy physical acceptance has not occurred.

## Next bounded batch (max 3; local Windows Codex when authorized)

1. Bind the HTTP helper to **the same Reviewer bearer used by Android UI** via a strictly synthetic test harness without persisting/exposing token. Do not change app's memory-only token policy. Add evidence from the actual post-logout `GET /v1/session` 401 or fail closed. Verify no bearer in logs/receipts/screenshots; test with a replayed/unrevoked session negative fixture.
2. Use the read-only grant audit on the new synthetic ledger role in a separately qualified local test and independently review same-workspace actor/CAS write safety. If direct scope grants remain, do not suppress the BLOCKED result merely because cross-workspace RLS passes. Any grant changes require a separately reviewed source/migration plan, never a live production change.
3. Independently qualify the **reconstructed** Windows launcher/wrapper/runner/driver, patch replay, offline acceptance and owned-process cleanup; commit/push exact SHA, logs/checkpoint to this development branch when safe. Do not re-run prior same-SHA PASS gates.

## Safety, closure, and controls

- **R6_LEASE=CONSUMED**, no new live authorization; never re-use R6 root/lease; **R7=NOT_STARTED**.
- `REAL_RLS=NOT_RUN`, `REAL_REVIEWER_LOGOUT=NOT_RUN`, `POST_LOGOUT_REAL_HTTP_401=NOT_RUN`, `GALAXY_PHYSICAL=NOT_VERIFIED`.
- `MERGE=NO`, `DEPLOY=NO`, `PRODUCTION_MUTATION=NONE`, `E_ACCESS=NO`, `F_ACCESS=NO`, `COST_USD=0`.
- `CLEANUP_STATUS=INVENTORIED_PRESERVED`, `FILES_REMOVED=0`, `SPACE_RECOVERED_MB=0`, `FILES_PRESERVED=4 sandbox QA source/test files plus GitHub source, rollback and checkpoints`, `CLEANUP_BLOCKERS=NO_WINDOWS_WORKSPACE_ACCESS`.
- If local control source differs from pinned SHA, halt with drift evidence; no automatic patch overwrite. Do not open a live session based on this checkpoint.
