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
