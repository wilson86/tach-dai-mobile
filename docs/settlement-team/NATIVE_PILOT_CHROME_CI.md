# Native Chrome real pilot UI end-to-end, disposable synthetic only

The test-only `native-pilot-ui-contract` job opens the repository's
**actual** `settlement-team-pilot.html` in a real Linux Chrome browser.
Only a test controller and redacted proof target are injected at render time;
the committed pilot HTML, UI, sync client and audit scripts are unchanged.

A localhost-only Node fixture simulates one fake operator in `group_a`.
It allows exactly one synthetic create_draft write, checks the
idempotency-key shape and fake-only payload, and returns the original event
receipt. Native browser actions exercise pilot login (password cleared),
PENDING warning, draft SYNCED with fake receipt, read-only scope, contiguous
change-feed, and revocation/logout. Hidden review controls stay hidden.
Unknown routes and non-fixture writes are rejected and counted. No money
calculation, production host, real credential or external HTTP service.

The source SHA, Chrome version, fake login/draft/logout counters, rejection
counter and proof result are uploaded as a redacted JSON CI artifact, even
on failure. This proves a browser UI flow **with an injected synthetic
HTTP fixture**, not real backend authentication, two actual phones, Android
IndexedDB crash durability, HTTPS operational readiness or 65-case HIOSKT
financial approval. No real-money or app deployment can be inferred.
