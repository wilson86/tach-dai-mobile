# Synthetic scope privilege candidate — not a migration

Status: **DESIGN ONLY; NOT VERIFIED; NOT READY FOR LIVE ACCEPTANCE**.
Current draft and review functions are `SECURITY INVOKER` and directly write
`kts_team.scopes`. The Windows synthetic ledger role currently has direct
INSERT and UPDATE on that table. Its RLS policy scopes by workspace; the
repository supplies actor and workspace via caller-set transaction settings.
Consequently, neither revoking the writes alone nor changing only the function
security mode establishes the requested actor boundary.

The role probe now also checks the exact `advance_review` signature: auth must
not have EXECUTE, and when synthetic review is enabled the function must exist
and ledger must have EXECUTE. Disabled review may operate without the function.
The ledger role must also have USAGE on the team schema; function EXECUTE alone
does not establish that the role can resolve and invoke the function.
This is fixture-tested source behavior only; it does not establish actual
PostgreSQL privileges, database identity, RLS, or trusted actor binding.

The unpromoted role-probe candidate additionally requires equal database name,
database OID, server address, server port and postmaster start time, and rejects
recovery servers or missing evidence. This detects obvious split endpoints but
is not a cryptographic cluster identity: a proxy or coincident values can still
make distinct backends look alike. It does not make transactions shared. Unix
socket connections with no server address fail closed. Real PostgreSQL query
compatibility and actual cluster identity remain NOT_RUN.

The unpromoted role probe now also rejects table-level and column-level direct
INSERT/UPDATE and table-level DELETE/TRUNCATE on audit events, idempotency
receipts and workspaces for both runtime roles. Missing evidence fails closed.
The existing SECURITY INVOKER mutation functions need some of these writes, so
this is a blocking qualification guard, not a working mutation implementation.
Privilege inheritance, PUBLIC grants, function ownership and effective grants
still need real PostgreSQL catalog and adversarial tests before admission.

## Candidate to investigate

Use a distinct, non-login function-owner role that is neither superuser nor
`BYPASSRLS`, does not own the protected tables, and has only the table and
column privileges required by the existing transactional bodies. The runtime
role has no direct scope INSERT, UPDATE, DELETE, TRUNCATE or per-column write
grant; it receives EXECUTE only on explicitly qualified functions. Revoke
PUBLIC execution and keep a fixed safe search path. The owner and grants must
be checked against the real synthetic schema, including inherited memberships,
default privileges and `FORCE ROW LEVEL SECURITY`.

**Actor binding is unresolved.** A caller-writable `kts.actor_user_id` GUC
cannot establish identity for a privileged function. A shared pooled ledger
login also cannot distinguish reviewers by `session_user`. Before this
candidate can be implemented, choose and independently verify a binding that
the caller cannot forge, such as a protected mapping from separately
authenticated database identities to actors, or a capability verified by a
protected authority. Both options require changes outside a simple grant edit.
No such mechanism is implemented or approved here; do not substitute an
unchecked actor argument, client-set GUC, or a new privileged role alone.

The server passes an actor object to the ledger repository; it does not pass
the bearer into the ledger transaction. The durable auth service now offers
`withVerifiedSession`, retaining its session `FOR SHARE` lock across the
separate ledger transaction. The synthetic composition requires that callback
for writes. A controlled JS lock model verifies ordering and logout replay;
actual PostgreSQL locking, failures and concurrent revocation remain NOT_RUN.
The same callback now surrounds scope, change-feed and counterparty reads;
the separate recovery inspector still uses its own verification protocol.
Legacy injected auth contracts can still use the older unlocked fallback when
the durable-write requirement is not enabled and must not qualify a pilot.
The ledger repository independently rechecks membership. Therefore a
database-side session-bound design needs an explicitly reviewed contract for
proof transport and revocation races. A raw bearer or reusable session hash
must not be added to SQL parameters or logs without a separate disclosure
and retention analysis. The current contract supplies no such proof to SQL.
The earlier fixture demonstrated a gap between the two transactions. Its
updated version checks that the auth transaction remains open during a write;
the Reviewer fixture additionally models a revocation waiting for release.
These mocks cannot establish PostgreSQL transaction or row-lock behavior.
The ledger transaction can commit before an auth transaction commit failure;
an offline composition fixture confirms the API returns an error, then accepts
the same original event on retry using a simulated idempotent repository result.
The fixture does not execute the SQL idempotency implementation; retries and
idempotency still need explicit real-database verification.
Any candidate must demonstrate these cases with real isolated PostgreSQL.

The offline `settlement-team-auth-link-loss-race.test.cjs` exercises the real
JavaScript composition with synthetic pool clients. It models auth connection
loss, revocation, and then a ledger commit; the API returns an error despite
the synthetic committed mutation. This is a counterexample to treating the
separate auth lock as atomic revocation, not evidence of PostgreSQL behavior.
A candidate needs session verification and the protected mutation in one
reviewed database transaction or an equally strong database-enforced boundary;
the present role/grant and actor-GUC admission blocks remain in force.

The transaction adapter also has an intrinsically ambiguous COMMIT failure:
`settlement-team-commit-ambiguity.test.cjs` supplies the same connection error
before and after a synthetic durable commit. In both cases it verifies client
destruction; neither an exception nor a later ROLLBACK proves no write occurred.
This is a fault model, not a PostgreSQL disconnect test.

The candidate adapter now rejects a missing or non-COMMIT command tag and
destroys the client; in particular, a ROLLBACK tag is never reported as a
successful mutation. This guards an additional false-success path, but a
lost COMMIT acknowledgement remains unknown and still needs reconciliation.
This candidate requires real node-postgres compatibility and database tests
before admission; synthetic fixture results are not live evidence.
The candidate also classifies a pool release exception after an acknowledged
COMMIT as an unknown mutation outcome rather than a definite rollback. The
offline composition fixture demonstrates propagation, not actual pool cleanup;
a release exception can still require operational investigation.

The unpromoted candidate now labels a thrown COMMIT acknowledgement and an
auth-transaction failure after successful ledger work as an unknown mutation
outcome. The draft and review HTTP handlers return a sanitized 503 with manual
review, and the client blocks repeat writes on that explicit response. Unknown
drafts remain blocked across account-scoped storage reload. The candidate now
requires an account-scoped storage marker before dispatching review and blocks
the same intent after reload, including after a lost response. Markers are not
automatically cleared, even after success: authoritative reconciliation and a
safe clear operation remain unimplemented. The candidate uses an exclusive
Web Lock around localStorage marker creation and rejects when unavailable. A
synthetic lock-manager fixture exercises two competing clients, but real browser
Web Locks, different origins, devices, and storage partitioning remain unproven;
the database must still enforce idempotency and authorization. A network failure before the HTTP response reaches the client
still follows existing in-session uncertain-response behavior.
These changes do not verify a receipt or close the separate-transaction race.

The candidate writes and reads back a dispatch-uncertain flag for account-scoped
drafts before sending. A restored attempted draft becomes BLOCKED even if a
later storage write failed; an unattempted local draft remains PENDING. This
conservatively changes offline behavior: a draft attempted while offline and
then reloaded needs reconciliation instead of automatic retry. Tests use a
synthetic store, not browser durability evidence. The ownerless legacy client
path, concurrent tabs modifying the shared draft array, storage eviction, and
authoritative reconciliation remain unresolved; this is not a database or
cross-device duplicate-prevention guarantee.

Required design invariants before implementation or admission:

1. A single database transaction must validate and lock an active session,
   derive the actor from database-controlled identity, recheck membership,
   perform the mutation, and persist the idempotency receipt and event.
   Logout must update the same locked session row. A lock on another connection
   is insufficient, and caller-selected actor GUCs are not authentication.
2. Only the intended runtime role may invoke the reviewed transaction boundary;
   it must not gain direct auth-table, scope, event or receipt writes, function
   ownership, role impersonation, BYPASSRLS, or a way to select another actor.
   A SECURITY DEFINER boundary requires a fixed safe search_path, restricted
   EXECUTE grants, an appropriately non-login owner, and reviewed FORCE RLS
   semantics. These are requirements, not claims about current grants.
3. A lost COMMIT acknowledgement has an UNKNOWN outcome until an authenticated,
   actor-and-workspace-bound lookup verifies the persisted event and receipt.
   A retry must use the original idempotency identity and payload; neither a
   client-generated acknowledgement nor a rollback attempt proves the outcome.
4. Define how an already-revoked user can learn a prior mutation outcome
   without granting new access or leaking cross-workspace data. Do not pass a
   raw bearer or reusable session hash to logs, receipt APIs, or SQL parameters
   until the proof transport, access control, and retention risks are reviewed.

The current role-separated pools and existing recovery endpoint do not provide
these invariants for review mutations. In particular, the recovery inspector is
draft-specific and requires an active authenticated actor. No new SQL contract
or privileged implementation is implied by this design note. Real PostgreSQL
concurrency, lost-acknowledgement and RLS verification remain NOT_RUN.

The isolated candidate composition makes `verifyPools()` fail closed and now
also replaces its exposed repository mutation methods with a fail-closed guard.
The composition's ledger API and HTTP handlers consequently cannot perform
draft/review writes even if callers skip qualification. This temporarily makes
business writes unavailable; it is not an atomic implementation. Importing and
constructing the lower-level unguarded API/repository independently can still
reproduce the split-connection race, and direct database access is not guarded
by this JavaScript composition. The separately pinned Windows composition is
unchanged and its fixture still returns qualified. Neither candidate nor the
canonical runner may be treated as an atomicity fix or live admission proof.
The existing real runtime qualification test expects the old successful
`verifyPools()` result and must be updated after a real boundary is designed;
it has not been run against PostgreSQL.

Draft replay requires an actor-bound receipt contract.
The server digest still covers action, scope, expected revision and payload,
but not actor. On the 2026-11-01 isolated development branch,
`002_draft_transaction.sql` was hardened to compare the saved event's
actor, kind, scope, revision and payload hash before honoring a same-key replay.
It preserves the original event and feed identity for a matching retry.
This is **source hardening**, not proof of PostgreSQL behavior, independent
SQL actor binding, or an authorization decision by the database. The actor GUC
can still be forged by a direct SQL caller; role/grant redesign remains blocked.
The fixed SQL source was mirrored into the canonical Windows checkout without
executing it; the prior clean source was retained as a local rollback copy.
The runner now pins all four migration files before its admission path.
The existing focused JavaScript characterization deliberately simulates an
unvalidated SQL replay and therefore still shows two actors receiving `SYNCED`
when given that mocked response. That fixture does not evaluate the updated
PostgreSQL function or establish a live exploit.
The associated `team-settlement/tests/postgres-draft-replay-actor-regression.sql`
uses a disposable database and opt-in fixture setting, writes in a rollback-only
transaction and checks same-actor retry against different-actor denial.
**It has not run against PostgreSQL on the new source SHA.** The privileged
smoke-writer fixture is not evidence of least-privilege admission. Any change
to request digests or recovery receipts remains a separate compatibility gate.

## Mandatory synthetic verification before any promotion

| Invariant | Required observable negative and positive result |
| --- | --- |
| Actor | Forged actor/workspace, reviewer append, operator approve and prohibited self-approval are denied; authorized independent actors succeed. |
| CAS | Stale draft and review revisions fail without a write, event, receipt or feed change. |
| Idempotency | Same key and same payload returns the original receipt; a mismatched payload is denied with no extra event. |
| Receipt | Receipt joins to the exact event and workspace; forged and cross-workspace receipts are denied. |
| Isolation | Restricted non-owner roles cannot read or mutate another workspace, including through function calls or spoofed settings. |
| Privileges | Actual role cannot write scopes, events or receipts directly, including column grants and inherited/PUBLIC privileges; intended function calls retain required access. |
| Transaction | Controlled failure after an attempted write rolls back scope, event, receipt and feed together. |
| Definer safety | Non-owner, non-superuser, non-bypass owner; fixed search path; no PUBLIC execute; table owners and RLS settings verified from catalogs. |

Use a fresh disposable supervised PostgreSQL instance only when the applicable
synthetic test authorization permits it. Preserve original SQL and data;
record before/after catalogs, role identities and evidence hashes. Offline
fixtures cannot establish these PostgreSQL guarantees. Independent review is
required before any runtime privilege or migration change.

The existing `PgCtlNativeTest` registers the postmaster only after `pg_ctl -w
start` and readiness return. Its watchdog acts only on manifest PIDs. A focused
real-process test (`settlement-team-watchdog-unregistered-child.test.cjs`)
shows that the actual watchdog returns PASS for an empty manifest while a
disposable unregistered child remains alive; the fixture then terminates its
own child. This is evidence of a registration-gap cleanup risk, not evidence
of a PostgreSQL orphan. Before using this lifecycle for the SQL regression,
cover the interval between process creation and durable registration with an
ownership-scoped mechanism and test launcher failure in that interval. Do not
infer process-tree cleanup from an empty-manifest terminal receipt.

`tests/windows_job_containment_fixture.py` explores a possible mitigation on
this Windows host: `CreateProcessW` uses the job-list process-creation attribute
to place a suspended child in a kill-on-close Job Object atomically. The test
kills the job owner once with the child still suspended and once after resume;
both disposable Python children exited. This is not connected to the runner,
does not exercise pg_ctl/PostgreSQL descendants, and does not prove graceful
shutdown or replace the existing supervisor. Job nesting, breakaway settings,
ownership and actual PostgreSQL tree cleanup require separate verification.
The same fixture also spawned a disposable grandchild and held explicit Windows
process handles to both descendants; both exited after the job owner was killed.
This demonstrates a simple synthetic tree on this host, not PostgreSQL behavior.

## Follow-up checkpoint — 2026-11-01 (source + Windows containment)

- **Project:** KTS Settlement only; repo `wilson86/tach-dai-mobile`, branch `codex/r6-rls-followup-20261029`.
- **Owner-reported Windows containment HEAD:** `d2c251454cdc192fe9b66620c216fd15ae86d966`, checkpoint `C:\KTS-Settlement\w20-2d63c84e\KTS_WINDOWS_JOB_TREE_D2C2514.json`, SHA-256 `170F3BDB175B17C5FD17B7A4D484934388008E204C3E1CD7F4ACD1377A9D57DB`. Direct Windows checkpoint bytes are **NOT VERIFIED** here. On GitHub, `tests/windows_job_containment_fixture.py` has suspended-child, resumed-child and descendant-tree synthetic modes. Child/grandchild exit is **operator-reported PASS**, not rerun remotely; **actual pg_ctl/PostgreSQL tree and runner integration NOT_RUN**.
- **Source hardening after containment HEAD:** `006e94ab35316f33d042bcc5bad55ae5bf78cea3` updates only the synthetic draft SQL replay path, rejecting wrong actor, business scope, event kind, revision and saved payload hash; `f1be5747d9ad94ae9e4317a77454e9a23ed4608d` adds targeted static test; `4411ff24f0a288eb9bc7009b27c90b64d1779711` corrects the future SQL regression's status. No deployed schema, Windows runner or production data was modified.
- **New QA:** `tests/settlement-team-draft-replay-context-static.test.cjs` executed in a V8 synthetic Node-test shim against the exact GitHub SQL/test blobs: **3/3 PASS**. This is **STATIC SOURCE QA**, not native Node, PostgreSQL or Windows SQL proof. An additional source invariant inspection asserted 10 replay/transaction properties before the SQL commit. Existing same-SHA PASS cases were not rerun.
- **Remaining hard blockers:** real PostgreSQL SQL regression NOT_RUN; runtime ledger scope `INSERT/UPDATE` still conflicts with required no-direct-write actor boundary; spoofable actor GUC; session revocation across separate auth/ledger transactions; atomic containment of actual `pg_ctl`/postmaster and watchdog/supervisor shutdown; restricted-role cross-workspace RLS and Android Reviewer logout still NOT_RUN. Do not claim LIVE_READY on Job Object synthetic evidence.
- **Next batch (max 3):** (1) inspect/replay updated SQL regression in an isolated offline PostgreSQL test only when appropriately authorized, including legitimate same-key retries and wrong-actor denial; (2) review least-privilege/actor-binding plan and keep current live grant/admission block in place; (3) qualify Windows Job Object integration with owned `pg_ctl` process hierarchy, clean termination/recovery and SHA-bound evidence before requesting any new single-use live authorization. Do not connect to production or reuse R6 lease/root.
- **Gate:** `RELEASE_READINESS=BLOCKED`; `R6_LEASE=CONSUMED`; `R7=NOT_STARTED`; `GITHUB_CI=NOT_RUN`; `REAL_PG_RLS=NOT_RUN`; `REAL_REVIEWER_LOGOUT=NOT_RUN`; `MERGE=NO`; `DEPLOY=NO`; `PRODUCTION_MUTATION=NONE`; `E_ACCESS=NO`; `F_ACCESS=NO`; `COST_USD=0`.
- **Policy / Skills:** actual five WILSON86 skills found and read at `wilson86/AI_ORCHESTRATOR` seed SHA `59630fd445c87b57598c88b0d47cc1296a8ebabd` under `.agents/skills/{zero-cost-guard,qa-evidence-gate,bug-reproduction,safe-goal-loop,github-handoff}/SKILL.md`. Proposed context-guard manually loaded from PR #11; native discovery **NOT_VERIFIED**, `MANUAL_ONLY`. Context risk `UNKNOWN` (no exact remaining percentage).
- **Cleanup:** `CLEANUP_STATUS=NOT_RUN_WINDOWS`; `FILES_REMOVED=0`; `SPACE_RECOVERED_MB=0`; `FILES_PRESERVED=PROJECT_SOURCE_AND_ROLLBACK_UNCHANGED`; `CLEANUP_BLOCKERS=NO_WINDOWS_WORKSPACE_ACCESS`.


## Client independent-review findings repair — 2026-11-03

The following supersedes the earlier client-candidate behavior above. It does
not qualify the SQL candidate or remove any PostgreSQL mutation guard.

- Every dispatched draft or review with a 5xx, transport/body timeout, lost
  reply or invalid acknowledgement becomes `NEEDS_RECONCILIATION`. It is not
  automatically or explicitly resubmitted by `syncDraft`, `reviewScope` or
  `reconnect`. Its idempotency identity is retained. A new valid receipt is
  required to report `SYNCED`; no no-write inference is made from an exception.
- Draft storage uses one immutable record per cryptographically random intent
  under `kts-team-draft-intent-v2:`, including server user and workspace IDs.
  A tab never replaces the shared account array or deletes another tab's row.
  The old v1 array is read-only migration input. Per-key localStorage writes
  provide indivisible record replacement, not a multi-key transaction: a crash
  between intent and dispatch-marker writes is safe because POST occurs only
  after both records are read back. A dispatch marker is never cleared.
- Same-intent dispatch is serialized with the existing origin Web Locks API.
  A stale tab sees the retained marker and must reconcile, even after another
  tab received an ACK. Missing locks, unavailable/corrupt/enumeration-incapable
  storage or failed read-back deny writes. These are fail-closed requirements,
  not storage-eviction protection or cross-device duplicate prevention.
- Public `setSessionToken` does not authenticate a caller-selected account ID.
  Before mutation, actual `/v1/session` must confirm the same server user,
  workspace, active membership and permitted role. Login derives the storage
  owner from this server result, not the supplied auth subject. Missing or
  mismatched identity cannot dispatch a financial POST. Session epoch is
  rechecked after asynchronous authorization and immediately before dispatch,
  including re-entrant UI callbacks and storage callbacks.
- `mutationTimeoutMs` bounds fetch and response-body consumption (default
  15 seconds, maximum 60). Aborting a request does not establish rollback.
  No token is stored in intent records; logout/discard clears the view only
  and leaves unresolved intent evidence available on the next same-user login.

Changed-path QA uses actual client public entrypoints with disposable network,
storage and lock dependencies. The raw findings suite tests missing/forged
identity and real dispatch ordering without the positive legacy fixture helper.
The helper supplies explicit positive identity/storage/lock dependencies to
older tests; it is test-only and cannot change production API enforcement.
The previous expectations allowing lost-ACK retry were replaced with negative
assertions requiring no second POST. No PostgreSQL or Android was started.

Independent reviewer findings are owner-provided input. Subsequent engineering
review is self-review and is not a new independent sign-off. Actual browser
localStorage/Web Locks, eviction/quota behavior, old-v1 tabs during rollout,
authoritative reconciliation/marker clearing and production acceptance remain
unqualified. The current UI displays the reconciliation state but has no
qualified resolution flow. Keep the database write block and release NO_GO.
