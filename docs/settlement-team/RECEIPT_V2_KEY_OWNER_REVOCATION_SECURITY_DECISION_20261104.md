# KTS Settlement — receipt V2 verifier, key custody, owner ACL and revocation decision
Date: 2026-11-04. Source branch `codex/settlement-v2-expiry-delay-review-20261104`.
STATUS: **DESIGN_PROPOSAL / INDEPENDENT_APPROVAL_REQUIRED / NO_GO**.

This record supports review of the **unexecuted** `team-settlement/candidate/session-bound-receipt-read-v2.sql`. It does **not** authorize running that SQL, provisioning keys, granting EXECUTE, connecting PostgreSQL, merging, deploying or unlocking any financial write. V1 must remain rejected because its key is derivable from bearer/session hash.

## Exact proof format (must pass independent JS ↔ PostgreSQL byte-parity tests)

Purpose is ASCII `kts-receipt-read-v2`. HMAC-SHA256 uses a 32-byte **independent** backend-origin symmetric key. Binary message is the UTF-8 bytes of fields prefixed individually by the number of UTF-8 bytes written in ASCII decimal, then ASCII colon, then the original value, all concatenated with no separators between fields. Field order:

`purpose, key_id, session_handle, workspace_id, user_id, number_of_keys, each_key_in_ascending_order, nonce, issued_at_seconds, expires_at_seconds`.

`key_id` is 16 lowercase hex, `session_handle` is a server-only random 32 lowercase hex identifier indexed uniquely in `kts_auth.sessions` and **not** based on a bearer, `nonce` is 32 lowercase hex, list of 1–30 *sorted unique* `draft_`+32-lowercase-hex idempotency keys, and timestamps are decimal epoch seconds, bounded to a maximum lifetime of 30 seconds. `workspace_id` and `user_id` are nonempty ASCII `[A-Za-z0-9_-]` keys. HMAC digest is 64 lowercase hex. No additional normalization, locale conversion, delimiters or escaping may be introduced in either implementation. Compare with the existing `tests/fixtures/receipt-backend-proof-v2.cjs` vector source.

The SQL candidate independently looks up `session_handle`, checks active session expiry/revocation, resolves membership and disabled-identity status *from database rows* and never authenticates an actor/tenant from client-controlled `kts.workspace_id` or role GUC. It resets transaction-local tenant from verified session. The real Auth callback remains backend-only; browser cannot request that function with arbitrary identity/proof fields.

## Required key origin and custody (none provisioned)

**Proposed custody:** the trusted Auth signer reads its randomly generated 32-byte key from an operator-managed protected secret backend, never from the bearer, session hash, URL, repository, GitHub Actions, browser local storage, request headers or logs. The SQL verifier must have access to corresponding key material through a **separately owned** private PostgreSQL storage table `kts_auth.receipt_v2_verifier_keys`. Proposed schema contract (NOT an executable migration):
- `key_id text UNIQUE NOT NULL` (16 lowercase hex)
- `secret_bytes bytea NOT NULL` (exactly 32 bytes)
- `activated_at timestamptz NOT NULL`
- `stop_verify_at timestamptz NOT NULL`
- `revoked_at timestamptz NULL` (revocation timestamp).
- Check that activation precedes stop_verify, and prohibit blank/malformed IDs and secrets. Index by key ID. Key bootstrap is an independently approved operator-only transaction; no key material in GitHub or code comments.

**Custody tradeoff:** symmetric SQL verification means the verifier database necessarily holds a copy of the signing key or access to it; privilege compromise, backup exposure, logical dumps, SQL error/parameter logs and privileged SQL insiders become key theft risks. The design does NOT cryptographically prove that PostgreSQL itself cannot sign. If this threat is unacceptable, independently review asymmetric signatures and a vetted PostgreSQL verifier extension rather than silently accepting this symmetric design.

**Rotation:** new key IDs must be issued only from the trusted secret authority, with distinct sign/verify activation. Retire old signing keys, then remove verifier access only after outstanding proof TTL plus verified clock skew; *immediate revoke* must deny previously signed proofs, and emergency compromise may invalidate outstanding reads. No fallback to bearer-derived material and no provision of a default key. Operator key rollback must never reenable a revoked key. Key usage/key ID logs must not contain secret or proof.

**Owner/ACL:** independently qualify separate roles for (a) protected key-store owner, (b) non-login receipt function owner, (c) Auth signer login/pool and (d) Ledger runtime login/pool. The receipt owner has no LOGIN/SUPERUSER/BYPASSRLS/CREATEDB/CREATEROLE/role memberships, owns no session, receipt, membership or key table, has only necessary schema USAGE, column SELECT and audited `kts_crypto.hmac(bytea,bytea,text)` EXECUTE. The key-store owner alone may provision/rotate/revoke verifier keys. Ledger login has *only* explicitly approved function EXECUTE and schema USAGE; deny direct table AND column SELECT on receipts, events, session handles, key store and sensitive membership identities and all mutation of Auth tables, plus CREATE, BYPASSRLS, role inheritance and PUBLIC/default privileges. Confirm actual effective privilege sources using catalog queries on a disposable cluster. Neither candidate SQL nor this document creates users or GRANTs.

**Direct Ledger read caveat:** existing `getScope`, `listCounterparties`, `getChanges`, `lookupRecoveryReceipts` and `inActorTransaction` directly access tenant/identity tables. Removing SELECT without protected replacements breaks the application, whereas leaving it makes a forged tenant GUC dangerous. Do not approve **system-wide** isolation until all Ledger read paths are covered by audited backend authorization or narrow functions and API contracts remain unchanged.

## Revocation linearization and expiry

The V2 SQL candidate uses `FOR SHARE` to hold a session row and membership/identity rows until its *own Ledger transaction completes*. It requires an explicitly **READ WRITE** transaction (even though it performs no persistent write) because PostgreSQL READ ONLY forbids `FOR SHARE`. This is a proposed tradeoff, not reviewed runtime behavior. Auth's earlier transaction locks do **not** span the Ledger transaction. A committed revoke **before** the Ledger's locking read begins must deny. A concurrent revoke may wait for the read to finish; a proof can be used in a transaction that linearizes *before* the revoke, even if the HTTP response follows revocation. A revoke that commits after a qualifying read started is not guaranteed to cancel the already-produced result. Confirm actual `FOR SHARE` / `UPDATE` conflict, lock wait, session expiry **before and after lock wait**, before and **after query delay**, membership revoke, identity disable, isolation and ledger-role RLS as independent PostgreSQL16 probes. Do not assert stronger guarantees than those tested.

No write, settle, resend, auto-retry or financial mutation is permitted by this receipt reader. A timed-out/lost response stays UNKNOWN and `auto_retry=false`. A nonce is signed but **not persisted**: identical reads are replayable until expiry and rotation/revocation; never claim replay resistance without a stateful nonce table and reviewed concurrency semantics.

## Blockers / go-no-go worksheet

| Gate | Authority | Status |
|---|---|---|
| Actual protected signer/key distribution + rotation | Independent security reviewer | NOT_IMPLEMENTED / NOT_APPROVED |
| SQL `candidate_receipt_read_v2` syntax and JS/HMAC byte parity | PG16 synthetic with exact SHA | NOT_RUN |
| PG function owner, crypto provenance, PUBLIC/default ACL and real role separation | Independent reviewer + PG16 catalog probes | NOT_RUN |
| Auth/Ledger revocation locks and expiry ordering | PG16 synthetic concurrent sessions | NOT_RUN |
| All Ledger direct reads, RLS and tenant GUC forgery denial | Real-role PG16 probes | NOT_RUN |
| Window/Android failure recovery, HIOSKT 65-case money oracle | Product/end user | NOT_RUN |
| Production | Project release gate | **NO_GO**, `WRITE_BLOCK=ENABLED` |

**Review request:** Independent reviewer must explicitly record acceptance or rejection of (1) symmetric-key exposure threat model, (2) session/role authority, (3) SQL ownership and full read-path replacement, and (4) revocation linearization. Self-review, fixture PASS and document publication are never approval.

**COST_USD=0.** No secrets or customer data created, SQL NOT_RUN, no deploy/merge/production mutation, E:/F: prohibited.


## Confirmed design contradiction — FOR SHARE vs SELECT-only owner (2026-11-04 follow-up)

**HARD BLOCKER `OWNER_ROW_LOCK_PRIVILEGE_CONFLICT`:** The candidate V2 SECURITY DEFINER function currently performs `SELECT ... FOR SHARE` on `kts_auth.sessions` and `FOR SHARE OF m,i` on `kts_team.memberships` and `kts_team.identities`. The owner contract above grants the function owner *only column SELECT*, not UPDATE. PostgreSQL 16's official privileges reference states that **both FOR UPDATE and FOR SHARE require UPDATE privilege on at least one column in addition to SELECT**. Source: PostgreSQL 16 §5.7 Privileges, https://www.postgresql.org/docs/16/ddl-priv.html. Therefore, even a correctly deployed key table and valid proof cannot make this candidate work under its declared SELECT-only owner privileges. The previous static tests did not detect the mismatch. This is a **source-level confirmed incompatibility**, not a proven PostgreSQL error on this SHA (PG16 remains NOT_RUN).

The same issue applies to any other caller or function owner that executes these row locks. It must not be silently "fixed" by granting UPDATE to the Ledger runtime or SECURITY DEFINER owner: that expands mutation capability on sensitive session/membership/identity tables and can break the zero-write threat model. **Do not provision/grant UPDATE or deploy this SQL as a workaround.**

Design choices for independent review (NONE APPROVED):

1. **Strong serialized revocation:** restructure to use a separately isolated, trusted transaction/authorization service with an explicit narrow locking authority; prove that this authority can never be invoked to mutate financial or Auth tables by the Ledger/runtime role. Catalogue every UPDATE column grant and RLS behavior, including `SECURITY DEFINER` compromise scenarios. The existing Auth lock on a *different connection* is not atomic with Ledger read.
2. **Strict SELECT-only owner:** remove row-locking and establish a weaker, explicitly documented revocation guarantee with double-check before/after query and independent timeout/recovery policy. Concurrent revoke may still race and must not be called linearizable or production-ready without acceptance.
3. **Mutually held advisory transaction locks:** only if both the read path AND all logout/membership/identity revocation paths are redesigned to acquire the same backend-controlled locks and separately proven on real PostgreSQL. An advisory lock used by only one side provides no guarantee.

The security reviewer must choose a coherent privilege/locking model and approve it explicitly. The selected model requires exact source changes and real PostgreSQL16 proof before removing this blocker. **`WRITE_BLOCK=ENABLED`; `PG16=NOT_RUN`; `RELEASE=NO_GO`.**


## 2026-11-04 — Two V2 SQL verifier candidates now available for independent decision

There are **two mutually exclusive, review-only** alternatives, and **neither is approved or production-ready**:

| Contract dimension | Locked variant | SELECT-only variant |
| --- | --- | --- |
| SQL | `team-settlement/candidate/session-bound-receipt-read-v2.sql` | `team-settlement/candidate/session-bound-receipt-read-v2-select-only.sql` |
| PostgreSQL owner privileges | `SELECT ... FOR SHARE` requires at least one column `UPDATE` on each locked table in addition to `SELECT`; conflicts with declared owner ACL | No `FOR SHARE`; can be evaluated against select-only owner plan |
| Revocation | Proposed row-lock ordering *only within its own SQL transaction*; does not protect HTTP after commit | No revocation serialization. Adds a post-`RETURN QUERY` session, membership and identity recheck; **cannot** prevent revoke after the last check |
| Data mutation | No intended persistent writes, but broader `UPDATE` authority would be necessary | No intended persistent writes and no extra UPDATE grants |
| PostgreSQL16 compile / ACL / concurrency | **NOT_RUN** | **NOT_RUN** |
| Independent review / release | **NOT_APPROVED / NO_GO** | **NOT_APPROVED / NO_GO** |

**Design choice explicitly deferred to independent security review.** If strict revocation ordering is required, SELECT-only is not an acceptable substitute; designing a protected serialization mechanism that both the read function and *all* revocation paths participate in is mandatory, and the application write path must remain blocked until qualified. Do **not** silently switch the live program to SELECT-only.

What has actually been proven here is only the **source shape**. A new `tests/settlement-receipt-v2-select-only-design.test.cjs` test records that the alternative has a separate function name, no lock clauses or GRANTs, and a second nonlocking session/membership/identity check after `RETURN QUERY`. It cannot prove SQL syntax, true PostgreSQL permissions, key storage or crypto byte parity. On this branch, 4 static assertions ran using isolated V8 **mock Node adapters**, not native Node/PG16; note this distinction in every downstream QA report.

Required independent review verdict fields:
`REVIEWER_ID`, `REVIEWED_SOURCE_SHA`, `SELECT_ONLY_RACE_ACCEPTED` (or `DENIED`), `LOCKING_OWNER_UPDATE_AUTHORITY_ACCEPTED` (or `DENIED`), `KEY_CUSTODY_APPROVED`, `COMPLETE_LEDGER_READ_SURFACE_APPROVED`, `POSTGRES_QUALIFICATION_PLAN_APPROVED`, plus evidence URLs and expiry date. Leave all fields `UNREVIEWED` until an actual independent reviewer provides them. Generic owner delegation does not substitute for independent evidence.

**Only after this approval:** supervised disposable C:-only PostgreSQL16 native compile/cross-tenant privilege/concurrency QA, and then actual Windows/Android financial acceptance; no Actions billed, live write or deployment. `RELEASE=NO_GO; WRITE_BLOCK=ENABLED; COST_USD=0`.

## 2026-11-04 — backend signer candidate with independent-key-provider seam (default OFF)

**Implementation added:** `team-settlement/candidate/receipt-v2-trusted-signer.cjs`. This is a *working Node crypto implementation* behind `enabled=false`, but is neither wired to HTTP/production nor evidence of a protected production key store. `createReceiptV2TrustedSigner({auth,keyProvider,clock,nonceSource,enabled})` accepts the real durable Auth service's backend-only `authorizeReceiptRead` contract and calls `keyProvider.currentSigningKey()` **only within the DB-verified Auth callback**. It checks actor role, random server-held handle, exact ascending receipt keys, TTL 1–30 seconds, key identity and rotation metadata, 32-byte secret size, activation and stop-sign/stop-verify boundaries, and a 16-byte random nonce. It produces the V2 UTF8-length-prefixed HMAC-SHA256 envelope and copies/zeroizes its temporary key buffer. The provider's own key is never altered or returned in a JSON envelope.

**Zero-trust callback shape:** It rejects a fake Auth adapter that skips the signer callback, calls it multiple times, or substitutes a copy/forged return value. It does not treat an injected `server_verified` boolean as a credential — the *external Auth dependency* must be the independently verified DB-bound Auth service. A synthetic injected auth is useful only for local tests. No signer HMAC key is ever derived from the bearer or session hash. This code is unprivileged application logic, not a PostgreSQL SQL verifier or a deployment secret-management system. The provider must be implemented, reviewed and provisioned independently before `enabled=true` is considered.

**Native SHA-bound evidence:** Linux Node `v22.16.0`, `node --check` of both new files and `node --test tests/settlement-receipt-v2-trusted-signer.test.cjs` on exact locally generated source → **6 PASS, 0 FAIL, 0 SKIP, exit 0**. GitHub blobs equal `git hash-object` of those executed local source files:
- `team-settlement/candidate/receipt-v2-trusted-signer.cjs`: `b2094c710580547a287a015e74f24bf529e0fc80`.
- `tests/settlement-receipt-v2-trusted-signer.test.cjs`: `be48db9541302db28c18f444cca1c4fef9f1d498`.

Tests cover exact canonical HMAC bytes independently recalculated with Node crypto, default OFF, invalid bearer/keys/TTL, missing authority, revoked or expired key, nonoperator role, incorrect nonce, and forged/multiple/skipped Auth callback. **These tests do not exercise real session verification, PostgreSQL key custody, actual SQL HMAC parity or cross-tenant protection.** The official SQL verifier alternative and SQL key table are still unapproved and NOT_RUN. This batch creates no runtime activation, no migrations, no GRANTs, no production mutation or customer financial writes.

**Unchanged blocker:** Independent review of symmetric key custody, SQL verifier privileges, revocation model and complete Ledger direct tenant SELECT closure remains required. PostgreSQL16 live synthetic tests, Windows/Android recovery and 65-case HIOSKT operator oracle remain NOT_RUN. `WRITE_BLOCK=ENABLED; RELEASE=NO_GO; COST_USD=0`.

## 2026-11-04 — verifier-key table schema contract (review-only, rollback-only)

`team-settlement/candidate/receipt-v2-key-store-review.sql` is a **candidate schema sketch only**. It cannot provision a trusted key, and a direct `psql -f` against it ends with `ROLLBACK`, not `COMMIT`. Do not execute it against a live database anyway. It contains no key bytes, CREATE ROLE, GRANT, runtime feature switch or migration-list change.

The proposed table `kts_auth.receipt_v2_verifier_keys` has a lowercase 16-hex primary key ID; exactly 32-byte `bytea` secret; activation, stop-signing and stop-verification timestamp metadata; optional revocation timestamp; and internal ordering constraints. `stop_signing_at` is deliberately a distinct field from `stop_verify_at` so a retired key can continue to verify in-flight short-lived proofs during a separately approved grace window. The Node candidate's protected `keyProvider.currentSigningKey()` interface uses millisecond epoch metadata derived by a future trusted provider; the SQL uses PostgreSQL `timestamptz`. The conversion layer and clock-skew bounds are NOT implemented or approved.

**Design and operational blockers retained:** Storage of raw HMAC key material in PostgreSQL entails privileged SQL/backup/log exposure. An independent security reviewer must review an acceptable threat model, approved key provisioning, rotation and destruction, exact table owner/function owner grants, PUBLIC/default/inherited privileges, crypto extension provenance, and whether symmetric shared keys are acceptable at all. No sensitive data or secrets may be committed to this repo.

**Native source test:** `node --test tests/settlement-receipt-v2-key-store-review.test.cjs` on Linux Node v22.16.0, **3 PASS/0 FAIL/0 SKIP**, source-exact Git blobs SQL `88bc12cc748c6e34c6b060a8fec1c671b35cde58`, test `f9226116086178c7a1f4a1d1e3e9727749fbcad4`. This is only static schema/config guard QA, **not** PostgreSQL syntax compilation, key custody evidence or runtime security qualification. The SQL has not been executed on PostgreSQL; release still `NO_GO`, `WRITE_BLOCK=ENABLED`, `COST_USD=0`.

## 2026-11-04 — verified signer time-of-check/time-of-use defect, regression, fix

**Actual candidate source bug reproduced before fix:** `createReceiptV2TrustedSigner` previously captured `now` **before** `await keyProvider.currentSigningKey()` and returned the signed envelope without a post-`await auth.authorizeReceiptRead()` time check. When the protected key authority took longer than the receipt TTL, it could issue a proof whose `expires_at` had already passed. A key that had stopped signing during the wait could also be signed with stale `now`. A slow Auth post-callback step could similarly return an expired envelope. This is a **reproducible local candidate bug**, not evidence of any actual deployed production exploit; this candidate is still disabled/unwired.

**Red/green evidence bound to exact files:** Isolated Linux Node.js `v22.16.0`; work folder `/mnt/data/settlement_v2_signer_race_fix` created by copying exact GitHub blob hashes from previous signer review. Added 3 synthetic-clock regression cases against pre-fix source: delayed 25s key retrieval, 30s delay between completed callback and Auth return, and a signing key that expires after a 45s key-fetch wait. Command `node --test tests/settlement-receipt-v2-trusted-signer.test.cjs` on pre-fix source: **6 PASS, 3 FAIL** (all 3 expected-new tests, proof of the defect). After fixing the candidate source, command `node --check team-settlement/candidate/receipt-v2-trusted-signer.cjs && node --check tests/settlement-receipt-v2-trusted-signer.test.cjs && node --test tests/settlement-receipt-v2-trusted-signer.test.cjs` = **9 PASS, 0 FAIL, 0 SKIP**, exit 0. Final exact GitHub blob hashes equal local `git hash-object` values:
- signer `75a97a559fbe4c641c62fa75aff64bf19c5dd7b4`;
- regression `00c8e7d78ec5fc9467efcf0d97e101c69cb62c2e`.

**Patch behavior:** capture signing timestamp **after** asynchronous protected-key retrieval; deny backwards/invalid clock and overflowing TTL; compare key activation/stop-signing/verification windows with that refreshed timestamp; recheck after signing/HMAC to deny stale proofs; and recheck after the Auth callback settles before returning an expired envelope. These checks prevent the three reproduced delay defects in the candidate without enabling any runtime feature, source SQL migration, SQL function or production mutation.

**Residual mandatory security gates (unchanged):** Native Node test uses synthetic injected Auth and key provider; it does NOT establish real protected key custody, actual Auth session expiry across transaction boundaries, SQL/JS HMAC parity on PostgreSQL16, SQL owner grants, role/tenant isolation, concurrency semantics, signer revocation after issuance, or external security review. The previously recorded locked-variant UPDATE privilege and nonlocking-variant revocation race remain unresolved. Keep `WRITE_BLOCK=ENABLED`, `RELEASE=NO_GO`, `COST_USD=0`.

## 2026-11-04 — Disabled signer-to-verifier receipt read bridge (not deployable)

Added `team-settlement/candidate/receipt-v2-read-bridge.cjs` (Git blob `6a507ca8c6186ca7b9431f5b95f2ec191002cf45`). This is **default OFF**, backend-only and has no Pool, secret bootstrap, route, migration or production activation. It accepts a *protected* `signer.signReceiptRead({bearerToken,keys})` and injected `ledgerDb.transaction`, calls **only** the proposed SQL function `kts_team.candidate_receipt_read_v2` with nine parameterized envelope fields, and never executes direct tenant-table SELECT. The SQL function does **not** exist in a deployed migration and cannot be called before independent SQL/key/owner approval. The candidate read bridge is therefore integration source for review, not a working live recovery API.

The bridge checks envelope framing, key ordering, signer identity and TTL at issuance, after connection acquisition, after the function query, and after transaction settlement. It verifies returned rows belong to the signed workspace, actor and exact requested idempotency keys, rejects duplicated/foreign/malformed receipt rows, freezes response, and does not infer SYNCED from an empty read. Missing or uncertain database outcomes propagate failures; **no automatic retry**, no mutation or customer-money state change. **It does not itself verify HMAC cryptographically**: the *not-yet-approved* PostgreSQL verifier must recheck HMAC and live session/member/tenant independently, and any compromised signer/SQL-owner would defeat this boundary. This row-level validation is defense in depth, not source of database authority.

**Source-bound native Node QA:** Isolated Linux Node 22.16.0, exact GitHub blob-matched source under `/mnt/data/settlement_v2_read_bridge_batch`: bridge `6a507ca8c6186ca7b9431f5b95f2ec191002cf45`, new test `92c979945df2dc030b07431ce002311b579b428b`, unchanged signer `75a97a559fbe4c641c62fa75aff64bf19c5dd7b4`. Executed `node --check` on bridge + test and `node --test tests/settlement-receipt-v2-read-bridge.test.cjs`: **7/7 PASS, 0 FAIL, 0 SKIP**, exit 0. The tests exercise real V2 signer/HMAC JavaScript with synthetic injected Auth and Ledger transaction, checking default OFF, no write SQL, cross-tenant/actor result rejection, duplicate rows, zero-row UNKNOWN, delayed connection/query/commit TTL and lost COMMIT without retry. **NOT real PostgreSQL verification, security sign-off, Windows/Android QA or financial oracle.**

**Operational limitation:** The locked SQL target still conflicts with the declared SELECT-only function owner because `FOR SHARE` requires UPDATE; SELECT-only alternative has unresolved revocation race. There is no protected key provisioning, approved SQL function, real catalog/crypto parity test or complete Ledger read-surface isolation. `WRITE_BLOCK=ENABLED`; `RELEASE=NO_GO`; `COST_USD=0`. Do not wire the bridge into HTTP or production until gates are independently closed.

## 2026-11-04 — Receipt V2 read-bridge row projection hardening

**Source-level bug reproduced (disabled candidate, not a production incident).** The original `receipt-v2-read-bridge.cjs` accepted any syntactically valid ID as `event_kind`, accepted impossible dates such as `2026-02-30`, and forwarded **all** properties of database adapter rows using `{...row}`. Therefore, a synthetic adapter returning an extra column could have that unexpected property returned to the caller rather than being rejected. The candidate was not wired to production, and no real database exposure has been demonstrated.

**Evidence:** Before fixing, using original bridge Git blob `6a507ca8c6186ca7b9431f5b95f2ec191002cf45` and appended synthetic regression probes, Linux native Node v22.16.0 `node --test tests/settlement-receipt-v2-read-bridge.test.cjs` produced **8 PASS, 2 FAIL**: the new extra-projection and invalid-event/date rejection probes failed as expected, while missing required field already rejected. Those are tests of the review-only candidate, not tests of real PostgreSQL.

**Fix:** For the exact 12-column SQL receipt result, deny extra/missing projection keys and explicitly build the returned immutable allowlisted object; reject unknown `event_kind` values not present in migration `001_team_ledger.sql`, and validate calendar date (including leap years). This prevents the reproduced adapter overprojection/invalid field outputs from crossing the Node result boundary. It does not replace the SQL verifier's required cryptographic, revocation, tenant and grants checks.

**Final SHA-bound targeted QA:** isolated Linux native Node v22.16.0, `node --check` bridge and test, then `node --test tests/settlement-receipt-v2-read-bridge.test.cjs`: **8 PASS, 0 FAIL, 0 SKIP**. Exact local `git hash-object` equals GitHub blobs:
- `team-settlement/candidate/receipt-v2-read-bridge.cjs`: `8ab45d6cf2c9ff6c1558624099670a19f2cec681`
- `tests/settlement-receipt-v2-read-bridge.test.cjs`: `fbddcec1c3eb7d98c26bec6b8c424f6c514c02fa`
- Unmodified real Node signer: `75a97a559fbe4c641c62fa75aff64bf19c5dd7b4`

**No production promotion:** The read bridge remains opt-in default OFF, no HTTP integration, no SQL V2 deployment, key provisioning, direct Ledger read isolation closure, independent reviewer or actual PG16 QA. `WRITE_BLOCK=ENABLED; RELEASE=NO_GO; COST_USD=0`.

## 2026-11-05 — Independent security review handoff OPEN (not approved)

The independently verifiable review decision has been separated from the long project discussion to [GitHub Issue #32](https://github.com/wilson86/tach-dai-mobile/issues/32), titled **KTS Settlement V2 — independent SQL owner, key custody and tenant isolation security decision (BLOCKED)**. The request is bound to source baseline `a308298b10d498dea614b15409c7a801e9b22a30` and links the two mutually exclusive SQL candidate contracts, key-store/crypto design, whole-Ledger tenant-read risk, and disposable PostgreSQL16 acceptance criteria.

**This issue is an unassigned request, not an independent review or approval.** There is no named independent reviewer, signed SHA-specific verdict, authorized grant/lock design, qualified key authority, or PostgreSQL16 isolation result. Opening the issue does not start a workflow, trigger CI, relax any release gate, or authorize changes to production. The next permissible implementation batch must first read the real review verdict and independently verify source HEAD drift; a self-authored assistant critique cannot fill in `REVIEWER_ID` or `DECISION=APPROVE`.

**STOP conditions:** `SECURITY_SIGNOFF=NOT_GRANTED`, `PG16=NOT_RUN`, `WRITE_BLOCK=ENABLED`, `RELEASE=NO_GO`, `COST_USD=0`. No merge, deployment, SQL/secret bootstrap, E:/F:, or live customer data.
