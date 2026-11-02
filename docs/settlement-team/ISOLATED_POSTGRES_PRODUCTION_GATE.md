# KTS Settlement: fastest safe isolated PostgreSQL admission

**Source branch:** `codex/settlement-pg-isolation-admission-20261103`; base `5368e456e4f2f56084f0e763ea448f5ba43fd184`. This is a nonproduction acceptance plan, not an instruction to modify any live database.

## Authority and constraints
The owner delegated technical decision-making and specifically asked to accelerate to usable production. This enables a **fresh, disposable synthetic isolated PostgreSQL qualification on C:**, without any access to the production environment. It does **not** waive explicit release/merge/deploy gates, rollback requirements, production-write protections or user approval for real customer/money operations.

Use an isolated C: checkout (never edit `C:\KTS-Settlement\w20-2d63c84e` or the prior `QA_5368e456_20261103` checkout). Never access E:/F:, store credentials in GitHub, open remote DB ports, or use paid CI/APIs.

## Phase 0 — native environment check (no PostgreSQL start)
Run in a clean isolated Windows C: source checkout:
```powershell
node scripts/settlement-pg-isolated-preflight.cjs --expected-sha=<EXACT_FULL_HEAD_SHA>
```
The command is **read-only for PostgreSQL**. It does not start postgres, install software, access an existing database or accept a connection string. It checks Git HEAD/clean tracked source and detects binaries in `C:\Program Files\PostgreSQL\<major>=15\bin`. It writes a redacted JSON receipt under `.qa-evidence/pg-isolated-preflight`. `BLOCKED_POSTGRES_BINARIES_NOT_FOUND_ON_C` is a truthful blocker, **not** PostgreSQL test failure. Preserve this evidence; do not delete unknown files.

## Phase 1 — one fresh isolated PostgreSQL cluster (Codex Windows)
Only after Phase 0 and verification of file ownership and tool provenance. If the no-cost PostgreSQL 15+ binaries are absent, report `BLOCKED_PG_INSTALL_REQUIRED` (do not silently install, buy or run an unreviewed installer). Do not connect to an existing Windows PostgreSQL service; never use an existing PGDATA or connection string.

Within a **new, uniquely named empty directory on C:** create a disposable local cluster using `initdb`, a random ephemeral admin credential, no external listening address, a free ephemeral localhost port, and `pg_hba.conf` restricted to the chosen localhost-only auth scheme. Refuse root/admin-owned or junction/reparse/symlink paths when uncertain. Never log raw credential/session tokens; preserve required security evidence. Confirm the postmaster executable and PGDATA realpaths are within authorized C: and unmistakably not production. On any ambiguity STOP.

Import only the reviewed source files on a fresh empty synthetic DB, in order:
1. `team-settlement/migrations/001_team_ledger.sql`
2. `team-settlement/migrations/002_draft_transaction.sql`
3. `team-settlement/migrations/003_auth_session.sql`
4. `team-settlement/migrations/004_review_workflow.sql`

Source-only candidate `team-settlement/candidate/atomic-review-v1.sql` must **not** be added to the migration chain or runtime. Prepare its explicitly documented owner/pgcrypto prerequisites in the isolated cluster and attempt SQL **compile/rollback qualification only**, without a production grant. Preserve exact PostgreSQL error text with secrets redacted. Stop if its catalog preconditions cannot be satisfied without weakening the security model.

## Phase 2 — required independent security proof (no fake PASS)
At the exact pinned SHA, verify:
- SQL compiles cleanly with `ON_ERROR_STOP` in isolated DB; no preexisting schema/table/roles.
- `kts_atomic_owner` is NOLOGIN, NOSUPERUSER, NOBYPASSRLS, has no role membership or table ownership; superuser/pgcrypto and `kts_crypto` are verified as code requires.
- Enumerate direct, inherited and PUBLIC effective grants on schemas, tables and all callable functions; default privileges, `search_path` and function owners. PUBLIC/runtime must not call raw mutation entrypoints.
- `FORCE RLS` on every ledger table under function owner, plus unauthorized workspace/actor/key denied, cross-tenant read/write denied, revoked session/membership denied.
- Concurrent logout vs draft/review mutation use the **same session row/transaction**. Test invalid/expired sessions, nonce replay, wrong actor, proof tampering, same and different idempotency keys, payload/digest mismatch.
- Inject lost COMMIT/ACK on synthetic transactions, inspect durable receipts with a separately authenticated **read-only** lookup; NEVER infer 'not committed' from a timeout. Prove no accidental second financial event.
- Independent reviewer examines SQL owner and auth model, check results before any candidate promotion.

## Phase 3 — local Chrome and user-flow acceptance
Using a separately reviewed **synthetic-only localhost fixture** (no production listener), test two tabs on same origin, Web Locks, storage eviction, reload/restart, manual receipt inspection and logout; verify never auto re-dispatch unknown writes. On the user's Android S25 Ultra, use synthetic data only after separately authorized pilot staging. Require an independent monetary oracle before any financial usage.

## Stop/release gates
Any fail/missing proof => `RELEASE_NO_GO`, `WRITE_BLOCK_ENABLED`, `MERGE=NO`, `DEPLOY=NO`, `PRODUCTION_MUTATION=NONE`.
Never remove an atomic write block based on source-only tests, an apparent clean migration, or a single successful happy path. Preserve the original rollback, logs, source SHA, QA and the latest qualified checkpoint.

Required checkpoint: repo, branch, base/head full SHA; PG binary/version/PGDATA realpath and isolated port **without credentials**; source SQL blob SHAs; catalog queries and results; real test count and exit codes; native Node receipt `93/93` from prior SHA *separately labeled and never repackaged as new-SHA PASS*; browser/Android/CI statuses; unresolved blockers; cleanup report; `COST_USD=0`.
