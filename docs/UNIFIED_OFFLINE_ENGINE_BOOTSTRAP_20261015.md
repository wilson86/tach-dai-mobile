# KTS Unified 1.0.18 — Android offline/root-iframe engine recovery

## Device failure (confirmed)
In private Tailnet HTTPS 8443 Unified 1.0.17, after offline reload the operator saw `Đang nạp lịch dùng chung…`, `LỖI: ENGINE_046935_NOT_READY` from Đá Vòng when re-pasting a valid `3d 12 32 42 52 dx5n`; 0/0 wagers. This means Unified's parent couldn't read the canonical engine from `#tachFrame` when the parent UI was present. **This is a failed offline gate**, not validation failure of the wager or proof that ledger data disappeared. Do NOT clear site data or ask users to reinstall.

## Root dependency
- `app/index.html` function `engine()` gets `tachFrame.contentWindow` and requires the canonical Mobile PWA engine methods and SHA `046935677f9d88468b71246410444c27435c72e1415aeb359c799452584c36eb`.
- Unified `app/sw.js` previously scoped to `./app/` and precached only parent app assets. That scope cannot intercept offline navigation to the sibling/root `../` iframe.
- Root `sw.js` caches `./index.html`, `./business_engine.generated.js`, `./station_calendar.generated.js`, etc., but its installation/activation was not assured from the Unified parent itself, allowing a state where only the parent UI loaded offline.
- The precise cause of the S25 failed root iframe (missing SW registration vs network/SW timing vs browser restrictions) is **NOT independently proven** from screenshot alone.

## Feature candidate (GitHub only, NOT staging)
- Branch: `fix/unified-offline-engine-readiness-20261015`, base `3e85fa3a33f9ddcf7647bd5acad377f4cdf5f72b`.
- Unified **1.0.18** app/index.html / core UX version / app/version.json / app/sw.js versioned core and SW cache updated.
- `app/sw.js` install CORE now precaches the *canonical root iframe* HTML `../`, `../index.html`, root `../sw.js` and the exact generated calendar and business engine JS, as well as previous Unified assets. These are local static assets on the same origin, no new external deps or business rule changes.
- Parent on load/online calls `prepareOfflineEngine()`: registers and checks active root scope `../sw.js` in addition to `./sw.js`, allows bounded install wait, checks the version-scoped app cache for all root assets and exact engine SHA, shows readiness or explicit missing state. **"Assets cached" is not physical offline acceptance.**
- If `ENGINE_046935_NOT_READY` occurs while loading, keep current output/ledger untouched rather than resetting it to empty/false success; show actionable error in DaVong. Shared schedule displays explicit offline engine unavailable state instead of endlessly saying "loading".
- Added `tests/unified-offline-engine-cache.js`: app/root SW mock install and offline root iframe navigation + generated scripts availability, root worker registration/scope, version consistency, engine-ready guard not erasing ledger.
- In-chat isolated V8 simulation tests `unified-offline-engine-cache.js` and `unified-versioned-ux-cache.js` PASS. **Native Node, actual Chromium, SW install and Android offline NOT YET RUN.**

## Required Codex qualification before private deployment
1. Work in isolated C: checkout of exact feature HEAD; verify status and AGENTS.md. No destructive clean/reset on existing local staged work.
2. Run native Node focused `unified-offline-engine-cache.js`, `unified-versioned-ux-cache.js`, `unified-static-tests.js`, `unified-child-select-all-dedup.js`, `davong-checkbox-ui-parity.js`, existing ledger/money suites; and strict canonical generator `--check` across pinned KTS/Mobile/Ngang unchanged business-engine heads. Engine digest MUST stay unchanged.
3. Real browser service-worker integration on new HTTPS staging only after backup:
  - online first load of Unified, verify root-scope worker active for ../, app-scope worker active for ./, both correctly scoped.
  - Cache keys and root HTML/JS present, hash/response correct, no catch-all fallback poisoning root with Unified index.
  - take *offline* with disabled Wi-Fi + mobile data (not only navigator.onLine toggle), hard reload the **same** URL; engine root iframe and generated assets must run and current source/remaining ledger stay intact.
  - verify offline mode switch to Tách Đài and Tách Ngang (both iframe SW scopes and assets), Đá Vòng rerun & Copy/Cut/Undo, selected money, no technical JSON, no resurrected wagers. Beware Brave privacy or SW disabled; report separately if browser policy blocks SW.
  - simulate slow iframe loads and unavailable engine while existing ledger present: should show an error without deleting wagers, and load recovery does not double emit pairs.
4. Backup existing private staging (Unified 1.0.17) with verified per-asset manifest + rollback ZIP hashes before replacing; patch only isolated Tailnet HTTPS 8443 app assets, DO NOT modify production 443→8787, public GitHub Pages, Router/Telegram/ACK/SQLite, E:/F: or paid CI.
5. Android physical acceptance remains PENDING until S25 screenshots/video confirm offline reload with source/ledger preserved **after** online warm-up. Do not clear cache/Browser storage to "fix" the bug.

Report: `SOURCE_SHA, ENGINE_SHA, CACHE_PREPARED, ROOT_SW_ACTIVE, APP_SW_ACTIVE, NATIVE_NODE_TESTS, OFFLINE_NAVIGATION, NO_WAGER_ERASURE, DA_VONG_PARITY, MONEY_PARITY, UNIFIED_CROSS_FRAME, GENERATOR_CHECK, VERSION_CACHE, STAGING_HTTPS_BYTES, BACKUP_ROLLBACK, ANDROID_OFFLINE, COST_USD, PRODUCTION_MUTATION, RELEASE_READINESS`.

Status: `OFFLINE_GATE_FAIL_1_0_17`; `FIX_FEATURE_PUSHED_1_0_18`; `STAGING_UNCHANGED`; `COST_USD=0`.
