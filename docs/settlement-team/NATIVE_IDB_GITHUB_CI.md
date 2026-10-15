# Native Chromium process-restart proof (disposable CI only)

This third workflow job uses preinstalled Chromium/Chrome on a hosted Linux
runner, a random 127.0.0.1 localhost port (never 8787), only two default-off
candidate recovery scripts, and a temporary test-owned browser profile.
It runs two separate Chrome CLI processes against the same browser profile:
save encrypted fake draft to native IndexedDB, then restart and verify
decryption to QUARANTINED, unchanged original idempotency ID, wrong-secret
and wrong-user denial, and no overwrite. An original ciphertext string is
verified after initial write. No financial HTTP route or POST is served.

The standalone proof JSON includes the pinned PR-head SHA, browser version
and stage outcomes; GitHub artifact upload runs even when the browser
test fails. Missing Chrome, missing DOM proof and any failed browser stage
leave the job red/BLOCKED. It does not install software or touch Windows,
Router, Telegram, E:/F:, Tailscale, customer data or live money.

A passing Linux-native Chrome browser restart on a disposable GitHub runner
does NOT establish Android phone restart/power-loss or eviction survival,
authenticated real device backup, independent HIOSKT 65-case oracle or
production readiness. PWA remains unwired. PR stays Draft/Open/Unmerged.

## Verified no-write browser QA boundary

The disposable HTTP server now counts every blocked non-GET request and
requires an actual count of zero before reporting PASS. A strict test-page
Content Security Policy restricts scripts to the same origin and disables
fetch/connect, forms and objects. This makes the CI artifact's
`financial_post_count=0` an observed test boundary, not a preset claim.
The real application remains DEFAULT OFF and no backend finance route
is served. This is not Android/device storage qualification.
