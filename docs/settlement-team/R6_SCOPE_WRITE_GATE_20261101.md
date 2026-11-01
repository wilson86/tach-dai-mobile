# KTS Settlement — post-R6 direct-scope grant blocker (2026-11-01)

## Authority
Repository: `wilson86/tach-dai-mobile` (public)
Branch: `codex/r6-rls-followup-20261029`
Reviewed source HEAD: `b1a5f64b02286e4e74a6026f64e8c83caf4096cb`
Windows owner checkpoint (reported, not locally inspected): `C:\KTS-Settlement\w20-2d63c84e\KTS_REVIEWER_CAPTURE_FAILURES.json`
Reported checkpoint SHA-256: `A9B832B34C0791D5F64FA33476399E0D9AE24D6BB096C6FDCC25E918529DFBA2`

## Source-review result

- The Windows runner's qualified source and tests explicitly describe a `GRANT INSERT,UPDATE ON kts_team.scopes TO $ledger` on the isolated PostgreSQL role. Its launcher still **intentionally aborts before live** with `MINIMAL_DIRECT_SCOPE_GRANTS_BLOCKED`; do not remove that guard.
- The R6 ledger-grant audit correctly classifies direct scope mutation as `BLOCKED_DIRECT_SCOPE_MUTATION`. Existing static tests cover this negative classification, not a repaired authorization boundary.
- Current `team-settlement/role-probe.cjs` verifies distinct auth/ledger roles, RLS bypass and membership privileges, **but its generic pool qualification does not verify direct scope table/column update grants**. A synthetically tested candidate to add `direct_scope_write_denied` checks to BOTH auth and ledger queries exists only in the ChatGPT sandbox: 3/3 focused Node fixture tests PASS. It has **NOT been committed or qualified in Windows**. The attempt to publish the code change through the connector was rejected; never claim it is on this branch.
- Both `kts_team.append_draft` and `kts_team.advance_review` use `SECURITY INVOKER` and directly mutate `scopes` (and other tables). Simply revoking direct write grants from the runtime role would make these approved synthetic workflows fail. Replacing them with `SECURITY DEFINER` is not automatically safe: account for function ownership, fixed search_path, trusted actor binding, spoofable custom GUC values, least-privilege EXECUTE, RLS and regression against the entire workflow. No migration is authorized by this review.
- The operator-reported latest Reviewer/CDP failure tests are 4/4 PASS in **mocked** UI/HTTPS mode. They do not establish live Android logout, real TLS or PostgreSQL RLS.

## Decision and next bounded batch

1. **First:** add the fail-closed direct-scope table-and-column privilege check to the explicit read-only pool preflight, including missing/null/true negative fixtures. Treat current Windows grant as a blocker; do not bypass. Rebuild and run all relevant local role-probe tests on the exact source SHA.
2. **Second:** independently design a **separate synthetic-only** least-privilege architecture for review/draft writes that prevents same-workspace direct state manipulation while preserving actor, CAS, idempotency and receipt integrity. Require reviewer qualification and rollback. Do not apply DDL/grant changes on R6 or production databases.
3. **Third:** commit/push only qualified source, tests and a source-pinned checkpoint on this WIP branch. If control files or source drift on Windows, stop and preserve evidence. Do not open a new live session before both security gate and owner authorization.

## Gates and restrictions

`R6=INCOMPLETE`; `R6_LEASE=CONSUMED`; `NEW_LIVE_AUTHORIZATION=NOT_GRANTED`;
`REAL_RLS=NOT_RUN`; `REAL_REVIEWER_LOGOUT=NOT_RUN`; `RELEASE_READINESS=BLOCKED`;
`WINDOWS_LOCAL_QA=NOT_RUN_BY_THIS_REVIEW`; `GITHUB_CI=NOT_RUN`;
`PRODUCTION_MUTATION=NONE`; `MERGE=NO`; `DEPLOY=NO`; `E_ACCESS=NO`; `F_ACCESS=NO`; `COST_USD=0`.

WILSON86 zero-cost policy and project AGENTS.md consulted. Context guard was manually read from AI_ORCHESTRATOR PR #11; `SKILL_STATUS=MANUAL_ONLY`, not native-discovered. `CONTEXT_RISK=UNKNOWN`, with no exact remaining percentage.

`CLEANUP_STATUS=INVENTORIED_PRESERVE_CANDIDATE`; `FILES_REMOVED=0`; `SPACE_RECOVERED_MB=0`; `FILES_PRESERVED=DISPOSABLE_LOCAL_TEST_CANDIDATE+HISTORICAL_CHECKPOINTS`; `CLEANUP_BLOCKERS=WINDOWS_WORKSPACE_NOT_ACCESSIBLE`.
