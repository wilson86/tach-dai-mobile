# KTS Settlement — implementation gap matrix

Audit timestamp: 2026-10-18T07:09:28Z  
Authority source: `52f860a2a0bbb8b3e919d8541076e1ac90d3cdd4`  
Development branch: `codex/b2-group-app-20261018` (local isolated worktree)

| Feature | Implemented evidence | Tested evidence | Missing / limitation | Blocker | Priority |
|---|---|---|---|---|---|
| Durable authoritative ledger | PostgreSQL migrations 001/002 and `postgres-ledger-repository.cjs` | Prior B1 operator evidence; focused receipt/CAS contracts pass | A separately provisioned disposable DB is required to run it | Local synthetic runtime provisioning | P0 |
| Authenticated session | `postgres-auth-service.cjs`, hashed opaque sessions, membership checked per request; private bootstrap-plan validator | Persistent-auth and bootstrap-plan tests pass | Operator still needs to create private scrypt verifiers and apply a reviewed disposable DB bootstrap | Isolated DB/operator procedure | P0 |
| Multiple workspaces / human membership | schema plus durable `manageMembership` for existing identities | Contract tests cover tenant denial/revocation and current-admin recheck | Initial identity/password bootstrap remains intentionally offline; no membership UI | Disposable DB grants and product UI | P0 |
| Customers and owners | schema, authenticated active directory, and explicit pilot UI directory view | Repository/server/HTTP/client/UI tests pass | No runtime create; counterparties must be provisioned offline | Offline bootstrap | P1 |
| Draft creation / idempotent receipts | append-draft SQL, server API, HTTP contract | Server receipt and multi-actor tests pass | Pilot UI queue is memory-only | Durable offline recovery is separate/manual | P0 |
| Submit and independent review | review migration and explicitly gated HTTP route | Review HTTP focused tests pass | Default off and not exposed by vault-only endpoint | Synthetic group runtime composition | P1 |
| Ordered tenant change feed | repository plus `/v1/changes` parsing | Pagination/tenant tests pass | No user-facing durable history view beyond pilot session | Product UI integration | P1 |
| Audit history/status | immutable scope events / receipts schema | Receipt/feed contracts pass | No operator-oriented audit screen/export in group app | UI and access design | P2 |
| Offline encrypted recovery | `recovery-vault.cjs` and Android B2 evidence | Focused vault tests pass; B2 owner evidence FULL PASS | Manual backup is not a durable automatic offline queue | Requires explicit product decision and storage threat review | P1 |
| Real-money close/finalization | Explicitly absent | N/A | Intentionally unavailable | Independent 65-case HIOSKT oracle and approvals | RELEASE BLOCKER |

## Audit conclusion

The source already has robust, fail-closed contracts for the synthetic ledger core. Batch 2 completed the narrow durable membership surface already anticipated by the HTTP contract. Batch 3 added a tenant-scoped active counterparty directory for existing customer/owner rows, with strict backend validation and no financial fields or mutation. Batch 4 added a private, no-I/O topology planner: it accepts only scrypt verifiers, enforces 10–30 synthetic identities, memberships with an administrator per workspace, and fake customer/owner counterparties. It produces a redacted summary, not SQL. Batch 5 connected the active directory to the synthetic pilot as an explicit, read-only list; it never changes the selected scope or pending drafts. Applying a plan and deployment remain explicitly reviewed operator actions.
