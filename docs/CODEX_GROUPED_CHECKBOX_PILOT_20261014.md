# KTS Grouped Checkbox UX — controlled pilot handoff (2026-10-14)

## Operator approval and boundaries
Operator approved a **controlled non-production pilot** and requested Tách Đài / Tách Ngang results grouped with touch-friendly row + group checkboxes, matching the familiar Đá Vòng UI. This is not an approval to publish the current public GitHub Pages sites or activate Telegram/Router AUTO.

## Source candidates as of preparation
- KTS qualified code `db7a33f2fa59665557ed4f6a145bd12aa475abf9`; docs-only release checklist head `4e5749f8987df9554f9e6ecdd71d2c48a83a2d15`.
- Mobile feature `feature/grouped-checkbox-results-20261014` derived from `c85404d2e478a9689e7364354819012b1ada1e8b`; initial UI+test SHA `8a0e2b70edbeda0ce7fb6bdc19505b2fba76eeae`.
- Ngang feature with same branch derived from `2752dc27f902db1fcfba84d2b3f916fea221c14d`; initial UI+test SHA `5dfe2f5694a47d07b4afc9fbfc1cc9e31b5dec65`.
- Canonical engine SHA remains `046935677f9d88468b71246410444c27435c72e1415aeb359c799452584c36eb`, unless a separately approved business-rule change is made.
- Github release tracking: `wilson86/tach-dai-mobile#8`.

## Interactive bounded Codex goal loop (max 3 tasks per batch, max 10 batches, $0)
1. Exact SHA/ancestry check and clean isolated **C:** worktrees for KTS/Mobile/Ngang; read AGENTS.md all repos and current release checklist. No E:/F: production, no real SQLite or Telethon, no paid CI.
2. Native Node tests in Mobile and Ngang (including `node tests/grouped-checkbox-results.js` and unchanged baseline regressions), 47-approved corpus, generator --check, Python focused backend/desktop as needed. Verify group checkbox, row checkbox, selected-only Copy and Cut, Select All, partial Cut, full Cut clears original source, Undo restores source/output, invalid text/zero result is visibly rejected. Check exact money/duplicates and sourceLine matching.
3. Run actual Chromium or Android WebView browser UI test if an already-installed local browser/test harness is available (do not silently install dependencies or initiate paid services). Verify group labels are informative, no HTML injection, usable on small displays, accessible checkbox/touch targets, keyboard focus, no stale selections or result when parser rejects. Verify Unified cross-mode shared input doesn't resurrect cut sources; Đá Vòng grouping unchanged.
4. If source issues found, fix all affected code and tests on feature branches only, 3 tasks/batch and checkpoint; don't alter Router business semantics for UI-only features. No new validation rules without owner oracle.
5. After code QA PASS, prepare synchronized **monotonic** PWA pilot versions: Mobile >=2.0.24; Ngang >=1.0.20; Unified >=1.0.8. Update KTS canonical `SharedBusinessEngine/pwa_version_templates.json` in an isolated feature branch; regenerate/check 10 artifacts & manifest from exact 3-repo workspace; update app version.json, APP_VERSION, display labels, service-worker cache keys and fallback, Unified JS UX_VERSION. Avoid hardcoded old hash. Never manual-edit generated engine assets.
6. Stage static copies under a **non-production HTTPS origin** for real Android service-worker testing (or STOP with `BLOCKED_STAGING_ORIGIN`). Do not publish GitHub Pages main or deploy current customer endpoints. For local Unified pilot, the existing Ngang iframe URL targets published `wilson86.github.io/tach-dai-ngang/`, which is **not the candidate**; in the **staging copy only**, rewrite that iframe to the staged Ngang path, retain source-branch URL unchanged. Proof must show both child frames run candidate SHAs and expected engine/cache versions. Keep test data synthetic.
7. Operator-verified backup: record existing **publicly deployed** static asset hashes/versions, service workers and rollback bundle, and actual staging origin; do not call a Git branch backup a production backup. If unable to verify, STOP without publish. Tailscale/private HTTPS staging allowed only when correctly configured; never enable public Funnel automatically, firewall exceptions/elevation require user action.
8. Android manual acceptance: confirm installed origin and version, online/offline cold-start, N035/N041/N042 reject, P016 accept, original Thiên divider sample accept, money/region dates, row/group/all checkbox, selective Copy/Cut/Undo, source sync across modes, cache update and revert. Capture screenshots and release receipts.
9. End in `READY_FOR_HUMAN_LIVE_RELEASE_APPROVAL` only after staging/device gates PASS; no public publishing, KTS Router/Desktop deployment, main merge or Telegram AUTO/ACK without a **second** user authorization. Save SHA- and version-pinned checkpoint in each repo.

## Reporting
`MOBILE_HEAD, NGANG_HEAD, KTS_HEAD, GROUP_UI_QA, NATIVE_NODE_QA, BROWSER_UI_QA, PARSER_CORPUS, MONEY_PARITY, CUT_UNDO, UNIFIED_INPUT_SYNC, ENGINE_SHA, GENERATOR_CHECK, PILOT_URL, BACKUP_HASHES, ROLLBACK_TEST, ANDROID_ON_DEVICE, COST_USD, PRODUCTION_MUTATION, RELEASE_READINESS, NEXT_SAFE_ACTION`.

Current qualification: grouped UI source committed; in-memory JS UI/corpus PASS; Node native, browser/Android, version/generator, staging and live release not yet proven.
