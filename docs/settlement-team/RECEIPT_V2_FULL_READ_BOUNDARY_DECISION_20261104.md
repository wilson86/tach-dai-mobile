# KTS Settlement — V2 read-boundary closure and owner/key custody decision record

Date: 2026-11-04. **DESIGN_REVIEW_ONLY / NO RELEASE.**
Read-path source SHA: `b87bef2582f2215d3e1ccff6c63faf72846c5455` (new changes confined to test fixtures).
Source blobs independently read from GitHub: `team-settlement/postgres-ledger-repository.cjs` blob `4ee2d59cbcd6ff110fcf9fd06f7c7e39cf8c1095`; `team-settlement/postgres-auth-service.cjs` blob `fa1e12b9be227dd0e6c9a3a231d4598b18b373a3`.
Related: `RECEIPT_AUTHORITY_OWNER_SECURITY_REVIEW_20261104.md`, Issue #5, Draft PR #6 (older branch).

## Critical correction to the receipt-only proposal

**Closing only `lookupRecoveryReceipts` is NOT enough to establish a safe Ledger SQL trust boundary.**
A source-bound inspection confirmed the following direct SQL read paths in the same repository. The numbers are function-start lines in the cited source blob, not approved privileges.

| Authenticated component | Function (line) | Directly queried tables |
| --- | --- | --- |
| Ledger | `inActorTransaction` (74) | `kts_team.memberships`, `kts_team.identities` (authoritative membership recheck) |
| Ledger | `getScope` (307) | `kts_team.scopes` |
| Ledger | `listCounterparties` (326) | `kts_team.counterparties` |
| Ledger | `getChanges` (354) | `kts_team.scope_events` |
| Ledger | `lookupRecoveryReceipts` (404) | `kts_team.idempotency_receipts`, `kts_team.scope_events` |
| Auth | `login` (32) | `kts_team.identities`, `kts_auth.credentials`, `kts_team.memberships` |
| Auth | `withVerifiedSession` (68) | `kts_auth.sessions`, `kts_team.memberships`, `kts_team.identities` |
| Auth | `requireCurrentAdmin` (125) | `kts_team.memberships`, `kts_team.identities` |

These are *source-level paths*, NOT proof that every privilege is granted to each deployed database login. The existing synthetic GUC spoofing diagnostic covers a Ledger LOGIN with direct receipt SELECT, not all these methods or production configuration. Auth and Ledger credentials must be isolated; a breach of Auth SQL credentials is a separate high-privilege threat.

**No blind revoke:** Removing every table SELECT from the current Ledger runtime role without replacing all its read paths would break scope, change feed, partner directory, membership recheck and receipt recovery. Conversely, keeping direct SELECT on any security-sensitive tenant table while an untrusted login can choose `kts.workspace_id` still requires a documented containment or elimination plan. A dedicated receipt role alone does not establish *system-wide* tenant isolation.

## Review decision: independent backend-origin signing is necessary but insufficient

1. **Backend authority:** Only a trusted server component after a real database-backed session verification may request a short-lived proof. A caller-supplied `server_verified` boolean is not evidence. The test-only `authorizeReceiptRead` callback adapter in `tests/fixtures/receipt-v2-authority-admission.cjs` is not implemented by the production auth service; it does not create a trusted signing authority.
2. **Session handle:** Introduce a fresh server-generated random opaque session handle separate from the bearer and from SHA256(bearer). Store it in PostgreSQL with unique index and session association; do not return it to the browser. Until a reviewed schema/creation path exists, V2 server-to-SQL proof cannot be wired. Avoid deriving the HMAC key from the bearer.
3. **Proof key custody:** A 32-byte backend-managed secret and a separately protected SQL verifier secret may be shared through an explicitly audited, rotated bootstrap path. The Ledger runtime SQL role must not SELECT verifier-key storage. A `SECURITY DEFINER` verification function may read exactly the approved key and active session metadata, not credentials. Document provisioning, keys active/grace/revoked, expiry, backup masking, removal/rotation and operator recovery before granting EXECUTE.
4. **Owner boundary:** Non-login, non-superuser, no BYPASSRLS/CREATEDB/CREATEROLE/REPLICATION, no role memberships in either direction, no table ownership. Only exact schema USAGE; column-limited SELECT from approved session/membership/identity/receipt/event tables; approved EXECUTE on exact `kts_crypto.hmac` overload. Check effective grants, default ACLs, PUBLIC, `search_path`, function owner, extension owner and whether attacker-controlled database objects can be resolved.
5. **Full read surface:** Explicitly inventory and replace tenant-sensitive reads in Ledger with reviewed session-bound functions or a separately justified restricted session-scoped trusted service boundary. Preserve existing GET scope, partner directory and feed API semantics and test no cross-tenant reads after forged GUC in every affected path. The Auth API may retain narrowly reviewed credentials/session access on a distinct protected connection pool, not delegated to Ledger.
6. **Revocation ordering:** Declare an exact consistency contract: when revocation commits **before** an authorization query begins, deny; when transactions overlap, behavior must be separately specified and tested. A separate auth row `FOR SHARE` lock does not automatically protect an unrelated Ledger connection or transaction. If stronger order is required, design atomic session/read transaction semantics before integrating.
7. **Recovery:** Preserve `UNKNOWN` and `auto_retry=false` on missing/uncertain outcomes; absolutely no money mutation or re-send by this read function.

## Mandatory acceptance and evidence (all remain unqualified)

- Independently reviewed signing/key/session-handle design and exact owner/crypto/default ACL matrix. Current: **BLOCKED_DESIGN_REVIEW**.
- Fresh SHA-bound disposable PostgreSQL16 C:-only supervised DB, compiled SQL V2, indexed handle lookup, authenticated separate Ledger/Auth roles, effective catalog grants and synthetic positive controls. Current: **NOT_RUN**.
- Test denied direct table *and column* SELECT on every Ledger tenant-sensitive table after forged GUC. Test all allowed V2 functions as valid session and tampered tenant/actor/keys/proof/expiry/revocation, including membership/identity disable and concurrency. Current: **NOT_RUN**.
- Run actual browser/Android encrypted crash recovery, server-log/proxy/backup redaction, HIOSKT monetary oracle, independent security sign-off and human end-user review. Current: **NOT_RUN / BLOCKED**.

## Exact trust boundary of the test-only fixture

`tests/fixtures/receipt-v2-authority-admission.cjs` accepts a fake `auth.authorizeReceiptRead` callback and an injected `keyAuthority`; both are untrusted until independently provisioned backend code and deployment boundaries exist. The synthetic fixture now fails closed when authorization does not invoke the callback exactly once, invokes it repeatedly or returns a different signed object, including a forged shape-compatible object. These checks prevent **test harness bypass**, not runtime authentication bypass.

No production runtime path imports this design fixture, and no migration or runtime grant has been changed. Do not treat 6/6 local Node fixture PASS as PostgreSQL tenant isolation.

**Reviewer verdict:** Source design clarification/negative fixture complete. `V1=REJECTED`; `V2=DESIGN_ONLY`; `INDEPENDENT_SECURITY_SIGNOFF=NOT_GRANTED`; `POSTGRES_DDL=NOT_RUN`; `WRITE_BLOCK=ENABLED`; `RELEASE=NO_GO`; `PRODUCTION_MUTATION=NONE`; `COST_USD=0`.


## Executable source-risk census added (2026-11-04)

`scripts/settlement-read-surface-audit.cjs` is a **read-only local source diagnostic**, deliberately not a PostgreSQL security attestation. It scans only the actual Ledger and Auth repository implementation source files, inventories literal `FROM/JOIN kts_team.*` and `kts_auth.*` references by surrounding method, and returns:

- `BLOCKED_DIRECT_SQL_TENANT_READ` with exit code 2 whenever any known direct tenant read is present. This is an intentionally negative diagnostic. Running it successfully and observing exit 2 is **not** tenant isolation PASS.
- `REVIEW_REQUIRED_NO_STATIC_READS`, never security PASS, if the static scan finds none. Dynamic SQL, role/ACL policy and runtime auth could still be wrong.
- Fail-closed errors if either canonical source file is missing or an unrecognized `kts_team/kts_auth` table is encountered. This is a regex-based census, not a complete parser or evidence of effective DB grants.

On GitHub HEAD `6c1c77f81c7057c3aac830a07d070d8a87881034`, the static scan of fetched Ledger blob `4ee2d59cbcd6ff110fcf9fd06f7c7e39cf8c1095` and Auth blob `fa1e12b9be227dd0e6c9a3a231d4598b18b373a3` found **16 direct FROM/JOIN clauses over 9 methods**, including Auth `manageMembership` not listed in the original eight-path inventory. These are *read references*, NOT 16 proven credential access violations.

The isolated local Node 22.16.0 test `node --test tests/settlement-read-surface-audit.test.cjs` has **4/4 PASS** using two **synthetic source-shaped stand-ins**; both test and audit script are exact GitHub blob-byte matches (`580a4c436b0148e8ee3dfdfeff0ca7548c35d7f3`, `994b9c5d4259dc7ce123a811a0b22970ace9b18b`). Because direct Git clone is blocked in the local container, full native test against the entire actual repository checkout is **NOT_RUN**. The actual GitHub source text was separately inspected through the connector; no claim of native full-checkout QA is made.

**Operational rule:** Do not revoke direct SELECT in production until every affected Ledger read path has a reviewed replacement and regression evidence. Do not mark tenant security PASS merely because this diagnostic correctly reports BLOCKED. No runtime, SQL migration, deployment or write gate changed.
