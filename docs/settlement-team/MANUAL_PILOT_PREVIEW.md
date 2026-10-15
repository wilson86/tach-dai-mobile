# KTS Settlement — Opt-in synthetic encrypted manual preview

**DEFAULT OFF.** The old `app/settlement-team-pilot.html` and all public
Mobile/Ngang/PWA pages remain unchanged. A separate, currently unhosted
`app/settlement-team-manual-pilot.html` includes the real isolated pilot
UI, plus an opt-in manual encrypted-backup screen. It requires a separate
16+ character recovery password, single-operation checkbox consent,
confirmation, and a new authenticated read-only `GET /v1/session` check.

- Save explicitly encrypts the **original** synthetic PENDING intent
  (including its idempotency key) and writes ciphertext to browser IndexedDB
  with a write-if-absent rule. Login password and bearer remain memory-only.
- Manual inspect in a new session does **not** requeue, resubmit or modify the
  original draft. It lists only IDs as `QUARANTINED`; content and decrypted
  payload never enter the DOM. A wrong secret returns no items.
- Both manual buttons require login; UI clears the separate recovery secret
  and consent after use. Logout or session rotation clears the prior actor's
  rendered preview. No background save, auto-retry, overwrite or delete.
- This preview explicitly labels that native browser storage can be evicted
  or deleted and that read-back acknowledgment is **not** durability proof.

Source-pinned CI includes six isolated Node UI safety cases. Its native
Chrome pilot job now visits the **separate opt-in HTML** as well, using two
Chrome processes on one disposable dedicated profile. It exercises fake
login, local draft creation, failure without consent, explicit encryption,
restart, wrong-secret denial, explicit QUARANTINED inspect, and logout;
the same random draft ID must be present on both sides. It requires five
synthetic logins/logouts total including the three previously qualified
pilot scenarios, observed read-only session checks, and **zero additional**
financial draft POSTs attributable to the two manual UI stages.

No CI pass authorizes opening a reachable pilot or storing real customer
records. Next real-world gates: explicit approval of isolated private HTTPS
service and test credentials, read-only server receipt reconciliation,
physical Android storage/restart/eviction validation, backup restoration,
the approved independent HIOSKT 65-case money oracle and owner/security
signoff. `GROUP_APP_READY=NO`; `REAL_MONEY_READY=NO`;
`RELEASE_READINESS=BLOCKED`; no deployment/merge.

## Authenticated server receipt check (fake-only, default OFF)

The separate manual preview now exposes a **third explicit button** that
performs a fresh recovery-password and checkbox-consent check, uses the
original quarantined draft (never a new idempotency key), and asks the
current authenticated actor's server to inspect immutable receipts. The
browser transport is `inspectRecoveryReceipts` and the server route
`POST /v1/recovery/receipts/inspect` is OFF unless separately enabled on
an isolated synthetic HTTP composition with its own tenant-scoped read-only
repository. Although the HTTP method is POST to carry bounded evidence, it
**must not** execute a database write, append a new draft or auto retry.

Only `MATCHED_SERVER_RECEIPT` or `UNVERIFIED_NOT_SAFE_TO_RETRY` and the
original ID are rendered. MATCHED is **not** a payout/settlement. Unknown
means never resend automatically. UI also clears previous actor results on
logout. Disposable native Chrome CI proves a manually backed-up unsent
fake draft remains UNKNOWN after a separate process restart, and checks
that a missing consent is rejected before the server receives any request.
No live network service or external HTTPS endpoint was deployed.

## Explicit disclosure before each fake-only receipt network request

A recovery inspection uses an **HTTP POST to transmit the decrypted
fake-only original intent** to an authenticated, separately approved HTTPS
server so it can compare immutable transaction digests. HTTP POST here
means *read-only receipt inspection*; it is NOT a financial append/retry.
The new visible warning and synchronous operator confirmation say exactly
what will be transmitted. The manual UI requires a new recovery passphrase,
checkbox consent and account verification on each attempt. An unavailable
or disabled server returns no trusted MATCHED result and does not change
the local PENDING queue. No real identities or customer records are allowed.
