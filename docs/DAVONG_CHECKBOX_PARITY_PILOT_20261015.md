# Đá Vòng UI parity — controlled Android pilot handoff

## Operator report and source diagnosis
Operator reports **Đá Vòng does not display like Tách Đài and Tách Ngang** in Unified. Source review at pinned released Mobile `23e4e139e2adcaaed06f6d61ae01e9315cdf7bf7` confirms DaVong had its OWN tap-button group selection, no native group/row checkboxes, no integrated Undo or readable upper working source after a partial Cut. It also retained the original source when only some lower wager rows were cut, which would regenerate removed pairs on re-run.

**This is a frontend parity defect, not an approved alteration to DA/DX wager semantics or money**.

## Changes pushed to isolated feature branch
- Repo: `wilson86/tach-dai-mobile`; branch `fix/davong-checkbox-ui-parity-20261015`.
- Change scope: `app/index.html`, `app/unified-core.js`, `app/version.json`, `app/sw.js`, UI test `tests/davong-checkbox-ui-parity.js`, version guard `tests/unified-versioned-ux-cache.js`, and this document.
- Unified pilot patch version **1.0.17**, new service-worker key `kts-tach-unified-v1.0.17-davong-checkbox-parity-046935` and versioned `./unified-core.js?ux=1.0.17`. Mobile stays **2.0.30**, Ngang stays **1.0.26**; canonical Shared Engine SHA stays `046935677f9d88468b71246410444c27435c72e1415aeb359c799452584c36eb`.
- DaVong now renders group-level and wager-level native checkboxes with selected N/N and pair-group counters, like Tách Đài and Tách Ngang. Group checkboxes support indeterminate state, row selection has keyboard semantics, group/row Cut copies only selected wager lines.
- A DaVong **mode-local working row ledger** stores immutable original source, exact source-output rows and group/row identifiers; upper pane shows **Phần cược còn lại — đã tách** with native row/group checkboxes and Copy/Cut actions; original input is accessible via audit details/Copy tin gốc. **Never expose internal JSON in the customer-source textarea.** Rerunning the same raw source preserves the exact survivors without regenerating removed pair rows; Undo restores both top and lower views. Per-origin/date/region/engine reload persistence is app-scoped. When context differs, restore fails closed. Whole source-line Copy/Cut controls also exist for ordinary raw input.
- No modification to `KTS_UNIFIED.transformDaVongText` and no change to canonical parser, money, schedule, Router/Desktop or both child iframes. Do not send local working-row ledger as Telegram customer wager syntax.
- `tests/davong-checkbox-ui-parity.js` tests a synthetic 4-number DX input producing 3 groups/6 rows, single-row Cut, non-resurrection on rerun, readable source, Undo, exact localStorage reload and persisted Undo, whole-group Cut, and clipboard failure atomicity.

## Evidence / remaining gates
- In-chat isolated in-memory V8 DOM simulation of new DaVong checkbox test: PASS. This is **NOT native Node**, actual Chrome, physical S25 or cached/private HTTPS proof.
- Source/version static check on GitHub: change restricted to Unified app assets/tests; existing Mobile/Ngang/engine hashes are unchanged. No KTS canonical generator artifact was modified; generator manifest tracks 10 other artifacts and does NOT own `app/version.json`.

**Required next Codex Windows isolated C: qualification before private staging change**:
1. Check exact feature HEAD & ancestry from base; read AGENTS.md. Preserve worktree and stop on any tracked/untracked local changes; no destructive reset/clean.
2. Run `node tests/davong-checkbox-ui-parity.js`, `node tests/unified-static-tests.js`, `node tests/unified-versioned-ux-cache.js`, `node tests/unified-child-select-all-dedup.js`, Unified pair semantics/atomic negative cases, cross-frame mode-local tests, and pertinent existing Mobile/Ngang ledgers, 47/47 approved corpus. Run KTS canonical generator `--check` against **unchanged** KTS/Mobile/Ngang engine sources; if generator fails or static tests require code revisions, fix the actual problem, do not falsify the receipt.
3. Run actual browser DOM/WebView UX on isolated HTTPS staging after backing up current 1.0.16, with stage-relative Ngang iframe in stage COPY. Verify native checkbox group rows and count, source Copy/Cut and selected clipboard scope, Undo before/after rerun, offline cold start, SW 1.0.17 source digest, localStorage restore and fail-closed cross-mode. On errors, do not proceed.
4. Before testing reload, preserve existing synthetic/browser state and check key collisions; do not clear customer's site data. Android acceptance must be real device screenshots, not simulated.
5. If all code/browser/backup gates PASS, update ONLY private HTTPS 8443 assets: app/index.html, app/unified-core.js, app/version.json, app/sw.js (plus needed static file) and prove exact HTTPS byte identity, rollback ZIP/hash and Service Worker scope. Existing public Pages, Tailscale 443→8787, E:/F: production, Router/Telegram/ACK/SQLite and paid CI MUST remain unchanged. The person must separately authorize any public release.

Final receipt keys:
`SOURCE_SHA, DV_GROUP_CHECKBOX, DV_SELECTED_COPY_CUT, DV_TOP_WORKING_SOURCE, DV_UNDO_RERUN, DV_RELOAD_OFFLINE, DA_DX_MONEY_PARITY, UNIFIED_MODE_ISOLATION, NATIVE_NODE_QA, KTS_GENERATOR_CHECK, APP_VERSION_CACHE, STAGING_ASSET_HASHES, ROLLBACK_HASH, ANDROID_ACCEPTANCE, PRODUCTION_MUTATION, COST_USD, RELEASE_READINESS`.

Current status: `FEATURE_SOURCE_PUSHED`, `NATIVE_NODE=NOT_RUN`, `PRIVATE_STAGING=UNCHANGED_1_0_16`, `ANDROID_DAVONG_ACCEPTANCE=PENDING`, `COST_USD=0`.
