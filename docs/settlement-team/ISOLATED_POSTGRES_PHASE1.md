# Phase 1: real isolated PostgreSQL smoke (review-only)

**Important:** This is **not** production qualification and **not** permission to activate an atomic mutation. PostgreSQL migration/catalog smoke runs only on a **brand-new disposable local C:** cluster, never an existing PostgreSQL service or database. The two-phase design requires **explicit `--run`**, a preflight receipt for the **same Git SHA**, and binaries from the known `C:\Program Files\PostgreSQL\<version>\bin` directory. The user has authorized synthetic isolated qualification; no production merge/deploy or E:/F: access is implied.

In a fresh clean C:-only checkout at the exact branch HEAD, run:

```powershell
node scripts/settlement-pg-isolated-preflight.cjs --expected-sha=<EXACT_SHA>
# ONLY if PREFLIGHT says POSTGRES_BINARIES_ON_C_READY:
node scripts/settlement-pg-isolated-migrations.cjs --run --expected-sha=<EXACT_SHA>
```

The second script creates a unique `C:\KTS-Settlement\PG_SYNTHETIC_<sha>_...` folder (refuses an existing folder), initializes with a random temporary password, binds PostgreSQL to 127.0.0.1 only, executes the 4 original synthetic migrations in documented order, and checks **six FORCE RLS table flags** plus **no PUBLIC EXECUTE for raw draft/review mutation functions**. It always attempts to stop **only the unique cluster** it started; data and redacted reports are preserved for audit and rollback. It never connects to an existing service, reads existing production state or applies `candidate/atomic-review-v1.sql`. It removes only its generated password file.

**Positive outcome:** `MIGRATIONS_AND_LIMITED_CATALOG_PASS` only establishes those narrow SQL checks. It does NOT establish effective role grants, function owner security, session lock atomicity, PostgreSQL candidate compilation, race resilience, receipt verification, browser/Android readiness or financial correctness. Release remains **NO_GO**, composition write block **ENABLED**.

**Negative outcome:** `BLOCKED_...`; stop and preserve the entire generated report and PGDATA; no unreviewed fixes or production changes. The script never runs unattended. On a rare stop failure, inspect only its recorded unique PGDATA; do not terminate unrelated postgres instances or delete unresolved evidence.

**Required reviewer follow-up:** independently inspect exact SQL, PostgreSQL version, binary provenance, owner/grants and access control; run an entirely separate candidate-function review, FORCE RLS privilege tests, session/revocation race and lost-COMMIT tests before further consideration. `COST_USD=0`.
