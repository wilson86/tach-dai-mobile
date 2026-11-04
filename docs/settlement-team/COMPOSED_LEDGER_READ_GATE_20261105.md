# KTS Settlement — composed Ledger tenant READ gate

Date: 2026-11-05. Security containment change, **NOT release readiness**.
Branch: `codex/settlement-v2-expiry-delay-review-20261104`.
Previous HEAD: `fd2a2a9a0f26670beb1295112a5fe57486e3e69a`.

## Why this change is required

The prior composition blocked money mutations but left `getScope`,
`listCounterparties`, `getChanges` and `lookupRecoveryReceipts`
pointing to the old PostgreSQL Ledger repository. That code performs
direct tenant-table SELECT using RLS configured by a caller-settable
`kts.workspace_id` GUC. Earlier PostgreSQL synthetic tenant-GUC
testing had demonstrated a cross-tenant SELECT possibility with direct
Ledger SELECT privileges. This is **not evidence of a production incident**.

No independently approved database login privileges, role ownership,
complete read-function replacement or PostgreSQL isolation tests exist
for the current V2 candidate. Labeling a route READ ONLY does **not**
establish that it is safe for real tenant data.

## Actual source change

`team-settlement/team-composition.cjs` now overrides **all four**
exposed Ledger read methods with:
`TEAM_DB_TENANT_READ_BOUNDARY_UNAVAILABLE`.

The existing six Ledger mutation methods continue rejecting with
`TEAM_DB_ATOMIC_SESSION_BOUNDARY_UNAVAILABLE`. All of these methods
fail **before** opening a Ledger SQL connection when called directly
through the returned `ledgerRepository`. The opted-in synthetic
HTTP receipt-inspection route remains available **for negative
testing only**; it returns a non-success response instead of reading
unqualified receipts. The service still requires `syntheticOnly=true`,
does not automatically bind an HTTP port or create a database, and does
not enable any V2 SQL candidate.

`tests/settlement-team-composed-recovery-http.test.cjs` was updated
to expect HTTP 503/no receipt content/no Ledger SQL connection for
both a synthetic match and a missing synthetic receipt. An unprivileged
viewer remains denied. The separate source-scoped test
`tests/settlement-team-composed-read-denial.test.cjs` covers the four
read denials and unchanged six mutation denials.

## Evidence and limitations

Native Node v22.16.0 focused execution on an **exact Git blob-matched**
`team-composition.cjs` source and test, with seven **synthetic
dependency stubs**:
`node --check team-settlement/team-composition.cjs` PASS;
`node --test tests/settlement-team-composed-read-denial.test.cjs`
**2 PASS / 0 FAIL**. This proves composition-level fail-closed
behavior with the stubbed dependencies, **NOT** the entire real HTTP
stack, actual PostgreSQL permissions or native Windows/Android QA.
Full-checkout HTTP integration QA remains **NOT_RUN** for this SHA.

## Specific gates to recover useful functionality

1. Independently review/approve a real SQL V2 verifier, protected key
   custody/rotation and an exact permission model with all READ paths.
2. Replace **all** Ledger tenant direct SELECT paths with a qualified
   session-bound read authority. Verify exact SQL owner, grants,
   schema/default ACL, direct table and column privileges, tenant GUC
   forgery and cross-tenant attempts on fresh PostgreSQL 16 synthetic.
3. Remove only the specific read denials whose replacement behavior
   has genuinely passed that review; keep money mutation WRITE_BLOCK
   until independent atomicity/revocation/financial acceptance passes.

A runtime proof, signing fixture, SQL script, source scan or local
stubbed Node PASS is not independent signoff. This change deliberately
reduces the usable surface until trustworthy isolation can be proven.

**WRITE_BLOCK=ENABLED; RELEASE=NO_GO; CI=NOT_RUN; COST_USD=0.**
No merge, deploy, real database DDL, production mutation or E:/F: access.
