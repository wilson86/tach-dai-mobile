# KTS Settlement — V2 Auth session-bound read candidate and qualification gate

Date: 2026-11-04. Scope: Issue #5, candidate branch `codex/settlement-receipt-owner-proof-review-20261104`.
This is a **default-off candidate**, not a production authorization implementation, independent security sign-off, or SQL migration approval.

## Source advancement

The previous V1 receipt proof incorrectly derived its HMAC key from SHA256(bearer). V2's review-only HMAC fixture uses a separate injected key, and this batch connects its *proposed* signing interface to an Auth database transaction.

- `team-settlement/candidate/receipt-v2-auth-boundary.cjs`: a concrete non-HTTP `createReceiptV2AuthBoundary({db,clock,enabled=false})`. With default `enabled=false`, invoking `authorizeReceiptRead` rejects before any database access. If explicitly enabled in an isolated synthetic composition, it first validates an opaque bearer, hashes it solely to locate a valid session, reads **server-held** `session_handle`, `workspace_id` and `user_id` under `FOR SHARE`, sets transaction-local tenant scope, rechecks an active admin/operator membership and enabled identity with `FOR SHARE OF m,i`, and only then invokes a trusted backend-only callback. The callback never receives the bearer or the session hash. This is **not wired into runtime Auth/HTTP/ledger**.
- `team-settlement/candidate/receipt-v2-session-handle.sql`: **unapproved** scratch-only PostgreSQL16 schema proposal to add a nullable text handle with 32-hex format check and partial unique index. Old sessions remain NULL and are refused by V2; no backfill from bearer/session hash, no production role grants. The existing production-style Auth login does **not** create such handles; a separately designed login issuance path is still mandatory. **Do not execute this DDL** before independent design/owner review.
- Tests: `tests/settlement-receipt-v2-auth-boundary.test.cjs` (6 cases), `tests/settlement-receipt-v2-session-schema.test.cjs` (2 cases), `tests/settlement-receipt-v2-auth-integration.test.cjs` (2 cases). Integration uses the existing `tests/fixtures/receipt-v2-authority-admission.cjs` and `tests/fixtures/receipt-backend-proof-v2.cjs` with a simulated transaction, an injected synthetic signing key, and an injected SQL verifier fixture. **No live PostgreSQL was called**.

## Test evidence and source-bound verification

Batch source before edits: `c6e626d7e6dada9445ed6736777e4404f7378ea7`. Focused test platform: isolated Linux container Node.js `v22.16.0`. Command:

`node --test tests/settlement-receipt-v2-*.test.cjs`

Result **10 PASS / 0 FAIL / 0 SKIP** (6 Auth candidate, 2 migration source contract, 2 injected Auth→signer→verifier flow).

GitHub blob hashes verified against corresponding local QA source bytes:
- Auth candidate `dd0844f903f5cf2f31c3d6147a7795f630de43c3`
- Auth tests `9280d744b0413487fe81ea16eaa920b77c3ef879`
- SQL candidate `9a32beb8a3c40e99443350f7130caf953a6b6d6e`
- SQL tests `bd8dbab3d2fcde51a96964a203ce49a9b10d1533`
- Integration test `1c0984edb79a5235dff49dd91b53d9ff8ecfc41d`
- Prior synthetic proof fixture `f4e320b24d04320cb0aa7c4c676b7c4d6c8fa396`
- Prior authority admission fixture `3cea932ee03ae9dfb72327251e4d3fd370cd65d2`

During local red/green development an invalid DB session with `user_id=null` was initially accepted because JavaScript RegExp `.test(null)` coerces null to the literal text `"null"`; fixed with explicit `typeof ... === 'string'` checks before the successful qualification. That failed pre-fix test is **not** a production exploit report. The fix and regression were included before pushing.

## Absolute remaining production gates

1. **Approve actual V2 authority design independently.** Key custody/rotation and privileged verifier secret store (not bearer-derived), nonce and replay policy, key IDs and logging. A mocked `server_verified` flag or the synthetic in-memory verifier does not confer authenticity.
2. **Review login handle issuance and SQL verifier grants.** The current Auth login has no `session_handle` issuance. Proposed schema and candidate must never be added to migrations without review. Establish Auth/Ledger role separation, minimal non-login owner/crypto SELECT/EXECUTE and default ACLs, and NO Ledger direct SELECT. Existing ledger read paths beyond receipts must also be replaced or contained, not silently broken.
3. **PostgreSQL16 isolated qualification.** Only on a newly provisioned, supervised, disposable C:-only synthetic cluster after review. Test valid and revoked sessions/memberships, cross-tenant GUC forging, direct SELECT denial, function ACL, concurrent logout, lost connection, pooled-connection GUC bleed, replay and correct COMMIT/ROLLBACK tags. **NOT_RUN**.
4. **Actual integration/acceptance.** Review Auth/HTTP/ledger/Windows/Android failure recovery, logging and secret masking; operator-approved HIOSKT 65-case financial oracle and independent reviewer sign-off. **NOT_RUN/BLOCKED**.
5. `WRITE_BLOCK` stays `ENABLED`. No merge, deploy, live money mutation, production data access, or E:/F: write.

**Verdict:** `DEV_PROGRESS=AUTH_BOUNDARY_CANDIDATE`; `SOURCE_MODEL_QA=10/10_PASS`; `POSTGRESQL_DDL=NOT_RUN`; `BACKEND_SIGNER_PROVEN=NO`; `SYSTEM_WIDE_TENANT_ISOLATION=NOT_QUALIFIED`; `RELEASE=NO_GO`; `COST_USD=0`.
