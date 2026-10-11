# Team Settlement — Security and 30-user synthetic test matrix

**Scope:** early architecture candidate; no operational data or customer messages.

| Risk | Invariant/defense | Required negative test |
|---|---|---|
| User impersonates `customer` partner as group member | Separate identity/membership and counterparty tables | Settlement `partner_kind=customer` cannot authenticate as role |
| Spoof workspace or role in HTTP request | Workspace/role resolved from verified session and server DB lookup | Inject body role/admin or another workspace → deny |
| Cross-tenant query | PostgreSQL FORCE RLS + session-set tenant in transaction, parameterized DB access | Distinct memberships for tenant A/B, both reads and writes denied across tenant |
| Forged session or expired/revoked membership | Secure session verification at boundary; re-read active membership, revocation | Inactive member/token replay → deny even if cache says authorized |
| Operator approves own submitted money | Two-person review; actor roles/submitter checked server-side | Submitter tries approve/close → reject |
| Lost updates | Atomic revision compare-and-swap | Simultaneous same revision edits → exactly one commit and one conflict |
| Duplicate money on retry | Workspace-scoped idempotency unique key + canonical request SHA | Same key/same digest replay returns existing event; same key/new digest rejected |
| Unauthorized financial transition | Server state machine with audit entries | Close DRAFT, edit CLOSED, reopen without human-approved reason → reject |
| Offline money silently treated as final | Server only final ledger + explicit status | Offline draft always PENDING, conflict never SYNCED |
| Parser/KQXS uncertainty | Verified parser fingerprint, dual-source official result, fail-closed | conflicting KQXS, parser unknown, prohibited Ủi → cannot close |
| HTML/CSV export or log leaks | Escape HTML, neutralize spreadsheet formula injection, redact logs and receipts | Customer text beginning `=` is not executable in exports |
| Account hijack/brute force | TLS, session revocation/expiry, secure cookies+CSRF, rate limit, credential handling | Unauthorized session, replay, brute-force block |
| Server/db outage | Reconnect cursor, durable transactions, offhost encrypted backups | Power-loss mid-txn, last-week restore drill, network retries |
| User floods with files or huge stakes | Strict request size, field length and BigDecimal source validation | Invalid numeric, 10MB payload, invalid dates → reject |

**Thirty-client test scope:** 30 authenticated identities; 3 roles plus admins; 30 simultaneous reads, 10 racing edits to one scope, 20 unique edits, 30 identical idempotency retries, 30 conflicting keys, two workspace populations, two devices per session, offline reconnection and server restart. Tests must assert stable event count and money integrity after restart, **not only successful HTTP status**.

**Key limitations:** The M0 `core-contract.cjs` assumes caller supplies `server_verified` actor from a trusted authentication boundary; this marker **is not itself a security mechanism**. The PostgreSQL DDL candidate has not been deployed; only a disposable synthetic PostgreSQL smoke test is permitted in CI. This is not a security audit or production migration approval. Existing green KTS synthetic CI cannot authenticate real HIOSKT outcomes.

**Privacy and cost:** Public GitHub contains only contracts, fake IDs, schema and synthetic tests. Production account/device data and access keys must remain private. No cloud account, billing or external runner authorized.

## Read-side revocation contract (bounded candidate)

The injected server session's actor is not sufficient evidence of a currently
active PostgreSQL membership. Every ledger **read as well as write** must
re-check the tenant-scoped membership, revoked timestamp, disabled identity
and effective role within the same database transaction before querying
financial events. Reject a stale role or revoked user as
`AUTH_SESSION_REVOKED`. This is a contract/repository check using isolated
synthetic users only; a genuine durable auth service and revocation lifecycle
are still required before exposing a team API.


## Persistent session boundaries

A session token is random and held only in browser memory. The Postgres
candidate stores its **SHA-256 hex digest**, never the raw token. Every
verification checks a nonexpired, nonrevoked saved session and re-resolves
workspace membership and identity disabled status inside one transaction;
restarting the Node service does not restore revoked credentials. This avoids
blindly trusting a JWT/client role flag.

Before pilot, add login-rate limiting that persists or is shared across
processes, audit trails and alerting for failed attempts, credential reset
and rekey procedures, narrowly scoped auth DB roles, verified TLS/VPN,
transaction isolation and security review. Separate `kts_auth` privileges
from data-reader/writer permissions. Store no raw customer data in auth tables.


## SQL role-separation gate for a disposable PostgreSQL database

A dedicated GitHub Actions SQL test verifies two **non-login synthetic roles**:
an auth candidate may access credential/session storage but must not read
financial events, and a draft ledger writer may access workspace-scoped
financial events but must not read credential or session material. Tests
also demonstrate workspace RLS denying an unset tenant and limiting queries
to the selected workspace. This does **not** prove two independent network
connections, confidential credentials, an installed local PostgreSQL
service or a pilot on Windows. Both roles are created in disposable CI only.


## Explicit dual-Pool runtime-role preflight (synthetic candidate)

`team-settlement/role-probe.cjs` exposes an **opt-in, read-only** probe
that calls `SELECT current_user`, checks non-superuser/no-`BYPASSRLS`,
and examines auth-schema, ledger-event-read and draft-function privileges
through two caller-supplied connections. It requires two different PostgreSQL
roles with strictly separated auth/financial SQL rights. Failed probes
fail closed and destroy acquired clients. App construction has **zero**
automatic database connections; `verifyPools()` is not invoked by HTTP.

CI presently verifies this probe with **synthetic Pool doubles** and proves
the corresponding role permissions with real disposable PostgreSQL SQL tests.
It does **not** prove a Windows deployment, actual separately credentialed
Pool clients or an authorized live pilot. No production admission flag exists.
