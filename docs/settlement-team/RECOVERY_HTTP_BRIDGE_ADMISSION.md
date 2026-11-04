# KTS Settlement — next operational-security and integrated recovery admission

**Bound to source** `ce3348b5ec354c2f66e534269d3298f9502ca032`; extend only on `codex/settlement-recovery-bridge-acceptance-20261104`.

## Confirmed evidence and limits
Windows Codex reported PostgreSQL 16 synthetic migration, FORCE RLS, LOGIN effective privileges and candidate atomic races PASS at `ce3348b5ec354c2f66e534269d3298f9502ca032`; local checkpoint `KTS_EFFECTIVE_GRANTS_AUDIT_20261104.json` has user-reported SHA-256 `60B505403B2A771D0DEE0AAA690D6901B4B55D2EBA3CCA2E2A765AACA82AAE62`. This was reported with a stopped supervisor and closed port. It **does not qualify production pools or logging**.

The new test `tests/settlement-team-recovery-encrypted-http-bridge.test.cjs` checks the actual synthetic code path *encrypted in-memory vault -> explicit operator consent -> QUARANTINED -> localhost HTTP POST -> authenticated `createIsolatedTeamPrototype` -> injected read-only ledger receipt*. Positive match, missing receipt UNKNOWN, and rejected session are separate cases; it also asserts no financial resend/write and no sensitive response. The database transaction adapter is fake. **This is not a real PostgreSQL integrated recovery test, real browser/IndexedDB durability, TLS, physical Android, or production release proof.** The test binds localhost dynamically and stops its own server in `finally`; it must never run on an externally bound origin.

## Next three bounded Windows tasks
1. Fresh isolated C: checkout, exact Git HEAD and policy. Run `node --test tests/settlement-team-recovery-encrypted-http-bridge.test.cjs`; existing passing tests on the unchanged old SHA do not need repetition.
2. Independently verify **intended (not production) two-role pool configuration** and effective privilege/default-ACL report plus PostgreSQL application/proxy/error/audit/backup logging redaction plan. Do not connect production or expose credentials. Mark unknown actual deployment paths `NOT_RUN`, not `PASS`. Never put session hashes/proofs/passwords in public issues.
3. After the source bridge passes, design an isolated **real synthetic PostgreSQL HTTP receipt** acceptance using separate reviewed auth/ledger roles, a fresh supervised C:-only cluster and locally scoped loopback. Require authorization for any non-loopback/TLS/device test. Keep `WRITE_BLOCK=ENABLED`, all mutation routes default-off and unknown COMMIT `auto_retry:false`.

**Release remains NO_GO** until operational identity/roles, privileges/default ACL and end-to-end logging are independently signed off, mobile storage/crash recovery is verified, and the operator-approved HIOSKT 65-case oracle and user acceptance pass. No merge/deploy/production/E:/F: access, CI cost USD 0.
