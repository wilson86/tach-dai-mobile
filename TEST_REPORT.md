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
