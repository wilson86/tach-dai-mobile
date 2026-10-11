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

**Key limitations:** The M0 `core-contract.cjs` assumes caller supplies `server_verified` actor from a trusted authentication boundary; this marker **is not itself a security mechanism**. The PostgreSQL DDL candidate was not deployed or tested against Postgres and may need migration review. Existing green KTS synthetic CI cannot authenticate real HIOSKT outcomes.

**Privacy and cost:** Public GitHub contains only contracts, fake IDs, schema and synthetic tests. Production account/device data and access keys must remain private. No cloud account, billing or external runner authorized.
