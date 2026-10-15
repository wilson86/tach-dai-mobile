# KTS Settlement Team — separate physical two-device synthetic pilot gate

**Status 2026-10-14: restricted synthetic two-device qualification reported on
exact SHA `718a84d46318924e7c89c2c045f538a39ec31553` only.**
GitHub PR #6 remains Draft/Open. Authorized *temporary* tailnet-only HTTPS
physical pilot completed and was fully dismantled. The operator reports two
physical logins, private TLS, CAS one-winner conflict, offline phone PENDING
then same-document reconnect with one verified PostgreSQL receipt; detailed
private evidence remains only on Windows C:. This is NOT permission to expose
a permanent service, accept real data/money or claim the resulting new source
revision has itself passed physical QA. The earlier loopback-only test at
`9cd32b0950b9c4a6afc4ff31c035d1d3660c97c5` was a historical gate.

## Exact operator approval barrier

A separate, explicit approval must identify: (a) the two physical devices and
their trusted operators, (b) the private connectivity method and the intended
nonpublic hostname/origin, (c) how TLS identity and valid certificates are
provided/verified from both devices, (d) how traffic reaches a **new isolated
test-only** backend without exposing PostgreSQL, (e) time-bounded listener
start/stop, local-only evidence location and rollback steps.

**No blanket "continue" or green CI implicitly approves** opening LAN,
VPN/Tailscale services, firewall rules, public tunnels, DNS, port forwarding,
proxy ingress or persistent background processes. Do not reuse port 8787 or
touch the live KTS Router/Telegram service. PostgreSQL stays 127.0.0.1:5433.

## Preflight — read-only, Codex Luna appropriate

1. Verify exact repository SHA and both GitHub CI jobs; do not infer that an
   older Windows receipt proves a changed HEAD. Review the local synthetic
   evidence and confirm the listener and all pools/processes are terminated.
2. Verify trusted operator/device ownership, network path, browser origin and
   the *proposed* certificate chain without changing firewall/Tailscale.
3. Confirm host services and listening ports, especially the occupied 8787,
   and the isolated synthetic DB and nonprivileged Auth/Ledger roles.
4. Confirm no secret data, passwords or HIOSKT evidence will be copied into
   public GitHub, browser logs, screenshots or group chats.
5. Confirm a plan to clean up *new* synthetic test fixtures while preserving
   prior evidence and named database restores.
6. Confirm test runner and UI show `MEMORY_ONLY` plus the volatile pending
   draft count. Browser reload **loses** an unsent draft; that behavior must be
   disclosed and may NOT be claimed as offline-durable.

## Gated physical test — only after separate approval

- Use **two physical browsers/devices and two distinct synthetic accounts**,
  each authenticated through an operator-reviewed HTTPS/TLS private endpoint.
  Browser `http:` across a remote network must fail closed, even when the API
  defaults to same-origin.
- Server authenticates each session from distinct durable DB identities and
  re-verifies workspace membership for every ledger transaction. Test same
  workspace shared reads, cross-workspace denials, role revocation and stale
  session denial.
- Race a draft with the same revision across devices; exactly one COMMIT
  returns verified receipt, the other receives conflict and cannot silently
  overwrite. Replay must return the original event and no duplicate.
- Test short loss of connectivity, refresh/login/logout, and an offline
  unsent draft. **Do not use real customer text/money.** Reload loss must be
  reported as a blocked product capability, never accepted as safe storage.
- Verify a consistent ordered SQL feed, redacted receipts/counts, ephemeral
  server PID/start/stop, and a PostgreSQL restore from a NEW synthetic backup
  if any schema/restore mechanism changed.
- Close listener/proxy and both DB pools, verify listener port disappears,
  remove temporary credentials/sessions and confirm no network service or
  scheduled task remains. Fail and roll back on unexpected exposure.

## Release invariants (never automatically promote)

- `TWO_DEVICE_PILOT_READY=YES` only after **physical** TLS/private-device
  evidence is reviewed and the unsent-draft loss is explicitly disclosed for
  the *restricted synthetic test*; this does not mean usable offline finance.
- `GROUP_APP_READY=NO` and `RELEASE_READINESS=BLOCKED` until durable
  offline draft policy, real user provisioning/auditing, backup/restore,
  human workflow, approved private HIOSKT 65-case corpus/independent exact
  money oracle and explicit operational owner sign-off are satisfied.
- No changes to Router/Telegram, E:/F:, production database, release
  channels, or public GitHub private evidence. No paid infrastructure.

## Synthetic Team UI shell — GitHub-only source changes after physical pilot

An opt-in `app/settlement-team-pilot.html` now includes standalone Team
login/workspace context, fixed synthetic-only DRAFT payload and fake_* partner
validation, manual sync/reconnect, scope/change-feed readers, conflict/status
display, and a `beforeunload` unsent-draft warning. Its CSP permits only
same-origin API calls, scripts and styles. The legacy `settlement.html` does
not initialize this UI, so current operators are unaffected.

New GitHub changes to this UI require their own exact-HEAD source/Node CI; they
do not invalidate the historical **reported physical proof on its old SHA**,
but cannot inherit that physical evidence as a fresh test. A test-only HTTPS
backend must separately serve the page, scripts and `/v1` API routes on one
trusted origin. NEVER reuse the existing Serve mapping to
`127.0.0.1:8787`, and never assume 8443 is currently active. Browser-native
unload warnings are unreliable; current draft persistence remains MEMORY_ONLY.
