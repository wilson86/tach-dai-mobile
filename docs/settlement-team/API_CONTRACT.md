# Team Settlement — API/transaction contract (M0 only)

**No endpoint in this document is deployed.** v0 proposal for 10–30 human accounts, distinct from counterparties.

## Trusted request processing sequence
1. Rate limit and cap request bodies. TLS, session signing/expiry/revocation and CSRF security MUST be implemented before network exposure. The synthetic `team-settlement/auth-contract.cjs` plus `auth-http-contract.cjs` cover password hashing, opaque expiry/revocation, active-membership resolution and bounded JSON routes only; they are not a deployed HTTP provider or persistent identity store.
2. Resolve logged-in human `user_id` and workspace through server session and an **active membership query** (client may suggest a workspace, never assert role).
3. Begin PostgreSQL transaction; `SET LOCAL kts.workspace_id = <verified workspace>`. RLS is defense in depth; verify object ownership and role explicitly.
4. Parse and validate the request, reject unknown fields/roles/monetary server-derived amounts. Check KQXS verification/parser build and effective-dated partner configuration as required.
5. For mutations: `Idempotency-Key` scoped to tenant + canonical request digest; replay same key and digest returns immutable saved receipt, different digest returns 409. Check `revision` CAS; mismatch returns 409 `TEAM_REVISION_CONFLICT`.
6. Update state exactly once; insert append-only event and receipt in **one transaction**; rollback on any failure. Server timestamp, event ID and financial calculations are generated on the server. Separate `CLOSED` vs `PENDING_REVIEW`.
7. Response includes `workspace`, `scope`, `new_revision`, `event_id`, `sync_status` and change cursor. No PII/full raw messages in default logs.
8. A client with dropped response resends same idempotency key: never creates second event. Reactivation after offline must revalidate member rights and state.

## Suggested error and evidence semantics
- `401 TEAM_ACTOR_UNVERIFIED`, `403 TEAM_ROLE_DENIED/TEAM_WORKSPACE_DENIED`
- `409 TEAM_REVISION_CONFLICT/TEAM_IDEMPOTENCY_CONFLICT`, `423 TEAM_CLOSED_OR_PENDING_IMMUTABLE`
- `422 TEAM_SCOPE_INVALID/TEAM_KQXS_UNVERIFIED/TEAM_PARSER_UNVERIFIED`
- `503 TEAM_BACKEND_UNAVAILABLE`, no fallback to local client-money approval.

**Notes:** No direct production Telegram dispatch; no implicit HIOSKT algorithm copying. KTS uses its independently implemented verified engine; 65 authentic cases and independent oracle are still missing. M0 pure contract checks are not a substitute for authenticated HTTP, correct SQL transaction behavior or human authorization.
