# KTS Settlement — proposed two-role recovery audit (SYNTHETIC ONLY)

Base SHA: 109f6b889bb4bb34355ea89b739ed65281a5803a; branch: codex/settlement-two-pool-security-admission-20261104.

Do not assume any reviewed production or pilot role configuration exists. New module team-settlement/two-pool-readonly-admission.cjs accepts two *injected* distinct Pool objects and expected LOGIN role identities. It creates no Pool, DB, secrets, sockets or DDL. Each pool gets a BEGIN, SET TRANSACTION READ ONLY, bounded catalog/privilege/setting SELECT, and COMMIT via existing pg-transaction-adapter.cjs. Missing COMMIT command tag must fail closed.

Proposed Auth role: needs SELECT credentials/sessions/membership and limited auth session INSERT/revoke; cannot SELECT recovery receipts or directly write financial tables. Proposed Ledger role: needs SELECT verified tenant membership and receipt; cannot SELECT credentials/sessions or directly write financial tables. Both must be separate session_user=current_user, no superuser/BYPASSRLS or membership inheritance, schema CREATE forbidden; same loopback database/server/port/postmaster epoch. These are DESIGN constraints, NOT grants to apply.

pg_default_acl count=0 merely reports no explicit default ACL override rows. PostgreSQL intrinsic function PUBLIC EXECUTE and pg_proc.proacl must be reviewed separately. Actual operational inherited/default ACL, proxy/app/error/backup logging, parameter proof redaction and tenant GUC authority are NOT_RUN. Observed PG log_parameter_max_length_on_error=0 and log_statement=none under both synthetic roles is a necessary but insufficient setting check. Zero log parameters is not an application/proxy/log retention audit.

The module returns SYNTHETIC_TWO_POOL_READ_ONLY_PROJECTION_PASS only if its *synthetic* role requirements pass; ALWAYS sets production_qualified=false, write_block=ENABLED, signoff=NOT_RUN and operational_pool_config=NOT_VERIFIED. No HTTP bind or PostgreSQL instance is started in this batch. Existing composer still prohibits financial mutations.

Next: native Node test in new C:-only checkout at exact HEAD; independent review of proposed synthetic provisioning/role grants; if source accepted, build standalone C:-only PostgreSQL16 supervised scratch harness with two separate *real authenticated* LOGIN roles, then real localhost HTTP receipt read-only tests. Keep unknown auto_retry=false and no real customer data. Never use an existing DB, E:/F:, install paid tools, run CI or merge/deploy.

RELEASE=NO_GO; COST_USD=0; NATIVE_PG=NOT_RUN; OPERATIONAL_ROLE_LOGGING=NOT_RUN.