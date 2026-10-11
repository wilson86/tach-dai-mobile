# KTS Settlement Team — Architecture Decision M0 (10–30 people)

**Status:** DRAFT, design and synthetic-contract phase only. **Not approved for live finance, merge, deploy or HIOSKT cancellation.** Tracks [Issue #5](https://github.com/wilson86/tach-dai-mobile/issues/5). As-of 2026-10-12, inherited Feature PR #3 baseline `08824b76b02aba63345be849329b2fb950be73cf`.

## Decision and alternatives

**Decision:** Separate team-accounting service with PostgreSQL 15+ as the **sole authoritative shared ledger**. Shared identities are verified by the server and associated with memberships in one or more workspaces. Each workspace carries multiple **settlement counterparties** (customer/owner): a counterparty is not a human login. Prefer a self-hosted server on already owned hardware (HTTPS or approved private VPN), but host choice, maintenance and uptime are yet to be approved. PostgreSQL has no license fee; backups, bandwidth, electricity, power failures and operator maintenance are real obligations.

**Do not use browser IndexedDB as shared financial truth.** Existing `app/settlement-store.js` writes local IndexedDB. `app/settlement-backup-ui.js` is manual browser JSON export/restore. Existing `app/settlement-scope-sync.js` synchronizes view selection only, not multi-device state. The stateless KTS settlement API currently provides canonical parse and KQXS routes, **not** account/tenant/ledger infrastructure. Do not connect to KTS Router's live SQLite/Telegram database. No public database or private corpus in public GitHub.

**Rejected now:** sharing the same IndexedDB file, putting JSON backups on shared drive, directly exposing Router SQLite, client-side group money arithmetic, unauthenticated API, accepting nominal `MATCH_EXACT` without four-field independent proof. SQLite on one server might serve 30 users but PostgreSQL is selected for database-enforced tenant rows, transaction/CAS and better concurrency; reevaluate only after measured data.

## Separation of responsibility

- **Web/Mobile PWA:** login screen, verified tenant context, draft data entry, pending/rejected/conflict UI, group ledger reports and audit. Offline IndexedDB is *only* draft/cache. Logout or session expiration invalidates cached sensitive views.
- **Team API (new isolated process):** authenticates each session, fetches DB membership; enforces role and resource access; exact parser / effective-dated money-config check; ensures KQXS is independently verified before money is final; controls idempotency, versioned transactions and logging. It may call a **read-only** canonical parser/KQXS service, but never send Telegram or mutate KTS Router.
- **Team PostgreSQL (new dedicated database):** workspace, identity, membership, customer/owner counterparty, scope state, append-only financial events, idempotency receipts, and separately scoped credential/session verifier material. Raw passwords and bearer tokens are never stored. Separate runtime DB account without superuser, table ownership or `BYPASSRLS`. See `team-settlement/migrations/001_team_ledger.sql` and the synthetic auth candidate `003_auth_session.sql`; migrations are **candidates**, never run against the operational database.
- **Independent oracle (future):** operator-authorized real HIOSKT reports and mapping/provenance are reviewed in a **private**, read-only evidence environment. Exactly verified XÁC, QUA CÒ, TRẢ, THU/BÙ; no public HIOSKT data or bypass of existing Issue #4 qualification.

## Financial and concurrency invariants

1. Client never chooses workspace/role by request body; server derives both from authenticated session **and active DB membership**. A session may change workspace only after checking membership for the target.
2. Each scope uniquely keys `(workspace_id, partner_id, business_date, region)`; business date refers to target lottery day in Asia/Ho_Chi_Minh and must be valid.
3. One event transaction atomically: validate request and role, check server revision, check or claim idempotency key with request digest, update scope with `WHERE revision = expected_revision`, insert append-only event, insert receipt, COMMIT. If any operation fails, ROLLBACK. Duplicate same key+same hash returns prior receipt; reused key+different hash is a hard error. No double charging or silent lost updates.
4. `DRAFT → PENDING_REVIEW → REVIEWED → CLOSED` is audited and versioned. An actor may not approve their own submitted scope; reviewer cannot self-close if the same submitter; CLOSED only after verified KQXS, independently approved parser/rates and category support. Reopening requires an approved reason, admin role and compensating correction rather than deleting prior closed event.
5. Group report money comes from **committed server events**, never offline drafts or UI computed totals. UI status: `PENDING`, `SYNCED`, `CONFLICT`, `BLOCKED`. A conflicting request must be resolved by a person; no automatic last-writer-wins for financial rows.
6. Exact internal numeric money is from the qualified settlement engine, not from a JavaScript float or a client-supplied amount. Never invent rules for Xiên, Ủi or unsupported syntax; block until verified per-partner permission and independent reference.
7. No live customer data in shared repository or CI. All contract and load tests use synthetic actor/partner IDs; no HIOSKT screenshots exported to GitHub.

## Endpoint design (not yet implemented)

| Method/route | Access | Expected behavior |
|---|---|---|
| POST /team/session | Public authenticated entry, rate limited | Issue secure, revocable short session, tenant selector from DB membership |
| GET /team/me | Authenticated | Return role, selected workspace, session status; no raw secrets |
| GET /team/scopes?date=&region=&partner= | Authorized view | Paged workspace-filtered server snapshots with `revision` |
| POST /team/scopes/drafts | operator/admin | Requires `Idempotency-Key`, `expected_revision`, validated parser/KQXS lineage; no actual customer money by default |
| POST /team/scopes/:id/submit | operator/admin | Transition DRAFT → PENDING_REVIEW |
| POST /team/scopes/:id/review | reviewer/admin other than submitter | Transition PENDING_REVIEW → REVIEWED |
| POST /team/scopes/:id/close | reviewer/admin other than submitter | Transition REVIEWED → CLOSED; real-oracle gate remains disabled in M0/M1 |
| GET /team/changes?cursor= | Authorized view | Stable ordered workspace-scoped events + resume cursor |
| GET /team/audit | admin/reviewer limited | Paged immutable, sanitized audit trail |
| GET /team/health | Monitoring only | No identity, money or private metadata in response |

API payload must omit client-selected `role`, `workspace_id` from authorization authority, plaintext passwords and private HIOSKT artifacts. Use opaque idempotency keys; `If-Match`/revision must be validated on every scope write. Define rate limits, body size limits, authentication/session/CSRF strategy before exposing HTTP.

## Bounded implementation milestones and pass gates

| Stage | Work | Evidence required |
|---|---|---|
| **M0** | This ADR, PostgreSQL DDL candidate and pure fail-closed role/scope/transition contract | Exact GitHub branch/source; reproducible `node --test` synthetic PASS; SQL tested in a disposable CI PostgreSQL database only, not deployed |
| M1 | Isolated identity provider, PostgreSQL-backed transactional service; two clients | No cross-tenant reads; idempotent retry vs collision; CAS/rollback; transaction kill/restart tests; credential/session persistence is tested synthetically, but deployment remains unapproved |
| M2 | PWA login and shared optimistic-sync UI; reviewed money workflow, backup restore | Browser/device restart, offline reconnect, lost update, 30 concurrent synthetic clients, restore from separate backup |
| M3 | Independent HIOSKT money oracle from approved private 65-case corpus | Every mapping/provenance verified; all supported fields exact; discrepancies resolved; no `NOT_COMPARABLE` |
| M4 | Authorized non-production group pilot then separate production release approval | Security, latency, backup/restore, fresh Pages acceptance, operator signing |

**Explicit blockers:** actual authenticated multi-user service, isolated live Postgres migration/test, secure hosting choice, independently authenticated monetary historical oracle and licensing. **Do not equate architecture-only CI with production readiness.**

## GitHub-only safety review after bounded Codex loop

The current PWA team sync adapter is an **in-memory prototype**, not durable offline storage. Because user/workspace identity is not yet durably authenticated for client-side cache keys, change cursors are scoped to the current session **in memory only**, reset on login/logout/account switch, and the pending local queue is discarded on logout/account switch to prevent exposing one person's draft data to the next login. UI must warn before intentional logout when a draft has not been acknowledged; a durable offline queue requires encrypted, user- and workspace-scoped storage plus a verified re-authentication/ownership protocol **before** M2 deployment. This is a known limitation, not a promise that every offline draft survives logout or browser restarts.

HTTP 200 without `SYNCED` and a server event receipt must be treated as `BLOCKED`. An unsent local intent with matching base/server revisions is still `PENDING`, not `SYNCED`. Responses from an earlier session epoch must never modify the next session's cursor or draft status.
