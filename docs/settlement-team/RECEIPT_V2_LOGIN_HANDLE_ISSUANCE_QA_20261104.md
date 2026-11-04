# KTS Settlement — guarded session-handle issuance, source-bound QA

Date: 2026-11-04. Project Issue #5; candidate branch `codex/settlement-receipt-owner-proof-review-20261104`.
Base commit `0fd47f6a743dd598a5b880c3793540e591ad1c48`.
This note records a **development candidate**; it does not grant independent design approval or release authorization.

## Changed real Auth source (not another review-only toy)

`team-settlement/postgres-auth-service.cjs` now accepts `receiptV2SessionHandleEnabled=false` in `createPostgresAuthService`. The default mode executes **the same legacy INSERT and return shape**. If explicitly enabled after an independently reviewed V2 schema installation, successful credential verification generates a **separate cryptographically random 16-byte/32-hex handle**, inserts it alongside the stored SHA-256 session hash, demands exact SQL RETURNING echo for both and returns only the original `session_token` and `expires_at` fields to the HTTP client. Failed SQL/mismatched receipt does not issue a session token. No raw bearer is used to compute the handle. Both flag and SQL are guarded; the feature is not enabled in `team-settlement/team-composition.cjs`.

The previously authored `team-settlement/candidate/receipt-v2-session-handle.sql` remains a review-only, NOT_EXECUTED, scratch-only migration proposal. Existing sessions without handles cannot receive V2 proofs, and the V2 SQL verifier remains unimplemented. The new opt-in login path must NOT be activated against an existing production database.

## Evidence and test limits

- GitHub Auth-source blob `e9244f1aeaa2a55442991915c80871f09b9d188c`, and new focused test blob `ba96a588d45b0b6307761fdc5b93f6a4129ae8cc` were downloaded through the GitHub connector and transferred into an isolated Linux container. Local `git hash-object` matched both GitHub blob hashes **exactly**; Node `v22.16.0`.
- Command: `node --test /mnt/data/settlement_v2_login_batch/tests/settlement-v2-login-handle-flag.test.cjs`.
- Result: **4 PASS, 0 FAIL, 0 SKIP**. Covers the disabled legacy SQL/return shape, opted-in independent random handle and lack of client exposure, missing-schema/mismatched SQL receipt denial, and invalid flag/bad password rejection.
- **Dependency limitation:** To avoid importing and retesting unchanged larger auth modules, two *locally authored synthetic stubs* stand in for `auth-contract.cjs` password verification and `core-contract.cjs` actor normalization. The actual modified `postgres-auth-service.cjs` and actual new test are SHA-exact; the two stubs are not original repo files. This is **source-bound focused unit QA with dependency fakes**, not complete repository integration/real scrypt/PGSQL qualification. Previous QA is not recycled as a new PASS.
- `node --check` for the source and test: syntax PASS. `PostgreSQL16 SQL compile/DDL/real role privilege/security isolation=NOT_RUN`; `Windows/Android E2E=NOT_RUN`; `HIOSKT 65-case money oracle=BLOCKED`.
- Source-only composition inspection confirms `team-settlement/team-composition.cjs` (blob `ff32a826ff90885b6d62b553d248882a2445204d`) does not pass the optional flag. No changes to HTTP routes, role grants, migration list, production, main or PR #6.

## Remaining mandatory gates for production

1. Independent security authority review and approved key custody, DB verifier, function owner/crypto/default ACL, source-to-SQL canonical envelope matching, handle lifetime/revocation and key rotation. Currently BLOCKED.
2. No direct tenant reads for untrusted Ledger roles; full read-surface replacement without breaking scope/counterparty/changefeed APIs; real PG16 scratch grant verification, tenant GUC spoof/role abuse, concurrent logout and lost-commit probes. Currently NOT_RUN.
3. Secure Auth login handle migration/issuance qualification on real **disposable C:-only supervised PostgreSQL16** after design review. Check legacy sessions, collision/unique index, SQLSTATE and rollback tags, no leaked handle in HTTP or logs, and safe timeouts. Currently NOT_RUN.
4. Real Windows/Android recovery and HIOSKT/operator financial oracle, independent reviewer/end-user approval before any write release. Currently NOT_RUN/BLOCKED.

`STATUS=BLOCKED_SECURITY_DESIGN`; `WRITE_BLOCK=ENABLED`; `RELEASE=NO_GO`; `PRODUCTION_MUTATION=NONE`; `GITHUB_CI=NOT_RUN`; `COST_USD=0`. No real customer or financial data, new deployed databases, production writes, E:/F: access, CI trigger, merges or deployments.

## 2026-11-04: actual durable Auth-service V2 callback integrated but default OFF

Prior record above remains source-specific to the earlier login-handle candidate. This update is a separate batch with base `2f2e5e293a2b1311416dd2c9906bbc266d57de2a`.

`team-settlement/postgres-auth-service.cjs` now imports the already reviewed/tested candidate `createReceiptV2AuthBoundary` and **exposes `authorizeReceiptRead` only when the existing `receiptV2SessionHandleEnabled` configuration is explicitly true**. When absent/false, the Auth service object retains the exact original method list, and the actual `team-settlement/team-composition.cjs` still constructs it without the flag. No HTTP handler, Ledger repository, migration, secret storage, permission, production or financial mutation is changed. The opted-in method opens a fresh Auth transaction, checks persisted session handle and membership, and invokes only an internal server callback; it **does not establish** secret custody or ledger transaction atomicity.

New `tests/settlement-receipt-v2-real-auth-wiring.test.cjs` verifies: default-off method absent; opted-in Auth→proof fixture→verify fixture success; revoked/missing/viewer membership or mismatched DB tenant blocks access to injected signer key. An initial local test run failed because the test erroneously referenced an undefined variable `role`, not because of the application implementation; fixed in the local test before GitHub commit and reran.

**Source-bound focused QA:** Linux Node.js 22.16.0 in isolated `/mnt/data/settlement_v2_integration_batch`. Actual changed source Git blob `ff018a51b08bc4607acbe47337ede10707522c7b` and new test blob `b5975a0fe79e3e5382b32b060d4a8b8326ab5117` both match SHA-exact GitHub files. `node --test tests/settlement-receipt-v2-real-auth-wiring.test.cjs tests/settlement-v2-login-handle-flag.test.cjs` = **7 PASS, 0 FAIL, 0 SKIP**. The second test file was unchanged from the prior qualification, but was included because the modified Auth source makes a new dependency combination.

**Limitations:** Original unchanged `auth-contract.cjs` and `core-contract.cjs` are represented by local synthetic stubs in this focused container; test transactions and signer/key/verifier are synthetic. This is not a full unmodified-repository/native scrypt, actual PostgreSQL16 or production security test. GitHub Actions/Windows QA/real tenant/session isolation and HIOSKT operator money oracle remain NOT_RUN. No user Windows C: execution occurred. The PostgreSQL16 candidate `receipt-v2-session-handle.sql` remains unapproved/unexecuted.

**Blocking release decision:** Independent authority/key management/owner crypto and all Ledger direct-read closure remain unapproved. No reviewed SQL V2 verifier, no actual revocation concurrency proof, no actual PG catalog tenant isolation, no HTTP/Android end-to-end acceptance. `WRITE_BLOCK=ENABLED; RELEASE=NO_GO; PRODUCTION_MUTATION=NONE; COST_USD=0`.
