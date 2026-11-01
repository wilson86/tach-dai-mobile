# KTS Settlement — independent GitHub source review (2026-11-01)

**Scope:** remote read-only source inspection of the minimal RLS + Reviewer logout follow-up; this document is a durable review checkpoint, **not** a runtime QA receipt or approval to run live.

- Repository: `wilson86/tach-dai-mobile`; branch: `codex/r6-rls-followup-20261029`.
- Reviewed source HEAD **before this documentation commit**: `3173bcb3dd64c8837d47832fe7fd061d018b94c3`.
- Earlier Windows checkpoint (operator-reported, not accessible/verified here): `C:\KTS-Settlement\w20-2d63c84e\KTS_MINIMAL_DRIVER_BRANCH_QA.json`, SHA-256 `BB23D1AC7C489089627C67B8D85F4DD070057DBA03E46C70087C2AD201A15F80`.
- Parent/branch history: `99512e3a66abd1213f5b759bd7e7878289a10504` → reviewed HEAD, 6 commits, fast-forward with no behind commits at review time.
- Policy read: `wilson86/AI_ORCHESTRATOR` canonical zero-cost policy; KTS `AGENTS.md` on default branch. Context-guard instruction read from AI_ORCHESTRATOR PR #11 source, **MANUAL_ONLY**, not native-discovered. Five other named shared Skills not found in inspected source tree: **UNAVAILABLE_TO_VERIFY**.
- Context risk: **UNKNOWN** (no authoritative capacity metric).
- Existing branch does not have an open PR at review time; no branch merge, deployment or release.

## Evidence reviewed / observations

1. `team-settlement/Invoke-KtsMinimalRlsReviewer.ps1` requires a separate authorization file for live mode; offline modes are explicitly gated by test environment and wrapper SHA. Source-drift detection is present. Control wrapper and runner are stored **outside** this Git repository, with SHA-bound patches in `docs/settlement-team/patches/`; real Windows copies, patch replay and process ownership cannot be independently revalidated from this remote review.
2. `docs/settlement-team/patches/minimal-rls-logout-control.patch` introduces seven minimal SQL stages and a real-driver workflow that executes `CROSS_WORKSPACE_RLS`, `REVIEWER_SESSION_BEFORE_LOGOUT`, clicks Reviewer logout, waits for unauthenticated UI, then executes `REVIEWER_SESSION_AFTER_LOGOUT`. The admission path claims a single-use authorization and requires source hashes; the subsequent `minimal-expiry-control.patch` caps the runner claim expiry at 24 hours. No new live lease/root has been claimed by this review.
3. `tests/settlement-team-minimal-driver-branch.test.cjs` extracts driver statements with hardcoded boundaries and runs them in a Node VM using fake UI/SQL callbacks. This exercises four control-flow scenarios; it **does not** prove the full Windows entrypoint, PostgreSQL, actual Android session behavior, or shutdown. Operator-reported `4/4 PASS` is local fixture evidence, **not independently re-executed** here.
4. `team-settlement/windows-reviewer-session-observation.ps1` validates a restricted auth role and counts a uniquely selected, revoked session by workspace, reviewer, and issue time, without exporting raw session hashes. The SQL and assertion logic is inspected; results against real PostgreSQL remain NOT_RUN.
5. `team-settlement/postgres-auth-service.cjs` rejects a revoked session inside `verifySession`; `team-settlement/auth-http-contract.cjs` exposes `GET /v1/session` returning 401 for invalid sessions. These provide an existing server contract that can be checked without publishing bearer credentials.

## Independent review findings (no unsupported PASS claims)

**F1 — BLOCKING FOR FULL FOLLOW-UP ACCEPTANCE: no observed post-logout server request denial.**
The procedure in `docs/settlement-team/r6-rls-reviewer-logout-followup.md` requires proof that the server rejects the previously revoked session. The reviewed minimal driver stages check unauthenticated UI and a SQL `revoked_at` observation, but do **not** visibly issue an authenticated `GET /v1/session` with the **same captured pre-logout token** after logout and assert 401. Database revocation and UI state are valuable but are not this distinct HTTP/API gate. Before readiness, either add this negative probe securely (token only in memory, never in traces/screenshots/commits) or explicitly document/approve a narrower acceptance requirement; do not infer that SQL evidence proves HTTP rejection.

**F2 — RISK REQUIRING SECURITY REVIEW: ledger role has reported direct `INSERT/UPDATE` privileges on `kts_team.scopes`.**
Schema RLS policies are scoped by `current_setting('kts.workspace_id', true)`, not by an actor authorization predicate. PostgreSQL tenant isolation alone does not establish authorization of same-workspace business state transitions. Verify actual grants, trusted DB connection access, scope owner/actor constraints and whether arbitrary direct mutations can bypass the intended CAS/review workflow. The existing `team_smoke_writer` negative test is not proof that the separately provisioned R6 ledger role lacks these grants. Do not declare production security approved on RLS results alone.

**F3 — EVIDENCE LIMITATION: independent Windows source/runtime qualification remains missing.**
Control scripts live outside this repository. Patch diffs, static inspection, fixture-level tests, and reported replay hashes are not equivalent to rerunning admission, teardown, RLS and actual Android session under the exact Windows files. The current GitHub review cannot verify C: process state, rooted PostgreSQL, or physical Galaxy acceptance.

## Decision and next bounded batch (max 3 tasks)

- **RELEASE_READINESS = BLOCKED**; **LIVE_RLS = NOT_RUN**; **LIVE_REVIEWER_LOGOUT = NOT_RUN**.
- Task 1: add the post-logout server-auth rejection proof and corresponding fail-closed offline negative fixtures, preserving session secrets only in memory.
- Task 2: produce a source-bound, least-privilege grant/actor-boundary review for the R6 ledger role and test unauthorized direct scope-state mutation safety without altering production.
- Task 3: independent local Windows review of the exact reassembled wrapper/runner/driver and launcher including recovery/rollback/owned-process cleanup. Store SHA, QA and the evidence path, then commit/push a fresh checkpoint on the branch.

**No new live session** is authorized. R6 lease is consumed. An operator-approved new synthetic single-use session would be required after all readiness blockers are addressed; max 60 minutes, fresh never-used root and lease. Never reuse historical evidence databases.

## Truthful execution receipt

`SOURCE_REVIEW=REMOTE_PARTIAL`; `TESTS_EXECUTED_BY_THIS_REVIEW=0`; `LOCAL_FIXTURE_QA=4/4_REPORTED_UNVERIFIED`; `WINDOWS_ADMISSION=NOT_RUN_BY_REVIEWER`; `GITHUB_CI=NOT_RUN/NO_RESULT_VERIFIED`; `POSTGRESQL_LIVE=NOT_RUN`; `ANDROID_LIVE=NOT_RUN`; `GALAXY_PHYSICAL=NOT_VERIFIED`; `MERGE=NO`; `DEPLOY=NO`; `PRODUCTION_MUTATION=NONE`; `E_ACCESS=NO`; `F_ACCESS=NO`; `COST_USD=0`.

`CLEANUP_STATUS=NOT_RUN_REMOTE`; `FILES_REMOVED=0`; `SPACE_RECOVERED_MB=0`; `FILES_PRESERVED=ALL_UNCHANGED`; `CLEANUP_BLOCKERS=NO_WINDOWS_WORKSPACE_ACCESS`.

Do not claim independent QA PASS, native Skills discovery, or user authorization from this review note.
