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
