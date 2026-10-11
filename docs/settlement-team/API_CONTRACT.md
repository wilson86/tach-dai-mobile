# Team Settlement — API/transaction contract (M0 only)

**No endpoint in this document is deployed.** v0 proposal for 10–30 human accounts, distinct from counterparties.

## Trusted request processing sequence
1. Rate limit and cap request bodies. TLS, session signing/expiry/revocation and CSRF security MUST be implemented before network exposure. The synthetic `team-settlement/auth-contract.cjs` plus `auth-http-contract.cjs` cover password hashing, opaque expiry/revocation, active-membership resolution, bounded JSON routes and failed-login rate limiting only; they are not a deployed HTTP provider or persistent identity store.
2. Resolve logged-in human `user_id` and workspace through server session and an **active membership query** (client may suggest a workspace, never assert role).
3. Begin PostgreSQL transaction; `SET LOCAL kts.workspace_id = <verified workspace>`. RLS is defense in depth; verify object ownership and role explicitly.
4. Parse and validate the request, reject unknown fields/roles/monetary server-derived amounts. Check KQXS verification/parser build and effective-dated partner configuration as required.
5. For mutations: `Idempotency-Key` scoped to tenant + canonical request digest; replay same key and digest returns immutable saved receipt, different digest returns 409. Check `revision` CAS; mismatch returns 409 `TEAM_REVISION_CONFLICT`.
6. Update state exactly once; insert append-only event and receipt in **one transaction**; rollback on any failure. Server timestamp, event ID and financial calculations are generated on the server. Separate `CLOSED` vs `PENDING_REVIEW`.
7. Response includes `workspace`, `scope`, `new_revision`, `event_id`, `sync_status` and change cursor. No PII/full raw messages in default logs.
8. A client with dropped response resends same idempotency key: never creates second event. Reactivation after offline must revalidate member rights and state.

The bounded HTTP adapter exposes `POST /v1/scopes/drafts` only when an explicit server-ledger dependency is supplied. It requires a Bearer session, maps CAS/idempotency/validation failures to stable codes, and has no close/finalize or money-calculation route.

`GET /v1/changes?cursor=&limit=` is the bounded sync read: it is workspace-scoped from the verified session, ordered by `(recorded_at,event_id)`, capped at 500 rows and returns `SYNCED` plus an opaque resume cursor. Invalid cursors/limits fail closed.

Reconnect policy is explicit: unchanged server base may retry with CAS; a changed server revision with local intent returns HTTP `409` plus `CONFLICT/MANUAL_REVIEW`; server-blocked state returns `BLOCKED`. There is no automatic last-writer-wins merge for financial rows.

The PWA `app/settlement-team-sync-client.js` keeps bearer credentials memory-only, stores only the opaque change cursor, labels unsent drafts `PENDING`, stops on `CONFLICT`/`BLOCKED`, and never retries a conflict automatically.

The same client exposes `login(auth_subject, password, workspace_id)` and `logout()` as thin adapters for the synthetic `/v1/login` and `/v1/logout` contract. It does not persist the password or returned bearer token; TLS and an approved deployed identity service remain prerequisites before any real account is used.

UI code may subscribe to immutable snapshots through `subscribe(listener)` to render authentication and draft status transitions. The snapshot intentionally omits the bearer token and never promotes `PENDING` or `CONFLICT` drafts to authoritative money.

The synthetic `team-settlement/server-ledger-api.cjs` composes authenticated sessions with the repository seam. `team-settlement/postgres-ledger-repository.cjs` sets verified tenant/actor transaction-local settings, uses parameterized queries, delegates draft CAS/idempotency to `kts_team.append_draft`, and rolls back on invalid results. These modules open no connection and are not a production deployment.

## Suggested error and evidence semantics
- `401 TEAM_ACTOR_UNVERIFIED`, `403 TEAM_ROLE_DENIED/TEAM_WORKSPACE_DENIED`
- `409 TEAM_REVISION_CONFLICT/TEAM_IDEMPOTENCY_CONFLICT`, `423 TEAM_CLOSED_OR_PENDING_IMMUTABLE`
- `422 TEAM_SCOPE_INVALID/TEAM_KQXS_UNVERIFIED/TEAM_PARSER_UNVERIFIED`
- `503 TEAM_BACKEND_UNAVAILABLE`, no fallback to local client-money approval.

**Notes:** No direct production Telegram dispatch; no implicit HIOSKT algorithm copying. KTS uses its independently implemented verified engine; 65 authentic cases and independent oracle are still missing. M0 pure contract checks are not a substitute for authenticated HTTP, correct SQL transaction behavior or human authorization.
