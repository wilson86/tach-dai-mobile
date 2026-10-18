# KTS Settlement — focused test report

Run: `batch1-foundation-20261018`  
Source SHA: `52f860a2a0bbb8b3e919d8541076e1ac90d3cdd4`  
Worktree: `C:\KTS-Settlement\android-pilot-stage-a-52f860a\tach-dai-mobile-b2-group-app`

## Executed

```text
node --test tests/settlement-team-composition.test.cjs \
  tests/settlement-team-persistent-auth.test.cjs \
  tests/settlement-team-multi-actor-http.test.cjs \
  tests/settlement-team-review-http.test.cjs \
  tests/settlement-team-pagination.test.cjs \
  tests/settlement-team-server-ack.test.cjs \
  tests/settlement-team-recovery-vault.test.cjs \
  tests/settlement-team-pg-adapter.test.cjs
```

Result: **50 passed, 0 failed, 0 skipped** (Node 24.15.0; 1.375 s).

Coverage relevant to the next work:

- isolated auth/ledger pool composition remains default-off;
- hashed persisted sessions and immediate membership revocation fail closed;
- concurrent same-scope draft mutation produces one receipt and one conflict;
- another workspace cannot read or write the scope;
- review requires a different authorized actor and is default-off at HTTP;
- ordered cursor feed rejects spoofed tenants and malformed cursors;
- encrypted manual vault never auto-sends and rejects wrong recovery secrets;
- transaction adapter destroys ambiguous clients rather than reusing them.

## Intentionally not repeated

- B1 PostgreSQL qualification (previously PASS by operator evidence).
- B2 Android physical vault QA (previously FULL PASS by owner evidence).
- TLS certificate, Dynv6, DuckDNS, external networking, Android, firewall, Router, Telegram, Tailscale, port 8787, or E:/F: checks.

## Result interpretation

This is contract-level evidence only. It does not prove a persistent service is deployed, that database roles are provisioned, that a group UI is usable, or that monetary behavior is verified.

## Batch 2 — durable membership administration

Changed modules: `team-settlement/postgres-auth-service.cjs`, `team-settlement/role-probe.cjs` and focused tests.

- A current workspace administrator can update a role or revoke/reactivate membership for an **existing** identity only.
- The mutation rechecks active administrator membership in the same database transaction, rejects cross-workspace input and self-demotion/revocation, and requires a single matching `RETURNING` receipt.
- Identity/password creation and global identity disabling remain unavailable at runtime; those need a separate offline provisioning design.
- Role qualification now requires `kts_team` usage and membership SELECT/INSERT/UPDATE in addition to existing auth-session privileges, while preserving denials for ledger event reads, draft execution, superuser, and `BYPASSRLS`.

Complete Node settlement-team suite: **286 passed, 0 failed, 4 skipped**. The four skips are CI-disposable filesystem concurrency checks whose required CI environment was not present; they were not treated as passes.

## Batch 3 — active counterparty directory

Added an authenticated read-only `GET /v1/counterparties` path through the existing PostgreSQL repository, server API, and HTTP boundary.

- It lists only active customer/owner metadata for the workspace derived from the bearer session.
- Browser-supplied workspace, duplicate query keys, unsupported filters, oversized limits, and malformed response rows fail closed.
- It does not create counterparties, accept monetary values, create scopes, or expose inactive records.

Focused run for the directory plus adjacent auth/receipt/CAS contracts: **23 passed, 0 failed, 0 skipped**.

## Batch 4 — private synthetic bootstrap plan

Added `team-settlement/synthetic-bootstrap-plan.cjs`.

- Pure validation only: no filesystem, process, network, SQL, pool, or logging dependency.
- Rejects plaintext-password fields by accepting only exact identity keys with a valid scrypt verifier.
- Requires 10–30 synthetic identities, active membership for every identity, an admin per workspace, and both a synthetic customer and owner per workspace.
- The summary excludes verifier and authentication-subject data.

Focused run: **7 passed, 0 failed, 0 skipped**.

## Batch 5 — synthetic counterparty directory UI

- Added an explicit read-only `listCounterparties` client method; it requires the current authenticated workspace, validates fake tenant metadata, and leaves draft/cursor state unchanged.
- Added a pilot button that renders the directory without changing the selected partner. The operator must deliberately choose a valid fake ID before drafting.
- No storage, automatic selection, financial POST, or bearer persistence was added.

Focused client/UI/directory run: **106 passed, 0 failed, 0 skipped**.

## Batch 6 — private 65-case oracle review scaffold

- Added a blank exact-65-case private template and hash-only plan/review validation.
- Raw source rows, monetary values, and extra fields are rejected; only SHA-256 commitments are accepted.
- A completed 65-case review still reports `monetary_parity_proven=false` and `release_authorized=false`.

Focused oracle/bootstrap run: **6 passed, 0 failed, 0 skipped**.

## Final session verification

Complete settlement-team Node suite: **299 passed, 0 failed, 4 skipped**. The four skips remain CI-disposable filesystem concurrency checks requiring their dedicated CI environment; they are not treated as passes.
