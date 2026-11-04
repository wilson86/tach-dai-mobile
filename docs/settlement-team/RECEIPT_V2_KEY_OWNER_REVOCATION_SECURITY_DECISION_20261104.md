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
