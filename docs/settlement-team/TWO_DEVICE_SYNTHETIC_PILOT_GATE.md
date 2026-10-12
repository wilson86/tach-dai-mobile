# KTS Settlement Team — separate physical two-device synthetic pilot gate

**Draft as of 2026-10-12. Not authorization to expose a service or to use actual money.**
GitHub PR #6 remains Draft/Open. Current operator-reported Windows test at
`9cd32b0950b9c4a6afc4ff31c035d1d3660c97c5` used an **ephemeral HTTP
listener bound to 127.0.0.1 only**, with actual Node/PostgreSQL/PWA synthetic
fixtures. That is not a two-device or network security acceptance.

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
