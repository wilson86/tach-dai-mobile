# Atomic review candidate — offline only

This candidate is not in the migration chain, has no runtime grant, and is not
wired to the server API. The actual ledger repository now has a candidate
`advanceReviewWithSessionProof` and `appendDraftWithSessionProof` methods using
the existing transaction adapter; it also has separate draft and review
reconciliation candidates. The composition explicitly blocks all of them. Keep that block and
all source pins.
Do not apply to production or use fixtures to claim PostgreSQL PASS.

The Node issuer hashes the opaque token locally; the database receives only a
double-hashed session identifier, a short-lived nonce, and an HMAC bound to the
complete review request. The candidate SQL obtains the corresponding active
session row with `FOR SHARE`, validates the proof, locks active membership and
identity rows, inserts a unique nonce and invokes the existing review function
within the caller's one database transaction. Revocation and mutations are
intended to serialize on the same session row. No authorization conclusion is
established until these claims are verified in real PostgreSQL.
Before returning a new or replayed result, the SQL candidate also requires a
matching actor-, scope-, event-, revision-, digest- and feed-bound receipt/event
join; mismatch raises an exception in the same transaction. This is unexecuted
SQL source, not evidence that the join or rollback works on PostgreSQL.

Security and operability blockers before any grant or activation:

- Independently review the proof scheme, logging and retention threat model.
  The stored session hash is an HMAC key; auth-role access, memory exposure,
  HMAC output in logs, replay races and brute-force resistance require review.
- Qualify the `kts_crypto` schema and the exact pgcrypto function owner,
  extension provenance, search path and effective grants. The SQL candidate
  now requires the named function to be an extension member of pgcrypto in the
  expected schema, owned by the superuser extension owner, and rejects PUBLIC
  CREATE on that schema. These catalog checks are unexecuted; direct or
  inherited grants to named runtime roles and owner trust still require review.
- Provision and audit the dedicated non-login owner, its effective grants,
  schema CREATE privileges, default privileges and all inherited/PUBLIC grants.
  This candidate deliberately grants no runtime EXECUTE or table permissions.
  The role probe has a separate opt-in inspection of the four candidate
  signatures and raw-function denial. Even matching fixture projections return
  `qualified:false` and destroy both clients: function bodies, owner and RLS
  are not verified. The legacy projection also rejects exposed candidate
  functions or missing function-catalog evidence. The composition does not
  activate this inspection or writes. These are Node fixture results, not
  PostgreSQL catalog or effective-grant evidence.
- Verify FORCE RLS under the actual function owner, session/identity/membership
  lock privileges and lock ordering, including revocation and role changes.
  Revoke access to raw mutation functions and direct writes before activation.
- Verify SQL compilation, encoding and Node/SQL HMAC parity, concurrent nonce
  reuse, duplicate idempotency, retry after rollback and lost-COMMIT behavior.
  Nonce retention and denial-of-service bounds are not designed.
- Qualify the candidate review and draft lookup paths,
  including behavior for revoked identities. The lookup deliberately returns
  UNKNOWN for missing, foreign or mismatched evidence and never invokes a
  mutation; its proof has a separate HMAC domain. It obtains row locks and is
  not a PostgreSQL READ ONLY transaction. A captured lookup proof can expose
  its matching result to a database caller with function access until expiry;
  proof handling and access control need independent review. A replay of the existing
  mutation function is not a read-only lookup: if no receipt exists it can
  create a mutation. Draft lookup also verifies the stored snapshot and returns
  UNKNOWN for missing or mismatched rows. There is no endpoint, runner
  integration or qualified recovery mechanism.
- Independently review all source changes and security assumptions. The owner
  checks in this candidate do not prove safe effective privileges or ownership
  of every callable function. Constant-time proof comparison is unverified.
  A captured proof can be raced for the exact signed operation before nonce
  consumption, making verified outcome reconciliation essential; parameter
  logging and database-client access must be evaluated independently.

Offline fixtures and a Python/Node HMAC vector are not a substitute for SQL,
privilege, concurrency, fault-injection or browser tests.

## Separate adversarial self-review — still not independent review

- Dependency execution identity: both exact legacy function overloads must be
  PL/pgSQL functions returning JSONB, SECURITY INVOKER, with the migration's
  exact `search_path=pg_catalog, kts_team` configuration. The candidate now
  rejects missing overloads or catalog configuration drift before creating
  objects. This is source-tested only; body identity, ownership, effective
  grants, trusted schema contents and concurrent DDL remain unqualified.
  This guard neither revokes existing legacy access nor authorizes activation.

- Actor spoofing: request-bound HMAC and database-derived session actor are
  present in source; crypto schema trust and effective grants are not proven.
  HMAC comparison now rejects NULL, but constant-time behavior is unverified.
- Concurrent logout: session row is locked in source and expiry rechecked after
  membership locks; real lock ordering and revocation races are NOT_RUN.
- Privilege escalation/RLS: candidate has no runtime grant and composition
  blocks calls. Dedicated owner permissions, callable function ownership,
  PUBLIC privileges, schema CREATE and FORCE RLS remain unverified.
- Lost COMMIT: lookup uses a distinct HMAC domain, does not invoke mutation,
  and returns UNKNOWN when no matching receipt is visible. Real isolation,
  cross-user access, in-flight commits and SQL behavior remain NOT_RUN.
- Receipt integrity: source requires actor/scope/event/revision/digest/feed
  join and rejects a non-replayed response with another event ID. This has not
  been executed in PostgreSQL.
- Draft proof binds the exact UTF-8 snapshot bytes as well as request metadata;
  SQL candidate compares the stored JSONB snapshot on replay. PostgreSQL/Node
  encoding parity, database-side canonical request-digest validation, and
  oversized or malformed JSON behavior remain unverified. Snapshot parameters
  may be visible in database logs; logging and retention need explicit review.
- Static review found missing PL/pgSQL body terminator semicolons; those were
  corrected. Source checks do not establish that the script parses or applies.
