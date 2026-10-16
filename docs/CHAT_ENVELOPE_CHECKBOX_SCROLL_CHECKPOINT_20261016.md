# KTS Unified / Tách Đài — Telegram envelope display and checkbox no-scroll (2026-10-16)

## Exact authority
- Repository: `wilson86/tach-dai-mobile` (PUBLIC); base main `ec016c9d65cd78bf8e4ce29448ba021b54f8f0d9`.
- Branch: `fix/chat-envelope-checkbox-no-scroll-20261016`.
- **Code/test SHA:** `edb760d5cebb54a9bf69797d0049dbe87f2682a7`.
- Companion `wilson86/tach-dai-ngang`: base `909d4c6c29a1c0e1adea07a43e81ee6056ca09c7`, candidate source `f9ec1911334f3682a5d5e221cf836df70be1efd2`.
- Exact user synthetic/redacted reproduction:
  ```text
  [10/16/2026 5:36 PM] Hiền: 92 82 da 10n
  [10/16/2026 5:37 PM] Hiền: 68 86 39 da 5n
  [10/16/2026 5:37 PM] Hiền: 26 68 da 3n
  26 86 da 3n
  ```
- Expected preprocessor output without inferring missing station/2d:
  ```text
  92 82 da 10n
  68 86 39 da 5n
  26 68 da 3n
  26 86 da 3n
  ```

## Root-cause evidence and isolated source changes
1. The existing root Mobile/Ngang chat preprocessor already detects US-date bracket timestamp / sender correctly. **Unified Đá Vòng** `app/index.html` passed the stripped text downstream but did NOT display it in `dvInput`, even on validation failure. New `beforeChatNormalize()` displays the derived betting lines and preserves the copied original in the Undo snapshot plus `raw_original` audit field in the local exact-output ledger. The original can be viewed/copied from the working-source panel. Engine money/station code unchanged.
2. Native grouped result checkbox `change` handlers in standalone Mobile, Ngang and Unified Đá Vòng invoked `renderGroupedResults()/render()`, destroying focused DOM inputs and the user's scroll anchor. New selection-only refresh updates checkbox state, indeterminate group state, selected summary, Copy/Cut button counts and paired working-source checkboxes **without replacing the DOM**. Actual row creation/deletion/CUT/Undo still renders.
3. Regression additions: `tests/grouped-checkbox-results.js` (Mobile + Ngang), `tests/davong-checkbox-ui-parity.js`, `tests/unified-static-tests.js`. Preserve all physical money lines including 4th continuation line and exact Undo source.

## QA evidence, bounded and honest
- Live GitHub-file V8 **syntax compilation PASS**: 8 modified browser JS/test sources across two repositories (current exact code blobs).
- Live GitHub-file V8 **actual ingress preprocessing PASS** with exact screenshot fixture: `looksLikeChatLog=true`, exact expected 4 normalized wager lines, no content loss.
- Live GitHub-file V8 **fake DOM smoke PASS**: root Mobile and root Ngang generated 2 groups; checking first group causes **0 DOM replacements**, same checkbox node retained, selected summary updated (Mobile 1/4, Ngang 1/3) without changing source.
- Live GitHub-file V8 **fake DOM smoke PASS**: Unified Đá Vòng 3 groups/6 rows; checking first row causes **0 DOM replacements**, retains same checkbox node, summary 1/6.
- **Node test suites** `node tests/grouped-checkbox-results.js`, `node tests/davong-checkbox-ui-parity.js`, `node tests/unified-static-tests.js` and bounded regressions **NOT_RUN** in real Node environment; operator may execute C:-only.
- Browser visual QA / actual phone scrolling **NOT_RUN**; no page refresh was claimed.
- Engine/generated/calendar/business-rule files **UNCHANGED**. Money oracle **NOT_RUN** (not a money parser fix).
- Router, Desktop, backend, reports: `UNMODIFIED_BY_DESIGN` for this UI bug; **live parity not verified**.
- PWA `app/version.json`, `app/sw.js`, root `version.json`/`sw.js` unchanged; **cache/version/delivery readiness BLOCKED until separately approved release bump and on-device smoke**.
- `COST_USD=0`; production/Telegram/SQLite/E:/F: none; `MERGE=NO`, `DEPLOY=NO`, `GITHUB_CI=NOT_RUN`.

## Safety
- Stripping sender/time is metadata-only; no assumption that `92 82 da 10n` is a valid MT input without region/station/2d semantics. If its wager syntax is invalid, continue to HOLD and display the cleaned line plus validation error.
- Preserve raw source, no silent rewrite of amounts, no generated money engine changes, no lost wager/duplicate source and no partial dispatch.
- Other chat formats outside the approved fixture have not been exhaustively qualified.

## Next safe batch (max 3)
1. C:-only checkout at exact code SHA, run targeted new regressions for both repos and existing impacted tests with installed Node. Capture counts, source identities and `git diff --check`.
2. Static/published-asset drift audit: version, SW cache key, iframe URLs, generated engine SHA, no unapproved auto deploy; do NOT bump/deploy without separate owner approval.
3. After explicit release approval only: versioned PWA rollout and manual Android/Windows scroll/Undo/sender-strip QA; do not claim ready beforehand.

`RELEASE_READINESS=BLOCKED_PENDING_LOCAL_AND_DEVICE_QA`, context-guard `ELEVATED`. This is a feature-branch only.
