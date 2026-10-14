# KTS Settlement IndexedDB — native browser qualification (NOT RUN)

**Authority:** PR #6, pin and verify its exact feature-branch HEAD before testing.
No release or phone-storage claim follows from mocked Node CI.

## Approved testing boundary

Use an isolated synthetic-only checkout and temporary browser profile under C:.
Do not access production, E:/F:, customer data, Router, Telegram, Tailscale,
port 8787, normal user browser profiles or any existing services. Do not
install/download packages, deploy or generate a financial POST.

Load only `settlement-team-recovery-v0.js` and
`settlement-team-recovery-idb-v0.js` on an isolated secure localhost origin
using an installed Chromium or Edge, if available. Leave the actual pilot
HTML unchanged and the recovery module default-off.

Verify the native browser independently:
- Secure-context checks, blocked upgrade, unexpected schema, quota failure.
- AES-GCM ciphertext only, atomic `add`, no overwrite and exact read-back.
- New tab and browser restart with the same *test-owned* profile.
- Wrong secret, forged workspace, malformed backup, safe quarantine state.
- No automated retry, HTTP transaction, financial submission or queue import.
- Test file/profile cleanup only after preserving bounded synthetic QA proof.

Record browser version, SHA, PASS/FAIL/SKIP per case, reproducibility,
negative checks and process cleanup. If no installed browser or permitted
automation is available, record **NOT_RUN** instead of PASS.
Native phone power loss, storage eviction, server receipt reauthentication,
financial HIOSKT 65-case oracle and release signoff remain unproven.

`GROUP_APP_READY=NO`, `REAL_MONEY_READY=NO`,
`RELEASE_READINESS=BLOCKED`, no merge or deploy.
