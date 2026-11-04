# Receipt V2: security review handoff

Status: BLOCKED, self-review only. This document is not independent approval,
an executable migration, or permission to enable writes. Keep WRITE_BLOCK on.

## Source findings at parent commit 3eb4dfc

* `receipt-v2-auth-boundary.cjs` locks the Auth session and membership rows
  during its transaction and checks session expiry before and after the trusted
  callback. Those checks do not lock a separate Ledger transaction, undo callback
  side effects, or prove validity when a proof is later consumed.
* `receipt-v2-session-handle.sql` is review-only and gives existing sessions a
  null handle; its uniqueness and migration behavior have not been verified on
  PostgreSQL for this source identity.
* `tests/fixtures/receipt-backend-proof-v2.cjs` is a Node review fixture. It
  neither establishes protected backend key custody nor supplies a SQL verifier.
  Its `verifiedSession` input is only trustworthy when its caller is protected.
* `session-bound-receipt-read-v1.sql` is an unwired V1 candidate, not a V2
  verifier. Its HMAC key is derived from the bearer and thus is computable by
  the bearer holder; its own comments state that it does not authenticate a
  trusted backend or prevent replay. It must not be used as a V2 substitute.
* `001_team_ledger.sql` enables FORCE RLS for its scoped ledger tables, but
  policies based on a caller-controlled tenant setting do not alone prove that
  a Ledger login with direct SELECT cannot choose another tenant. Effective
  direct and inherited privileges remain unverified.

## Independent review and qualification gates

1. Specify and review a real V2 SQL verifier and its exact canonical encoding,
   approved key origin, storage, access, rotation and revocation. Bind purpose,
   key id, session handle, actor, workspace, exact ordered request keys, nonce
   and bounded timestamps. Review replay and proof exposure explicitly.
2. Specify the authorization linearization point and isolation/locking model:
   a separately committed Auth check cannot ensure that Ledger use is atomic
   with logout, membership revocation or identity disablement. Verify the chosen
   model covers expiry while waiting and expiry at the use boundary; establish
   what may be returned when concurrent revocation commits.
3. Review the non-login function owner, effective inherited and PUBLIC grants,
   default ACL, schema CREATE, exact crypto function provenance, search_path,
   direct table access and FORCE RLS as that owner. Confirm raw mutation and
   direct tenant reads are denied to both runtime LOGIN roles.
4. Independently approve logging and backup handling so tokens, session hashes,
   signing keys and proofs cannot leak through database parameters, API/proxy
   logs, errors, diagnostics or backups. Source fixtures do not prove deployed
   logging or key management.
5. Only after design approval, run an isolated supervised PostgreSQL 16 cluster
   with fresh synthetic data and reviewed roles: SQL compilation and catalog
   assertions; tenant GUC forgery; direct SELECT denial; valid and invalid
   proofs; expiry, logout and role-revocation races; connection loss; transaction
   commit/rollback; and ownership-scoped shutdown. Bind receipts to exact SHA.

Release remains NO_GO until independent approval, real runtime evidence and all
other required production controls are established. Fixture PASS is not that
approval, and no PostgreSQL test is authorized by this document alone.
