# KTS Settlement — Receipt authority and owner boundary security review
Date: 2026-11-04. Source reviewed: `b11e46c4667c82c827c80842c55eb7bd6f4ef203`.
Scope: Issue #5; `team-settlement/candidate/session-bound-receipt-read-v1.sql`, `postgres-ledger-repository.cjs`, `postgres-auth-service.cjs`, migrations 001/003 and existing synthetic grant/denial fixtures.

**Review decision: REJECT V1 FOR SECURITY QUALIFICATION; V2 DESIGN PROPOSAL ONLY.**
This is an independent *source-only technical review*, **not an independent operational sign-off** or authorization to run the SQL against an existing database. It is not evidence of PostgreSQL DDL compilation or effective-grant isolation. No migrations, runtime routes, production grants, write gates, or backend secrets are changed by this review.

## 1. Verified source findings

| ID | Evidence in source | Risk / required resolution |
|---|---|---|
| R1 BLOCKER | The V1 function derives `v_secret=s.session_hash`; `kts_crypto.hmac(...,decode(v_secret,'hex'),...)` signs using the SHA-256 of the bearer. `postgres-auth-service.cjs` computes `session_hash=SHA256(bearer)`. | Any holder of a bearer token can generate V1 proofs. It **does not attest that the trusted backend authorized the request**; a credential leaked to a lower-trust client would be sufficient. No claim of an actual leaked bearer or SQL injection is made. |
| R2 BLOCKER | `lookupRecoveryReceipts` still joins `kts_team.idempotency_receipts` and `scope_events` with direct SELECT, and uses GUC-scoped RLS. | A compromised ledger SQL login with effective direct SELECT can forge the custom tenant GUC. The previously reported PostgreSQL synthetic diagnostic confirms this threat model, but not an operational exploit. A function alone cannot resolve it while grants remain. |
| R3 BLOCKER | Candidate owner preconditions disallow LOGIN, BYPASSRLS, special role powers and direct memberships; scratch catalog has not been run. | Actual effective grants, column rights, owner table ownership, schema privileges, extension/function ACLs, future default ACLs, and impersonation paths remain unverified. |
| R4 BLOCKER | Candidate uses a READ ONLY transaction, no row locks; `withVerifiedSession` holds `FOR SHARE` in a separate auth transaction. | Session or membership revoke can race a receipt read / HTTP reply. A second HTTP check does not establish atomic ordering. Define and prove precise revocation semantics, including connection failure and pooled reuse. |
| R5 REVIEW | `WHERE encode(sha256(convert_to(s.session_hash,'UTF8')),'hex')=p_session_id` transforms the stored primary key per row. | No demonstrated indexed lookup by the proposed identifier; assess scan/DoS implications with PG EXPLAIN on synthetic volume. Do not pass raw bearer or database session hash to browser logs. |
| R6 REVIEW | Candidate sets `kts.workspace_id` only after checking session/proof, filters returned receipt rows by workspace and actor, and bounds keys before sorting. | Positive controls worth retaining. They are **not** sufficient to qualify authority, owner grants, or replay/revocation. |
| R7 REVIEW | An exact signed proof can be replayed until expiry. | State replay as allowed read-only behavior; never count it as replay prevention. Bind the signature to the exact key set, actor/session, audience and request purpose; a replay must not write or authorize a different actor/tenant/key. |

## 2. Proposed V2 authority boundary (design, NOT approved)

**Preferred design to independently review:** A true server-origin request envelope signed by a fresh, uniformly random **backend-managed signing secret**, **not derived from the bearer token, password verifier or session_hash**. Only the backend signing component and a separately privileged DB verifier may know the symmetric verification key; this is *not* an assertion that the secret is exclusively held by the backend. The browser, Ledger LOGIN and ordinary Auth application SQL roles must not be able to read/derive it.

1. At the HTTP boundary, verify the bearer using the authoritative Auth session and current membership. Accept no browser-supplied proof, session hash, claimed actor, custom tenant GUC or signing key.
2. Generate the proof only in backend code *after* successful authentication, with purpose/audience `kts-receipt-read-v2`; bind version, key ID, session identifier, workspace, user ID, canonical ordered unique receipt keys, fresh random nonce, issue time and short expiry. Use unambiguous length-prefixed encoding or a fully specified canonical serialization with identical Node/SQL test vectors. Never sign arbitrary client fields without independent validation.
3. The SQL verifier must be a narrow `SECURITY DEFINER` owned by a reviewed non-login role. It derives the authoritative user, workspace and active role from the session table rather than trusting claimed fields; validates HMAC using a privileged verifier key not accessible to the Ledger LOGIN, checks expiry, membership and identity, and returns only matching actor-owned receipts. The SQL function must not allow an attacker to choose a different audience or verifier key through untrusted schemas/functions.
4. Provision/rotate the verifier secret through a **separately reviewed** protected secret path; do not store it in source, GitHub issues, workflow logs, browser state, receipts, general application config, or unprotected DB tables. Review physical access, memory, backups and operator restart recovery. Use overlapping key IDs for bounded rotation if explicitly reviewed; revoked keys deny previously issued proofs.
5. Even with a genuine backend-only signer, a stolen recent proof may be replayable on an SQL connection until expiry. Its scope must remain one actor/tenant/key set and it must not be a bearer token. If the requirement is *database cannot hold signing material at all*, review an **asymmetric signature** scheme with a backend-held private key and rigorously verified PostgreSQL public-key verification support; do not introduce an unaudited extension or paid service.
6. Make the fresh design **default off** and isolated from current runtime until source review, independent security review, real scratch-DB proof, connection/transaction tests and HTTP recovery tests have passed. No user-money writes, automatic retry of UNKNOWN, or removal of WRITE_BLOCK.

**Rejected shortcuts:** retaining `session_hash` as signing key; simply renaming `p_proof`; relying on GUC-derived RLS alone; exposing a global verifier key to the Ledger SQL role; allowing the browser to submit a proof or sign user-controlled fields; adding `SECURITY DEFINER` while retaining direct SELECT on the untrusted role; replacing real security evidence with unit-test/mock PASS.

## 3. Least-privilege owner and crypto review plan (NOT grants)

| Principal | Necessary positive privileges to evaluate | Explicitly prohibited |
|---|---|---|
| Ledger LOGIN for receipts | `USAGE` on required schema and `EXECUTE` **only** on a reviewed V2 function; authenticated DB login, no inherited role privileges. | Any table/column SELECT on receipts, events, memberships, identities, sessions, credentials or verifier key; schema CREATE; ownership, BYPASSRLS, superuser, arbitrary EXECUTE/mutation, membership/SET ROLE into owner. |
| `kts_receipt_read_owner` | Non-login non-superuser, non-BYPASSRLS, no role memberships in either direction; strictly reviewed schema USAGE, column-limited SELECT for the required sessions/membership/identity/receipt/event fields, and explicit EXECUTE on the exact trusted `kts_crypto.hmac` overload. A protected V2 verifier-key read only if the approved symmetric design requires it. | Table owner of tenant/auth data, unrelated SELECT including `credentials.password_hash`, schema CREATE after isolated bootstrap, mutation grants, role inheritance, general crypto function invocation, public execution of function. |
| Protected verifier-key owner | Own/verifier key access only via audited bootstrap and narrow definer, no direct application access; identity and backup/audit boundaries must be documented. | Runtime Ledger or public/default ACL access, unexpected SET ROLE paths. |
| Auth runtime | Existing login/session validation only under its independently reviewed policy. | Exporting session hash or verifier-key material to client or general Ledger role. |

Check **effective** privileges from separately authenticated real SQL sessions, not just `pg_class.relacl`: schema USAGE/CREATE; table and column grants; inherited memberships; `PUBLIC`; `pg_default_acl`; `pg_proc.proowner/proacl/proconfig/prosecdef`; `pg_extension` ownership and `kts_crypto.hmac` resolution; `pg_has_role`; RLS FORCE and whether owners bypass through effective privileges. Review search_path and all referenced names, and who can replace any referenced function/operator. Construction/ALTER OWNER and any temporary schema CREATE rights must be audited as bootstrap events, not silently left on the owner.

**Important:** `kts_auth.sessions` has no RLS in migration 003. A verifier role with column SELECT on `session_hash` can read every session hash if the role itself is compromised; this is a privileged DB trust boundary. Prefer a random indexed session handle separated from the bearer-derived hash, rather than scanning a computed SHA-256 of every row. The table grants and verifier-store security require a separate design approval.

## 4. Required acceptance evidence — none of these are PASS today

1. **Independent design gate:** Reviewer explicitly accepts exact V2 proof schema, server-only signing invocation, key provisioning/rotation, privileged verifier store, scope/replay semantics and fallback plan. Approval must refer to exact source SHA and threat assumptions. Current status: `BLOCKED_UNAPPROVED_SQL_DESIGN`.
2. **Scratch-only PostgreSQL16 catalog gate:** Provision a new dedicated disposable C:-only cluster with watchdog, verified isolated port, synthetic roles and data. Prove no direct or column SELECT after forged tenant GUC, no public EXECUTE or owner impersonation, exact owner/crypto/default ACLs and function compilation. Store SQLSTATE, command tags and redacted catalog receipts. **NOT_RUN**.
3. **Scratch adversarial gate:** Before each negative test, the **same fixture** must demonstrate a valid positive control; prove wrong tenant/actor/key, expired/forged/replayed-to-different-fields proof, revoked session/membership/identity, viewer role, key rotation, no cross-tenant read, no surplus event or receipt, acknowledged COMMIT/ROLLBACK, no pooled GUC bleed, concurrent revocation and lost connection. Distinguish intentional same-request read replay from a security failure. **NOT_RUN**.
4. **Recovery/browser gate:** Browser/Android encrypted quarantine -> disconnect -> UNKNOWN -> restart -> authenticated HTTP read -> exactly matched receipt or UNKNOWN with `auto_retry=false`; no monetary mutation or background resend. Verify logs/proxy/backup/error reporter redact bearer/proof/verifier material. **NOT_RUN**.
5. **Release gate:** Independent security sign-off and approved HIOSKT money oracle, real end-user acceptance, explicit owner approval. Until then `WRITE_BLOCK=ENABLED`, `RELEASE=NO_GO`.

## 5. Reviewer / product decision

- **PM:** Prioritize resolution of R1/R2 and an independently reviewed minimum privilege design; avoid spending days repeating mocked denial fixtures after they pass on an unchanged SHA.
- **Security review:** Reject V1 authority as proof of backend origin. V2 is a **review proposal**, not a qualified remedy. Do not compile/deploy an unapproved SQL candidate to make CI green.
- **End user:** No real settlement write, shared production balance, or recovery release is available yet.

`SOURCE_SHA=b11e46c4667c82c827c80842c55eb7bd6f4ef203`; `DESIGN_SOURCE_REVIEW=COMPLETED_WITH_BLOCKERS`; `POSTGRES_DDL=NOT_RUN`; `PG_TENANT_PROOF=NOT_RUN`; `CI=NOT_RUN`; `WRITE_BLOCK=ENABLED`; `RELEASE=NO_GO`; `PRODUCTION_MUTATION=NONE`; `COST_USD=0`.
