# KTS Mobile + Unified versioned release staging — 2026-10-16

## Authority (NOT DEPLOYED)
- Public repo: `wilson86/tach-dai-mobile`.
- Tested bug-fix PR #10 at **exact** `5fc9e388d3c96063b1ef40790b9a57a05676217a` (DRAFT, unmerged), base `main` at `ec016c9d65cd78bf8e4ce29448ba021b54f8f0d9`.
- Companion Ngang tested bug-fix PR #2 exact `c4a0c1a275b128f3a7629e7166a45d913c86702d` on `main` baseline `909d4c6c29a1c0e1adea07a43e81ee6056ca09c7`.
- NEW staging branch `release-review/chat-envelope-checkbox-20261016` branched from TESTED Mobile PR #10 HEAD; target later review against that feature branch; no writes to main.
- Pre-checkpoint **version-stage code+test HEAD** = `73546a84b3d8ff5e25e1b5d8b34ec0780583ff32`.
- Origin offline QA supplied by operator: `15 Node scripts PASS / 0 FAIL / 3 Ngang Unified-only SKIP`. Checkpoint named `CHECKPOINT_UI_FIX_FINAL_OFFLINE_QA_20261016.md`, operator supplied partial SHA256 `0C2E88A0…0D7A7B71` (file/full hash not independently accessed). Those PASS tests apply to tested prior source SHAs, **not** automatically to this version-stage SHA.

## Stage changes, branch-only, no publication
- Mobile root `2.0.30` -> **`2.0.31`**: root `index.html` label and `APP_VERSION`, `version.json`, `sw.js` unique cache `tach-dai-mobile-v2.0.31-chat-scroll-focus` + offline version fallback.
- Unified `1.0.18` -> **`1.0.19`**: `app/index.html` UI label, versioned `unified-core.js?ux=1.0.19`, offline cache readiness key; `app/unified-core.js` UX_VERSION; `app/sw.js` matching unique cache `kts-tach-unified-v1.0.19-chat-scroll-focus-046935` and precache; `app/version.json` and two pinned static regression test files aligned.
- New `tests/release-review-asset-consistency.js` only checks coherent release metadata, script URL, root/nested offline assets and common generated engine checksum.
- Existing manifest scope, service-worker route/fallback behaviors, sibling Ngang iframe URL, exported wager state, all business engine / station calendar files and rules **unchanged**. Shared business-engine SHA `046935677f9d88468b71246410444c27435c72e1415aeb359c799452584c36eb`.
- Ngang complementary version candidate **`1.0.27`** is separate, staged from its own previously tested fix SHA, never automatically published from this branch.

## QA for NEW staging SHA
- GitHub-source V8 **SYNTAX PASS** on updated root/app SW, app index inline JS, Unified core, version-pinned test scripts and new release review test.
- GitHub-source deterministic **13 release asset assertions PASS**: version equality, cache identity, script query, precache, normalized engine checksum, relative manifest scope, root navigation and iframe path, old URL not accidentally reused.
- **Real Node script execution on version stage = NOT_RUN**, including `node tests/unified-versioned-ux-cache.js`, `node tests/unified-offline-engine-cache.js`, `node tests/release-review-asset-consistency.js` and `node tests/unified-static-tests.js`. All future PASS must be SHA-bound.
- **GitHub CI = NOT_RUN**, **Android/browser visual QA = NOT_RUN**, **PUBLISHED_ARTIFACT=UNCHANGED**, **DEPLOY=NO**. The prior 15-script QA cannot be relabeled current staging QA.
- No PWA install, live Telegram, SQLite, Router/backend, E:/F:, live settlement, deployment or cache reset. `COST_USD=0`, `PRODUCTION_MUTATION=NONE`, `MERGE=NO`.

## Release gate and acceptance
1. Isolated Windows C: targeted stage QA on exact new code HEAD. Do not blanket rerun old 15 scripts PASS unless changed surface requires it. Check companion Ngang stage release test, exact tree, manifest and SW references.
2. Obtain distinct human approval for main merge / GitHub Pages release. Not implied by QA completion. Keep both PRs DRAFT until approved. No auto-paid CI triggers.
3. AFTER approved release only, manual Android Chrome and desktop browser verify: copied US-date Telegram chat is visibly stripped in Đá Vòng before validation (four wager lines and continuation survive); wrong station/cross-region still HOLD without partial output; Undo restores exact original; checkbox row/group selections retain scroll position; Cut/Copy/Undo preserve amounts; offline reload doesn't resurrect cut rows; shared-mode local-only ledger does not leak to Ngang.
4. Release rollback: preserve known good `main` SHAs and current cache keys before publication. A rollback **must use a new cache epoch** so old/new cached content cannot be silently mixed; never delete user wager localStorage or raw source. Rollback also requires human approval/visual verification.

`RELEASE_READINESS=READY_FOR_VERSION_STAGE_QA_ONLY`. Staged release is **NOT phone ready**. `CONTEXT_RISK=ELEVATED`; KTS ALL-SURFACE AGENTS and WILSON86 ZERO-COST policy apply.
