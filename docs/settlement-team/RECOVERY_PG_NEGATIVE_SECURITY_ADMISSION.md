# KTS Settlement — adversarial real PostgreSQL HTTP recovery admission

**Source base:** `27f95b3b34dd5dd218466ea273a4bc71471eba12`  
**Review branch:** `codex/settlement-recovery-negative-pg-gates-20261104`  
**Candidate scope:** synthetic C:-only PostgreSQL 16, two independent LOGIN roles, default-off localhost HTTP receipt inspection. **Not production approval.**

## Source-bound prior acceptance
Windows/Codex reported the **base SHA** passes actual PostgreSQL 16 synthetic receipt MATCHED, missing receipt UNKNOWN/no resend, revoked session denial and 1 event / 1 receipt. Client/composition native fixture 11/11 PASS separately. The source-bound report is at `https://github.com/wilson86/tach-dai-mobile/issues/5#issuecomment-6627502244`; qualification SHA-256 `055C8B106BC7AF3D462050E09CF4EE980575C583B7860A0BF514A9774EFE868A`. Its two layers are **not** one browser-to-PG test.

## New negative checks (not yet run on real PostgreSQL at this SHA)
- `group_b` workspace substituted inside otherwise valid actor `group_a` quarantine intent: HTTP `422 TEAM_RECOVERY_QUARANTINE_REQUIRED`. This tests server-level denial of a forged tenant scope at the HTTP boundary, **not** protection if a DB caller can issue `set_config('kts.workspace_id',...)`.
- Matching idempotency key but changed synthetic request body/digest: HTTP `503 TEAM_RECOVERY_RECEIPT_UNVERIFIED`. Reject a false match even when an event/receipt exists for the original request.
- MATCHED, cross-tenant rejected and tampered rejected replies must not include the bearer token, original digest, private partner ID, actor ID, event ID, feed cursor or stored hash names. This is bounded **response** redaction only; does not qualify application/error/proxy/PostgreSQL/backup log sinks.
- Existing UNKNOWN `auto_send_enabled:false`, revoked session `401`, no app mutation and final count of **one** synthetic event and **one** receipt are retained.
- Tests keep HTTP `127.0.0.1`, freshly supervised synthetic PGDATA, exact SHA, installed pre-approved package-lock hash, PostgreSQL PID and port terminal receipts.

## Gates still blocking production
1. **Tenant authority:** PostgreSQL custom `kts.workspace_id` GUC is writable by clients. The server's per-request authenticated session binding, credential isolation, proxy trust and attempts at GUC spoofing must be independently reviewed. A synthetic cross-tenant HTTP denial does not resolve this trust boundary.
2. **Operational privileges:** two deploy-intended auth/ledger roles, all direct/inherited/column grants, schema CREATE, SECURITY DEFINER function owner, default/public EXECUTE and runtime role assignment must be reviewed *against actual intended config*. A synthetic fixture is no substitute.
3. **Logs and backups:** demonstrate redaction of bearer tokens, credential hashes, HMAC key/proofs, SQL parameters and sensitive payload across API/proxy/PostgreSQL/error observability/backups; verify role settings and retention, not only one `log_parameter_max_length_on_error` setting. Do not put raw secrets in GitHub issues.
4. **Full user path:** protected synthetic browser/Android persistence and restart -> authenticated HTTP -> **real PostgreSQL** -> reconcile UNKNOWN without duplicate POST. The native browser client fixture 11/11 and the server PG probe are separate proofs.
5. **Financial/user acceptance:** operator-approved money oracle and independent security/human sign-off; no provisional release based solely on synthetic runtime success.

## Immediate bounded Codex Windows qualification
1. Fresh C:-only checkout at exact new GitHub HEAD. Read AGENTS.md, zero-cost policy, five WILSON86 skills, context-guard and Issue #5. Native `node --test tests/settlement-pg-recovery-negative-gates.test.cjs` **only** (new source-contract regression). Do not repeat unchanged previous SHA 11/11 QA.
2. Using already approved local driver source/lock and existing isolated **supervisor/watchdog**, qualify the *new* negative checks on a **new** SHA-bound synthetic PG16 cluster (not prior PGDATA), capturing full `two_login_http_recovery` receipt and explicit status codes, marker, PID/port closed and preserved rollback/error evidence.
3. If real PG checks pass, continue read-only review of intended deployment roles, tenant trust and logging. Report unavailable operator configuration as `BLOCKED`; never infer sign-off, grant production privileges or remove write block.

**Cross-surface:** Settlement test probe + source contract `CHANGED`; Router/backend production, KTS Desktop, Mobile PWA client, Tách Ngang and generated shared engine `UNMODIFIED_BY_DESIGN`. This change does not purport to validate those user surfaces or settlement-money oracle.

**Hard stops:** `WRITE_BLOCK=ENABLED`, `RELEASE_READINESS=NO_GO`, no merge/deploy/production writes, no E:/F:, no paid CI/API, `COST_USD=0`.
