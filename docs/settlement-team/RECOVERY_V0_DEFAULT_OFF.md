# M2 synthetic encrypted draft recovery candidate — DEFAULT OFF

**Not a release feature.** This bounded GitHub-only crypto contract is NOT loaded
by the pilot HTML, Team PWA, server or auto-runner. It cannot read or write
IndexedDB, localStorage, files, a network or the team ledger. It never imports
drafts to the live pending queue. It uses only WebCrypto and ships no keys or
passwords. Public GitHub fixtures contain fake identities and synthetic payloads.

## Proposed manual two-step flow (not yet exposed in UI)

1. A separately approved, server-authenticated caller supplies the exact
   `user_id`, `workspace_id` binding from trusted membership, a **dedicated
   recovery passphrase separate from the login password**, and an explicit
   collection of **1–30 synthetic** unsynced drafts (PENDING/CONFLICT/BLOCKED).
2. `seal()` validates fake-only scope/payload, safe revisions and original
   idempotency IDs. It derives AES-256-GCM keys with PBKDF2-SHA256 (310,000
   iterations), a new cryptographic random 16-byte salt and 12-byte nonce,
   and authenticated additional data derived from the exact account/workspace.
   The returned encrypted envelope is only an in-memory object; no automatic
   save, unencrypted export or device retention is claimed.
3. On a separate explicit recovery action, `open()` checks the fixed
   version/algorithm/size and performs authenticated decryption with the
   matching trusted identity and dedicated secret. Invalid keys, tampering,
   fake-vs-other tenants, malformed records and oversize data fail closed.
   Opened drafts are **QUARANTINED**, have `auto_retry:false`, and retain
   their exact previous idempotency IDs, payload and revision.
4. No `syncDraft()`, queue insertion, money calculation or financial
   approval follows. Before any real integration, a human must reauthenticate,
   reconcile every sealed intent's original receipt against the authoritative
   PostgreSQL ledger, verify actor membership, and explicitly decide which
   records are safe to retry. Retrying an unknown COMMIT with a **new** key is
   prohibited; server CAS/idempotency remains the final authority.

## Release blockers and limitations

The **unwired** v0 module is only a reproducible cryptography proof; it does
not satisfy M2 durable offline persistence, automatic crash recovery, key
management, session-owned encrypted cache protection, mobile browser quota
and eviction tests, user-account reauthentication, tamper-resistant signed
recovery audits, two-device restart, PostgreSQL backup/restore or the 65-case
independent HIOSKT financial oracle. PBKDF2 does not make a weak passphrase
safe. A future product must independently approve its threat model and
prove lifecycle recovery without storing the decryption secret alongside
the ciphertext. `GROUP_APP_READY=NO`, `REAL_MONEY_READY=NO`,
`RELEASE_READINESS=BLOCKED`.

## Default-off guard and CI source path

The contract workflow path filter explicitly includes
`app/settlement-team-recovery-v0.js`, ensuring standalone future code
changes cannot silently bypass the standard synthetic test job. A dedicated
Node test asserts the pilot HTML/start/UI and live sync client never import
this prototype; only the synthetic test harness exercises its API. Releasing
a browser download/import workflow requires a separate approved security and
device-qualification change, not a hidden new script tag.
