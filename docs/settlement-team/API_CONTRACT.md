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

When a full team origin is configured, the client accepts HTTPS only. Plain HTTP is restricted to loopback addresses used by synthetic local tests; credentials are rejected before any request to a remote insecure origin.

UI code may subscribe to immutable snapshots through `subscribe(listener)` to render authentication and draft status transitions. The snapshot intentionally omits the bearer token and never promotes `PENDING` or `CONFLICT` drafts to authoritative money.

The synthetic `team-settlement/server-ledger-api.cjs` composes authenticated sessions with the repository seam. `team-settlement/postgres-ledger-repository.cjs` sets verified tenant/actor transaction-local settings, uses parameterized queries, delegates draft CAS/idempotency to `kts_team.append_draft`, and rolls back on invalid results. These modules open no connection and are not a production deployment.

## Suggested error and evidence semantics
- `401 TEAM_ACTOR_UNVERIFIED`, `403 TEAM_ROLE_DENIED/TEAM_WORKSPACE_DENIED`
- `409 TEAM_REVISION_CONFLICT/TEAM_IDEMPOTENCY_CONFLICT`, `423 TEAM_CLOSED_OR_PENDING_IMMUTABLE`
- `422 TEAM_SCOPE_INVALID/TEAM_KQXS_UNVERIFIED/TEAM_PARSER_UNVERIFIED`
- `503 TEAM_BACKEND_UNAVAILABLE`, no fallback to local client-money approval.

**Notes:** No direct production Telegram dispatch; no implicit HIOSKT algorithm copying. KTS uses its independently implemented verified engine; 65 authentic cases and independent oracle are still missing. M0 pure contract checks are not a substitute for authenticated HTTP, correct SQL transaction behavior or human authorization.


## Isolated read-only team scope endpoint

`GET /v1/scopes/{partner_id}/{YYYY-MM-DD}/{mn|mt|mb}` is implemented in
the **synthetic HTTP contract**. It takes a Bearer session and derives the
workspace from the verified server session; a query/body-supplied workspace
is never an authorization source. Respond with a workspace-scoped draft/review
state, `401` for revoked sessions, `404` for absent scope and `422` for
invalid date or malformed path. The future live PostgreSQL repository must
recheck active membership on this read inside a tenant-scoped transaction.

The PWA `readScope` method fail-closes if the returned workspace, partner,
business date, region or revision does not match the authenticated request;
a response from a superseded login session is discarded. A successful
**transport read** is not authorization to finalize money or proof of HIOSKT
accuracy. There is no live hosting, production approval or shared-finance
release yet.


## Isolated PostgreSQL Pool transaction adapter (M1 contract)

`team-settlement/pg-transaction-adapter.cjs` offers a minimal
`db.transaction(async tx => ...)` wrapper around an **injected, reviewed**
PostgreSQL Pool. It opens `BEGIN`, only accepts parameterized `tx.query`
calls from the trusted repository, commits atomically on success, rolls back
on failure, and releases/destroys connections depending on failure safety.
The `tx` object is invalid after the callback finishes. This protects
workspace-scoped `SET LOCAL` tenant/actor settings from accidental
cross-session reuse in a connection pool.

**Important:** The adapter neither creates a Pool nor authenticates it to a
database; tests inject a synthetic Pool to validate lifecycle and repository
composition. A real connection configuration, TLS/VPN, least-privilege DB
role, timeouts, secure secret storage, durable user identity and real
PostgreSQL end-to-end integration still require separate qualification
and explicit human authorization before network exposure. Do not treat
adapter unit tests as proof that group accounting is deployed.


## M1 optional durable session-auth candidate (no real service)

`team-settlement/postgres-auth-service.cjs` now demonstrates **async**
authentication against isolated PostgreSQL `kts_auth.credentials` and
`kts_auth.sessions` tables. It stores only a SHA-256 token hash, uses the
existing scrypt verifier, checks disabled identity and active workspace
membership at login, and **re-queries the database for every session check**.
A returned actor is derived solely from the server's database records. Logout
revokes the saved hash. The existing HTTP facade and server-ledger facade
can `await` either the legacy synchronous in-memory synthetic auth service
or the injected async service, with an isolated synthetic HTTP test.

**Deliberate admin block:** durable service does NOT yet implement audited
membership/identity administration. Attempts to call admin endpoints return
`TEAM_ROUTE_NOT_ENABLED` until a transactional reviewed authorizer and
real per-tenant admin audit are supplied. It is not safe to provision actual
members by calling synthetic helper routes.

**Qualification limit:** This service requires an injected `db.transaction`
adapter. Current Node HTTP tests inject an isolated synthetic database;
PostgreSQL CI verifies candidate SQL schema separately. No deployed
PostgreSQL Pool/configuration, no live TLS service, no integrated durable
production login, no credential lifecycle recovery/rotation/rate-limit
persistence across processes and no 30-person account provisioning exists.
No auth keys, passwords, real sessions or customer data go to public CI.
Do not declare real team use ready or retire HIOSKT.
