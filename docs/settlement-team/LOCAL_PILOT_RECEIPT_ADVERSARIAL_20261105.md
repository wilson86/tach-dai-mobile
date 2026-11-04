# KTS Settlement — synthetic pilot runner receipt and review evidence gate

**Date:** 2026-11-05. **Scope:** local synthetic pilot orchestration only;
not the real PostgreSQL ledger, production login or monetary authority.

## Reproduced failure, exact original source

`team-settlement/local-pilot-runner.cjs` source blob
`aaad8b11721ad147123a7383356d878f519a416e`, retrieved from
`wilson86/tach-dai-mobile` branch
`codex/settlement-v2-expiry-delay-review-20261104`.

The runner previously accepted successful fake pilot results in situations
that should be rejected:

- the operator and reviewer were **the same user ID** but had different roles;
- a draft receipt had **negative** revision;
- distinct workflow steps reused the **same event ID**;
- the read-only change feed omitted/replaced the actual approved event,
  but contained 3 monotonically increasing event sequence values;
- the three financial-intent idempotency keys were **reused**.

With exact original runner Git blob in local isolated Linux Node 22.16.0,
`node --test tests/pilot-safety-regression.test.cjs` produced
**1 PASS / 5 FAIL**. The failures were expected negative regression
reproductions, not production security exploit evidence.

## Fix on WIP source

`team-settlement/local-pilot-runner.cjs` now:
1. rejects reused draft/submit/approve idempotency keys before dispatch;
2. requires positive safe numeric revision and feed sequence and valid
   event IDs, plus draft revision 1, subsequent sequential scope revisions
   and strictly increasing receipt feed sequence;
3. requires **different, valid string user IDs** for operator and reviewer,
   even if an injected Auth backend changes a user's role;
4. verifies the returned ordered change feed contains the three actual
   event IDs with matching sequence (and matching state when present);
   rejects malformed/duplicate/out-of-order rows and never treats merely
   “3 increasing numbers” as complete evidence.

It is an explicit **fail-closed synthetic qualification gate**. It does not
alter live APIs, source-of-truth PostgreSQL RLS, real-money settlement writes
or production behavior. Broader feed pages and SQL-backed source fields
require source-authority-specific integration tests before release.

## Targeted SHA-bound QA

Final source blob: `286737f342a3f4507ec315e6e683943e577e12f6`.
Original unchanged runner regression test:
`tests/settlement-team-local-pilot-runner.test.cjs`,
blob `6c07e6e34fd6dcf1892e79d88b12a384aa670811`.
New negative regression:
`tests/settlement-team-local-pilot-safety-gate.test.cjs`,
blob `ae7a36c546c2e5ce62393daa75a6b19e9179d24b`.

Native Node.js `v22.16.0`, isolated workspace
`/mnt/data/settlement_local_pilot_gate_20261105`:

```sh
node --check team-settlement/local-pilot-runner.cjs
node --check tests/settlement-team-local-pilot-safety-gate.test.cjs
node --test tests/settlement-team-local-pilot-runner.test.cjs tests/pilot-safety-regression.test.cjs
```

All **10 PASS / 0 FAIL / 0 SKIP**. Final local `git hash-object`
of both changed source and regression suite matched the GitHub blobs
above; the new test was committed at the same bytes under
`tests/settlement-team-local-pilot-safety-gate.test.cjs`.

**Limits:** This QA uses in-memory synthetic injected deps. It does not
verify real PostgreSQL 16 permissions, signed receipt integrity, revocation
races, tenant GUC or real HIOSKT monetary calculations, nor a Windows/Android
pilot. Hence **SECURITY_SIGNOFF=NOT_GRANTED**, **PG16=NOT_RUN**,
**WRITE_BLOCK=ENABLED**, **RELEASE=NO_GO**, **COST_USD=0**. Independent
security review remains pending on Issue #32.

## Decision

Qualified for source-level synthetic pilot negative regression only.
Do **not** interpret an isolated mock pilot PASS as a real group-money
release, a verified durable receipt or an independently signed security
review. Continue complete live-source qualification under Issue #5.
