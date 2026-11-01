# Synthetic scope privilege candidate — not a migration

Status: **DESIGN ONLY; NOT VERIFIED; NOT READY FOR LIVE ACCEPTANCE**.
Current draft and review functions are `SECURITY INVOKER` and directly write
`kts_team.scopes`. The Windows synthetic ledger role currently has direct
INSERT and UPDATE on that table. Its RLS policy scopes by workspace; the
repository supplies actor and workspace via caller-set transaction settings.
Consequently, neither revoking the writes alone nor changing only the function
security mode establishes the requested actor boundary.

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
