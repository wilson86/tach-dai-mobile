# KTS Settlement — Caller-writable tenant GUC security observation

**Source baseline:** `e3900108d1148e03810a39dd8d1fdc5231653b7f`  
**Review branch:** `codex/settlement-tenant-guc-isolation-diagnostic-20261104`  
**Scope:** TEST-ONLY observation inside a fresh, SHA-pinned, supervised C:-only PostgreSQL16 synthetic cluster, with two separately authenticated LOGIN roles. No deployment, real data, or production mutation.

## Threat model and meaning

The legacy RLS policies compare `workspace_id` with `current_setting('kts.workspace_id',true)`. The backend's recovery repository does set the parameter from a server-verified actor and rechecks membership inside each read-only transaction, and the default-off HTTP probe has shown that a forged browser scope is rejected.

Those positive checks do **not** prove that the PostgreSQL custom setting itself binds a tenant to the *database login*. The authorized test-only Ledger LOGIN has `SELECT` permission on the receipt table and could be used through compromised server credentials, SQL injection in a privileged query surface, or misconfigured direct database access. The same LOGIN could set its own `kts.workspace_id` to another tenant without PostgreSQL knowing the authenticated browser account.

The new `team-settlement/tenant-guc-observation.cjs` deliberately demonstrates this **inside one READ ONLY transaction with a disposable synthetic fixture**: under exact `synthetic_recovery_ledger` current/session roles it sets the GUC to `group_a`, expects the known foreign `group_b` receipt to be hidden, switches to `group_b`, and checks that the same known receipt becomes visible. It rolls back and destroys the diagnostic DB client. It outputs **booleans/status only**, no rows, tokens, hashes or passwords. All values, account roles and fixture keys are explicitly hardcoded to prevent generic DB misuse.

**If the observation matches the fixture**, the status is `SYNTHETIC_CALLER_WRITABLE_GUC_EXPOSURE_OBSERVED`. This is a correct negative security finding: GUC-backed RLS **by itself** is not tenant authority against an attacker controlling the Ledger LOGIN connection. It does not prove any live SQL injection or production credential compromise exists. The current API's scope rejection and app-level membership checks are important controls but still need independent deployment and injection-surface verification.

**If the observation is absent or inconclusive**, no success is inferred. The standalone probe fails closed and preserves failure logs. A future stronger DB design should prove tenant binding to non-forgeable authenticated authorization, not simply prevent `set_config` in a single tested request.

## Source and receipt gates

- Only `team-settlement/tenant-guc-observation.cjs` and its synthetic Node fixture test are new; the existing **test-only** PostgreSQL recovery probe calls the observation after positive MATCHED/UNKNOWN/revocation/negative HTTP checks and the strict 1 event / 1 receipt invariant.
- `scripts/settlement-pg-isolated-migrations.cjs` requires the observation marker and records `tenant_guc_trust.deployment_qualification=BLOCKED_TRUSTED_TENANT_AUTHORITY`, separately from `two_login_http_recovery.passed`. A passing *observation* is not production security PASS.
- No change to `team-settlement/team-composition.cjs`, RLS migrations, grants, raw mutation paths, Router, Windows, Mobile, Ngang or production. `WRITE_BLOCK=ENABLED` always.

## Next independent qualification

1. New C:-only checkout on the exact head; run `node --test tests/settlement-tenant-guc-observation.test.cjs` only. Prior HEAD PostgreSQL HTTP and client 11/11 QA remain attached to their original SHA.
2. If native Node PASS, create **new** SHA-pinned synthetic PG16 with the pre-approved local pg lock and existing supervisor/watchdog, preserving old PGDATA and receipts; inspect `tenant_guc_trust`, status marker, 1:1 receipt/event, PID/port closure. A re-run is required because this is a new threat-model scenario, not repeating unchanged prior QA.
3. Review actual intended operational database role/pool/proxy boundaries, effective/default/public function ACLs and logging redaction. If no reviewed deployment configuration or human sign-off, `RELEASE_READINESS=NO_GO`. Separate browser/Android restart through true PostgreSQL reconciliation and financial oracle remain `NOT_RUN`.

No auto-merge/deploy, no E:/F: access, paid CI or installation; `COST_USD=0`. This is **not** production SQL remediation and does not authorize unblocking writes.
