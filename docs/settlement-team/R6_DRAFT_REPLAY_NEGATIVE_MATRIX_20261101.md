# KTS Settlement — post-R6 draft replay negative regression checkpoint

Date: 2026-11-01. **This document is a code/fixture checkpoint, NOT live or production acceptance.**

## Provenance and source pin

- Project: **KTS Settlement only**; repository: `wilson86/tach-dai-mobile`; branch: `codex/r6-rls-followup-20261029`.
- Prior HEAD: `eb35bb400242d198be436c1f2e6965e88ff6bfb4`.
- Code/test HEAD before this documentation commit: `bef033e8400975c515f2c523da25248223c350e7`.
- SQL fixture blob: `706b0ed2f91dafe2c1993627c41a49c74c540b01` (`team-settlement/tests/postgres-draft-replay-actor-regression.sql`).
- Source-contract test blob: `3d8203175ab072d2f25d41f741e1b4153982fa75` (`tests/settlement-team-draft-replay-sql-fixture-contract.test.cjs`).
- Existing SQL function blob unchanged from previous batch: `0ab3c419306d62f95986977ea82e14357999159b` (`team-settlement/migrations/002_draft_transaction.sql`).
- Project `AGENTS.md` and canonical WILSON86 zero-cost policy were read. Shared Skills were previously loaded from exact AI_ORCHESTRATOR seed `59630fd445c87b57598c88b0d47cc1296a8ebabd`; context-guard manually read from PR #11; **native discovery not verified**. Context risk: `UNKNOWN` (no authoritative remaining-context metric). No project switch.

## Bounded batch (max 3 tasks) — completed

1. Extend the existing *future disposable PostgreSQL* regression: five negative matrix cases now demand **no successful replay** for different partner, business date, region, base revision/event kind or request hash. Preserve the original same-actor successful retry and cross-actor denial, unchanged event/receipt counts, and outer rollback. No production SQL schema migration was run.
2. Add `tests/settlement-team-draft-replay-sql-fixture-contract.test.cjs` which checks the SQL test's named-database + opt-in guard, five negative branches, same-actor retry, wrong-actor rejection, and rollback/evidence assertions.
3. Publish this SHA-bound GitHub checkpoint to the existing development branch. No PR, merge, hosted CI, production or live session.

## Honest QA evidence

- Test SHA: `bef033e8400975c515f2c523da25248223c350e7`.
- A V8 isolate loaded the exact code/test blobs from the GitHub connector and executed 3 test callback bodies using a tiny synthetic `node:test`, `node:assert/strict` and `node:fs` shim. **3 static-source checks PASS / 0 FAIL**.
- Evidence type: `REMOTE_GITHUB_SOURCE_V8_STATIC`. This **is not native Node CLI execution** and **does not run PostgreSQL**, Android, Windows Job Object, runner or networked HTTPS.
- The five negative SQL cases are **written, NOT_RUN in PostgreSQL**. No SQL-function regression is claimed PASS.
- Earlier SQL function source invariant QA 3/3 (prior unchanged SQL blob) was not repeated.
- CI: no workflow triggered; GitHub Actions billing/free quota not independently verified. `GITHUB_CI=NOT_RUN`.
- R6 observed real Android/SQL milestone evidence from earlier run remains historical; restricted-role cross-workspace RLS and Reviewer logout still **NOT_VERIFIED**.

## Review from three roles

- Project manager: restrict next work to one isolated SQL regression + authorization and containment blockers; avoid unrelated features or another fixture-only loop.
- Independent reviewer: **RELEASE_READINESS = BLOCKED**. Caller-controlled actor GUC, direct ledger `scopes` INSERT/UPDATE, session revocation window, and the real `pg_ctl` process tree remain unresolved. A fixture that passes cannot remove a live blocker.
- End user: do not run real settlement/customer transactions or install this as production on Galaxy S25 Ultra.

## Next batch — max 3 tasks

1. When the user separately authorizes an isolated disposable PostgreSQL QA session, use a fresh `kts_fixture_*` database and synthetic-only marker to execute the rollback-only draft replay regression. Verify SQL function and rollback receipts on exact source SHA; do NOT reuse R6 roots or start the live pilot.
2. Independently review and repair the fundamental privilege/actor-binding plan before removing the existing `MINIMAL_DIRECT_SCOPE_GRANTS_BLOCKED` admission guard; preserve actor, CAS, audit, idempotency, session revocation and least privileges.
3. On authorized C-only Windows test workspace, integrate the proven Job Object ownership technique into the runner and test actual `pg_ctl`/postmaster child/grandchild teardown and watchdog/rollback. Do not infer this from a Python-process fixture.

## Safety and cleanup

`R6_LEASE=CONSUMED`; `R7=NOT_STARTED`; `LIVE_AUTHORIZATION=NOT_GRANTED`; `REAL_RLS=NOT_RUN`; `REVIEWER_LOGOUT=NOT_RUN`; `RELEASE_READINESS=BLOCKED`; `MERGE=NO`; `DEPLOY=NO`; `PRODUCTION_MUTATION=NONE`; `E_ACCESS=NO`; `F_ACCESS=NO`; `COST_USD=0`.

`CLEANUP_STATUS=NOT_RUN_REMOTE`; `FILES_REMOVED=0`; `SPACE_RECOVERED_MB=0`; `FILES_PRESERVED=ALL_EXISTING_SOURCE_AND_EVIDENCE`; `CLEANUP_BLOCKERS=NO_WINDOWS_WORKSPACE_ACCESS`. Preserve R6 rollback and unresolved-failure evidence.
