# KTS Settlement Team — staged usability and isolated Windows pilot gate

**State as of 2026-10-12:** DRAFT, synthetic contracts only. This document is
not an installation, operator authorization or production deployment plan.
Refer to [PR #6](https://github.com/wilson86/tach-dai-mobile/pull/6) for
the current exact-SHA CI authority; **never rely on a previously green SHA
after code changes**.

| Stage | Required proof | Status |
|---|---|---|
| A — developer synthetic QA | Exact-HEAD Node and disposable PostgreSQL GitHub CI green | AVAILABLE on a verified exact HEAD only |
| B — one-PC persistent synthetic pilot | User-approved isolated Windows PostgreSQL DB, distinct auth+ledger credentials, Node integration driver, no production access, restart/restore test | BLOCKED |
| C — two-device synthetic pilot | B PASS plus tested private network, HTTPS/TLS identity, two independent human logins, outage/reconnect and zero tenant crossover | BLOCKED |
| D — real-money group operation (10–30 people) | Independent HIOSKT oracle and operator-approved private 65-case corpus/mapping, exact monetary proof, backup/restore and release sign-offs | BLOCKED |

## Current operator-supplied Windows evidence (not independently re-tested)

- Node/npm/Git are available for local source QA.
- PostgreSQL server/psql absent; Docker CLI exists but daemon is unavailable.
- This is a **hard block** on a persistent shared-database pilot on that host.
- GitHub CI proves separate password-authenticated PostgreSQL TCP sessions,
  and a committed DRAFT with an idempotent replay on a subsequent connection,
  **in an ephemeral CI container only**. It does not install software on Windows.

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
   current browser queue is memory-only.
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
