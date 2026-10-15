# KTS Settlement Team — staged usability and isolated Windows pilot gate

**State as of 2026-10-14:** DRAFT, synthetic-only pilot qualification reported; real-money operation blocked. This document is
not an installation, operator authorization or production deployment plan.
Refer to [PR #6](https://github.com/wilson86/tach-dai-mobile/pull/6) for
the current exact-SHA CI authority; **never rely on a previously green SHA
after code changes**.

| Stage | Required proof | Status |
|---|---|---|
| A — developer synthetic QA | Exact-HEAD Node and disposable PostgreSQL GitHub CI green | AVAILABLE on a verified exact HEAD only |
| B — one-PC persistent synthetic pilot | Isolated Windows PostgreSQL DB, distinct auth+ledger credentials, Node integration, restart/restore, raw receipt audit | OPERATOR-REPORTED PASS WITH LIMITATIONS at `bfa84fdd2cb839ca9a5042fdb24ed26169ea8ba5`; artifacts reviewed locally by Codex, not independently retrieved here |
| C — two-device synthetic pilot | B PASS plus tested private network, HTTPS/TLS identity, two independent human logins, outage/reconnect and zero tenant crossover | OPERATOR-REPORTED PASS on exact SHA `718a84d46318924e7c89c2c045f538a39ec31553`, isolated temporary HTTPS pilot already removed. New source revisions require fresh relevant code QA. |
| D — real-money group operation (10–30 people) | Independent HIOSKT oracle and operator-approved private 65-case corpus/mapping, exact monetary proof, backup/restore and release sign-offs | BLOCKED |

## Latest physical-device checkpoint (operator-reported, local C: only)

- At exact source SHA `718a84d46318924e7c89c2c045f538a39ec31553`, Windows and an approved physical phone passed private HTTPS/TLS identity, independent logins, tenant feed isolation, one-winner shared-workspace CAS, and an actual disconnected-phone PENDING → same-document reconnect → server-verified receipt sequence.
- Offline trial `run_20261014104957488_4cce9ae4f8e4cc67e6b80ef568bf956b`: raw SQL count **0** while phone was offline, **1** after reconnect; unchanged draft/idempotency key, no duplicates. See private Windows evidence reported by operator; **this repo does not contain or independently validate those files**.
- Temporary pilot Serve 8443 was removed and the operational 443 → 127.0.0.1:8787 route stayed unchanged; no running app is implied.
- The isolated UI remains **MEMORY_ONLY**, not durable offline accounting. The `beforeunload` dialog may be suppressed by browsers; no user workflow may rely on it for safety. These physical results belong to the above exact SHA, not automatically to later source changes.
- `TWO_DEVICE_PILOT_READY=YES_SYNTHETIC_ONLY`; `GROUP_APP_READY=NO`, `REAL_MONEY_READY=NO`, `RELEASE_READINESS=BLOCKED`.

## Current operator-supplied Windows pilot evidence (historical; not independently fetched)

- Operator has installed PostgreSQL 16.15 locally on `127.0.0.1:5433` and provided Codex Terra/Luna reports for an **isolated synthetic-only** database.
- At source `bfa84fdd2cb839ca9a5042fdb24ed26169ea8ba5`, the operator reports read-only qualification of GitHub exact-HEAD 2/2 PASS, 17/17 focused changed-code local tests, independently credentialed auth/ledger pools, two simulated users across isolated workspaces, and a PostgreSQL event count `0 -> 1 -> 1` after CAS/idempotency retries.
- The operator reports a raw SQL event ID matching the Node receipt, ordered change feed `1,2`, user revocation, and an actual spawned Node child PID reading persisted events after process restart. Evidence files stay on the operator's C: pilot, not in this public repository.
- **Qualification limits:** a dropped connection was tested before a write; a real forced mid-COMMIT TCP failure has NOT been tested. Browser/PWA and two **physical** devices have NOT been tested. Local logs lack an independent signed audit. No change in production audit or real-money readiness.
- CI proves ephemeral, disposable PostgreSQL contracts only. No GitHub test or operator report authorizes LAN/Tailscale/Internet exposure or real settlement use.

## Explicit human approval barrier before Codex local mutation

A human must first approve the **exact** proposed installer/container option,
download source, isolated test directory, localhost-only bind/address,
credentials storage, backup location, possible Windows privileges and rollback
procedure. No installation, daemon start, firewall edits, Tailscale routing,
port opening, scheduling, migration on existing DB or customer-data import
may be implied by a generic request to continue development.

Any authorized Codex operation must be bounded (finite MAX_TASKS and
MAX_ROUNDS), on a **new disposable database**, preferably an isolated
sandbox distinct from all existing projects. Preserve KTS Router,
Telegram and existing operational files. Never touch E:/F: without a
separate explicit scope and permission. Use synthetic people/bets only.
Never paste private paths, machine IDs, IPs, passwords or tokens into this
public GitHub repository.

## Strict pilot exit gates

1. Exact SHA, source cleanliness and existing synthetic QA still PASS.
2. One new disposable PostgreSQL database is proven separate from Router
   and any existing ledger; auth role != ledger role and neither role owns
   tables, is superuser or bypasses RLS.
3. Successful intentional write returns durable SQL receipt only after COMMIT;
   uncertain COMMIT, connection failure, revision conflict or replay mismatch
   never becomes `SYNCED`.
4. Restart and backup **restore** succeed with only synthetic data; two
   concurrent clients cannot lose, cross-read or duplicate a committed event.
5. Unsent drafts are not silently lost or represented as safely durable:
   current browser queue is memory-only. The sync-client snapshot exposes
   `draft_persistence=MEMORY_ONLY`, `volatile_unsent_count`, and
   `reload_loss_risk` for the UI to render an explicit warning. **This does
   not prevent reload data loss or implement durable offline storage**.
6. Two physical devices require private network security, independent
   authenticated identities and explicit operator confirmation before access.
7. The independent real-money oracle remains a separate hard gate even if
   the entire synthetic pilot passes.

**Status invariants:** `GROUP_APP_READY=NO`,
`MONETARY_MISMATCH_COUNT=NOT_COMPARABLE`,
`RELEASE_READINESS=BLOCKED`. The current HIOSKT remains the authority
for real accounting. No main merge, production service, Pages publish,
live customer corpus, paid cloud deployment or Router/Telegram mutation.

**Automatic promotion is forbidden.** Only independently recorded evidence
and explicit human review can change pilot or release status.
