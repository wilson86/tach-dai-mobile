# KTS Settlement — fastest restricted usability path

**As of 2026-10-15.** The actual feature branch PR #6 is still DRAFT and
UNMERGED. No live group app is deployed. Do **not** use real customer content,
lottery bets, money, or real HIOSKT data in any synthetic pilot.

## What is already objectively available

1. GitHub Actions can run genuine Linux Chrome native WebCrypto/IndexedDB
   synthetic **save -> close -> restore** under a disposable test profile and
   retain a redacted, exact-source SHA JSON artifact.
2. The independent Node/Postgres contract gates exercise 30 concurrent
   synthetic clients, scope/role isolation, receipt integrity, review-state
   and read-only recovery decisions.
3. A separate `app/settlement-team-pilot.html` exists with fake-only
   partner entry, login, PENDING/SYNCED feedback and manual reconnect. It is
   not the live `settlement.html` page and is not hosted as a current service.
   Its working draft queue is `MEMORY_ONLY` and may vanish on reload.

## Restricted synthetic pilot — next human approval needed

A future operator can authorize *one* new time-limited private HTTPS pilot
against an isolated, already reviewed disposable team PostgreSQL database.
Approval must state the exact new SHA, test-only backend/credentials,
operator-owned devices, TLS/private network identity, a new non-8787 port,
start/stop, cleanup, no-data export and evidence location. No production
connection or general traffic exposure is approved by this document. The
old two-physical-device synthetic receipts apply only to their historical
SHA and must not be reused as proof for the new HEAD.

For the pilot, check on the actual phone/browser: authenticated fake-only
login; tenant boundary; two-device 1-COMMIT/1-CONFLICT race; offline PENDING
reconnect with the **same original idempotency key**; actual native IndexedDB
crash/restart retention; no duplicate event; operator confirmation; service
fully removed afterward. A browser warning cannot replace durable storage.

## Strict real-money launch blockers

- Independent operator-approved **65-case HIOSKT** source/mapping and
  exact monetary oracle, with every discrepancy resolved.
- Review of real identity provisioning, secret/key custody, tenancy,
  authorized workflows and tamper-evident audit.
- Physical Android/Windows source-SHA QA for encrypted offline drafts
  (including storage eviction/restart), coupled to freshly authenticated
  receipt reconciliation and human resolution.
- Independent PostgreSQL backup -> restore evidence, incident recovery,
  private HTTPS security, and explicit business/technical owner sign-off.

Until these are qualified: `NATIVE_CHROME_GITHUB_SYNTHETIC=PASS` on a
specific green SHA, `ANDROID_OFFLINE_DURABILITY=NOT_PROVEN`,
`GROUP_APP_READY=NO`, `REAL_MONEY_READY=NO`,
`RELEASE_READINESS=BLOCKED`. No merge or deployment follows automatically.
