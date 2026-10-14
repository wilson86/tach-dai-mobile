# KTS Settlement — M2 synthetic PostgreSQL review-only state

**DRAFT / candidate. Not production-ready.** This module adds *database-backed,
synthetic-only* state transitions after the existing DRAFT ledger. No real
money calculations, close_scope, reopen, Telegram, live accounting or operator
deployment are enabled.

## Authorized workflow

- Authenticated **operator/admin** in active workspace: DRAFT → PENDING_REVIEW.
- **Different** authenticated **reviewer/admin** in that same workspace:
  PENDING_REVIEW → REVIEWED.
- Same user must never submit and approve the same scope, regardless of role.
- The validator and SQL function reject unknown actions and any attempt to
  call close_scope/reopen_scope. Real-money release gate stays BLOCKED.

The SECURITY INVOKER SQL function \`kts_team.advance_review\` validates
membership and identity state at transaction time, actor and tenant from
trusted transaction-local settings, exact expected revision, prior state,
submitted_by versus reviewer, and idempotent replay provenance (same original
event, actor, scope, action, request hash). It locks the existing scope,
increments its revision, assigns workspace feed sequence under the same
transaction, appends immutable event and receipt. The server must generate
safe event IDs and an authenticated digest; a browser must never be trusted to
supply reviewer identity. Every event is tagged synthetic-only.

Disposable CI grants EXECUTE solely to isolated test role
\`team_smoke_writer\`. Function PUBLIC execute is explicitly revoked; no
production role is provisioned by this repository. Migration 004 must never
run against a live finance database. No HTTP button/endpoint calls it yet:
**DB-proof is not deployed group workflow**.

CI asserts: scope transition/revisions, distinct operator/reviewer, self
approval denial, unauthorized role denial, cross-tenant denial, no edits
after review, stale states, same/different-key replay, immutable event count,
and absence of CLOSED scopes. Future steps need a reviewed repository API,
authenticated HTTP route, UI human decision capture, persisted request audit
and operator-controlled account provisioning, followed by backup/restore and
independent financial oracle qualification.

## Default-off internal Node review seam

`postgres-ledger-repository.cjs` delegates `advanceReview()` to the
parameterized PostgreSQL function inside a verified tenant/actor transaction.
`server-ledger-api.cjs` exposes an *internal* service method only when
`syntheticReviewEnabled:true` is explicitly injected: it derives the actor
from durable login, accepts only `submit_review` or `approve_review`,
checks role and workspace, uses a server-generated canonical digest and
event ID, and accepts only a full verified receipt with expected review state.
The composition flag defaults **OFF**. There is deliberately NO HTTP review
mutation endpoint, no UI approval button, no production privilege grant, and
no route that finalizes money. Synthetic contract tests are not live deployment.

## Opt-in synthetic HTTP review-only route

`POST /v1/scopes/review` is **404 disabled by default**. An isolated
`createIsolatedTeamPrototype({syntheticOnly:true,syntheticReviewEnabled:true})`
may opt in to the review-only route; all outgoing requests still need an
authenticated session, explicit action, scope, expected revision, and
idempotency key. The service derives the trusted actor and digest and the
SQL layer rechecks membership/CAS/separation of duties under tenant RLS.
This route *cannot close* or *reopen* a scope, calculate money, or mutate the
operational Router. No UI button was added. This is a test-only internal
API, not production readiness, and only disposable localhost CI may expose it.

## Volatile client review intents — default not exposed in UI

The browser sync client now has an explicit `reviewScope(action,scope,expectedRevision)`
internal API for **fake/demo/synthetic** partner IDs only. It requires an
already-authenticated workspace, accepts only submit_review / approve_review,
generates an opaque secure idempotency key and retains the exact action/scope/
revision/key in MEMORY_ONLY while the result is uncertain. A voluntary
`retryOnly:true` request can reuse the same key without forging a new review.
Only a verified server receipt with expected state, revision, feed sequence,
scope key, event ID and replay flag may mark it SYNCED; 409 is CONFLICT,
4xx BLOCKED, network/5xx remain PENDING/uncertain.

Unsent review intents block automatic account switching/logout and increase
the visible volatile_unsent_count/reload_loss_risk. This cannot guarantee
survival after browser reload/close; no durable offline review queue exists.
No production UI or endpoint was activated by this client-only change.

## Opt-in manual review UI (2026-10-14)

The standalone synthetic pilot HTML now contains a hidden, disabled review
control group. `KtsTeamPilotUI.mount` keeps it inert unless its trusted caller
explicitly passes `syntheticReviewUiEnabled:true`; default shipped bootstrap
still passes no such flag. No public deployment is enabled by checked-in HTML.
When explicitly opted into a disposable synthetic-only pilot, the user must:
(1) log in; (2) select a fake partner and read its server-verified scope;
(3) have zero unsent draft items; (4) confirm the exact action/scope/revision
in a human modal; (5) receive an exact verified review receipt. A fresh
server read is required for the first attempt; if the phone loses the
response, manual retry uses the original in-memory idempotency key and
revision without rebasing. The source remains MEMORY_ONLY, so lost browser
documents cannot be recovered and no real settlement is authorized.

Roles and separation of duties are enforced **server-side and in SQL**,
never by visual button hiding. Review UI remains hidden by default and close,
reopen or financial finalization remain inaccessible. This opt-in UI source
has only GitHub synthetic tests, no new physical-device requalification.

## Synthetic read-only human audit feed (2026-10-14)

The pilot now loads `settlement-team-review-audit.js` before the sync client.
For `SUBMITTED` and `REVIEWED`, each feed row must match the authenticated
workspace and synthetic partner; provide a positive revision/feed sequence,
safe actor/event IDs, server timestamp, and a coherent `result_snapshot`
containing exactly the expected state transition, submitter and reviewer
identity. Review actor IDs must match the immutable event and snapshot;
a reviewer cannot be their own submitter. Unexpected/missing audit metadata
fails closed **before the browser feed cursor advances**.

The UI renders only whitelisted review details through `textContent`:
action, fake scope, server actor ID, original submitter ID, revision, timestamp,
and event ID. Raw snapshots are not displayed. A failed audit page never
replaces previously verified history and is marked stale. The visible
review list covers *only the current change-feed page*, not a complete
financial audit trail; no durable review history is stored on the browser.
This remains opt-in synthetic-only, not finance release authorization.

## Read-only scope actor provenance gate

For server-side `readScope()` responses, `PENDING_REVIEW` is accepted only
with a safe `submitted_by` actor and without a `reviewed_by` actor.
`REVIEWED` / `CLOSED` requires both valid actor IDs and distinct
submitter/reviewer IDs. Missing or contradictory provenance is displayed
as `SYNC_SCOPE_UNVERIFIED` rather than approved financial state. The UI
shows the server-derived IDs as read-only `textContent`; no permission to
finalize a scope is added. PostgreSQL transactional role and RLS checks
remain authoritative.

## Browser exact-revision and cross-page audit guards

The authenticated change-feed client requires exact consecutive workspace
`feed_seq` values from cursor zero and across all later accepted pages.
A missing first, middle or next-page event is rejected, even if the response
otherwise looks correctly authenticated.
The cursor and sequence watermark reset together when the user or session
changes; malformed/repeated pages cannot be labeled a verified update.
Read-only `readScope` rejects revisions outside JavaScript's exact integer
range before any button can derive an expected CAS revision. The historical
audit formatter keeps valid PostgreSQL signed-bigint revisions as exact
**decimal text**, never a lossy JavaScript Number. These are client-side
fail-closed checks, not a replacement for server RLS/CAS, a financial oracle,
or a complete durable audit archive.

## Draft acknowledgement must match original scope

`syncDraft()` does not call a fake DRAFT `SYNCED` for an arbitrary HTTP 200,
even with a plausible event ID, feed sequence and revision: the reply's
server-authored `scope_key` must match the original workspace, partner, date
and region exactly. Missing/foreign receipts are `SYNC_ACK_UNVERIFIED` and
do not satisfy the operator's saved-draft claim. The authenticated server
still owns tenant membership, CAS and idempotency; this browser check is an
additional fail-closed presentation guard, not a financial approval.

## Uncertain draft ACK and fake DRAFT provenance

HTTP 5xx after a draft write is **not evidence the server rolled back**:
`syncDraft()` keeps the original request `PENDING` with
`SYNC_DRAFT_RECEIPT_UNCERTAIN`. A deliberate retry reuses its original scope,
revision, payload and idempotency key; only a fully scoped replay receipt can
produce `SYNCED`. A rejected 4xx remains `BLOCKED`. This behavior protects
against duplicate intent creation but does not make offline browser memory
durable. A read-only `DRAFT` scope is also denied if it improperly claims
a `submitted_by` or `reviewed_by` identity before the review transition.

## Immutable change-feed gap detection (2026-10-14)

The PostgreSQL repository read path now requires every returned workspace
`feed_seq` to equal the authenticated cursor's last sequence plus one.
The feed sequence is allocated transactionally and immutable audit events
are not deleted in the synthetic schema. A missing first, middle or later
sequence is **not** valid pagination: it fails `TEAM_FEED_RESPONSE_UNVERIFIED`
before a server cursor is returned, rather than silently skipping evidence.
This is fail-closed integrity validation, not a claim that the historical
money/oracle or live deployment has been qualified.

## Bounded cursor paging and revision preflight (2026-10-14)

Before sending a browser feed request, `pullChanges` requires a whole-number
limit of 1–500. Contradictory pagination metadata (nonboolean supplied
`has_more`, claimed additional pages without a full current page, or a
non-null cursor on an empty page) is `SYNC_FEED_UNVERIFIED`, without cursor
movement. Missing optional `has_more` is tolerated only for older synthetic
contract responses. Draft queue creation also rejects a base revision if
incrementing it would lose JavaScript integer precision, before allocating
an idempotency key or issuing a write. These guards do not authorize money.

## Synthetic identity and final-state presentation guards

Overlapping browser logins now fail with `SYNC_LOGIN_IN_FLIGHT`: a second
identity exchange cannot race the first request and silently install its
session. Rejected logins release this single-flight guard, while an explicit
session change still invalidates delayed responses. The opt-in browser pilot
does **not** accept `CLOSED` or `REOPEN_REQUESTED` as verified read-only
states, since neither transition is implemented/qualified for this version.
The server still owns approval roles and no real monetary finalization exists.

## Canonical change-feed cursor contract

The database repository refuses extra cursor JSON fields, alternate key order,
nonnumeric/noncanonical sequence encoding and unsafe numeric values. The only
accepted nonempty cursor is the exact URL-safe encoding produced by
`encodeCursor()` for the same authenticated workspace; initial null cursor
starts at sequence zero. Canonical encoding is **not a cryptographic signature**:
a malicious client with workspace access could still forge a sequence. Real
financial audit/export needs signed or server-stored read checkpoints and
independent authoritative comparison before release.

## Exact Gregorian dates at client entrypoints

The server's original core contract checks leap years and real month lengths.
The synthetic PWA now applies equivalent calendar validation before allocating
a new draft, preparing a review transition or issuing a read-only scope GET.
Impossible dates return `SYNC_SCOPE_INVALID` without using the network.
A valid Gregorian leap day is retained exactly; no implicit date rollover
or real-money data processing is introduced.

## Bounded, read-only session review history

The synthetic pilot no longer removes previously verified event/audit rows
on each successful change-feed page. It appends strictly new event IDs within
the authenticated session, retains old verified rows after an empty page and
marks failed polls as stale rather than authenticated updates. A duplicate
event ID causes fail-closed presentation without replacing the last verified
timeline. Memory is capped at the latest **500** events; the UI explicitly
labels eviction, session-only state and incomplete audit history. Login,
logout and independently detected `session_epoch` changes reset this
volatile timeline so an earlier account's data cannot remain visible.
Partner/date/region `input` events also invalidate stale review controls
immediately, without waiting for blur. This is **not** a durable audit export,
offline persistence, or financial close authority.
