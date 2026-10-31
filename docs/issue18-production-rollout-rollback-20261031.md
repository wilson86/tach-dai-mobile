# KTS Issue #18 — Production rollout/rollback control (source-verified, NOT AUTHORIZED)

**Status:** PLAN ONLY — NOT A DEPLOYMENT OR A GO DECISION. User seeks working KTS on Samsung S25 Ultra through usual GitHub Pages URLs. Existing live app must be preserved until SHA-bound review and separate explicit production release approval. No paid CI, no production changes, no private data or real wagers in QA.

## Baseline: exact GitHub main source AND latest Pages workflow results (verified 2026-10-31)

| Public site/source | Current `main` SHA | `main` JSON app version | Engine SHA256 | Latest `Deploy GitHub Pages` result |
| --- | --- | --- | --- | --- |
| Mobile | `wilson86/tach-dai-mobile@b9eb59fad5a5eb65e47b85fc7a8f5a63f9f8fd69` | Mobile **2.0.32** | `046935677f9d88468b71246410444c27435c72e1415aeb359c799452584c36eb` | [success #40039693632](https://github.com/wilson86/tach-dai-mobile/actions/runs/40039693632), exact `main` SHA, 2026-10-23 23:26 UTC |
| Unified (embedded in Mobile repo) | SAME Mobile main SHA | Unified **1.0.21** | SAME old SHA | SAME Mobile Pages workflow |
| Ngang | `wilson86/tach-dai-ngang@34b917f3b56d8aefcb23854051ea2b0856f1f70a` | Ngang **1.0.30** | SAME old SHA | [success #40037673992](https://github.com/wilson86/tach-dai-ngang/actions/runs/40037673992), exact `main` SHA, 2026-10-23 23:05 UTC |

**Evidence limit:** The above proves current GitHub main commit, checked-in version JSON and latest listed Pages workflow status. Direct live Pages HTTP GET of actual version files on `wilson86.github.io` was attempted, but inaccessible to this assistant's available web retrieval in this session. Therefore **LIVE_SITE_VERSION=UNVERIFIED** and **physical installed PWA VERSION=UNKNOWN**. Cached service worker can lag behind main/Pages. Do not assert v2.0.32/1.0.30/1.0.21 are currently displayed on user's phone merely from GitHub main.

`main`→candidate compare: Mobile ahead **237** commits, behind 0, **44** differing paths; Ngang ahead **43** commits, behind 0, **16** differing paths. **Nontrivial release jump:** forbid single-mode partial promotion under real customer load.

## Freeze qualified candidate and QA

| Component | Non-merged candidate Git SHA | Candidate version |
| --- | --- | --- |
| Private KTS Router/Desktop canonical authority | `wilson86/KTS@6210266f34620e4092d38605d970009e5579ef8b` on `review/issue18-calendar-hash-reconcile-20261031` | private, NEVER uploaded to Pages |
| Mobile + Unified | `wilson86/tach-dai-mobile@f882330841a0e84d0f2ee29a75eed1cc1ae14b5b` on same review branch | 2.0.38 / 1.0.27 |
| Ngang | `wilson86/tach-dai-ngang@afc777d01ba2346b7eb3a322afe9bbebc6068fc0` on same review branch | 1.0.37 |

New candidate engine digest: `7952aa29eda4ba7117d0245ed71b79cf8f8643f291b94dbef268b710a4b849ea` consistently pinned across the candidate trio.

Historical qualified receipt `issue18-2026-10-30T19-49-35-266Z-26104.json` SHA256 `e4728e595337bc9ac509398c2235fb1fdfd84188529c1455588a8a4b2fc7f93c`: native Windows Gate A 52/52 PASS and isolated Chrome Gate B PASS on immutable candidate. Full Cut + simulated reload/Undo and forced localStorage quota fail-closed cases are included among prior source-bound Node PASS for both apps. No need to repeat unchanged-SHA tests.

New **preview-only** tooling is on another branch `review/issue18-isolated-android-preview-prep-20261031` and MUST NOT accidentally be treated as the approved app source SHA. It contains 7 preview scripts/tests/docs paths, including hosted admission SHA pinned in `docs/issue18-hosted-preview-admission.md` with Linux synthetic 10/10 PASS. No app file changed in this preview-only branch.

## Hard release gates — independent of any prior QA

1. **Separate origin HTTPS preview**, created only after owner's explicit approval and confirmed zero incremental charge. Owner's existing C: 21-asset staged folder is byte-verified, safely exported, publicly hosted on an origin *different* from `wilson86.github.io` (never same-site second repo path), and the SHA-pinned read-only hosted verifier checks all 24 served files and actual security headers. This is NOT done yet.
2. **Physical Samsung S25 Ultra acceptance:** C1–C8 in `docs/issue18-android-phone-canary.md` with only synthetic wagers. Verify Tách Đài `tn ag 52 dx5n` vs Tách Ngang two `2d 52 dx2.5n` on Thu 2026-10-29 for two approved stations; Đá Vòng singleton reject, partial/full Cut→reload→Undo source/ledger conservation, scope/date HOLD recovery, 3-SW offline reload and cache/version parity. Quota injected in native Node tests is NOT physical Chrome quota proof; don't exhaust phone disk. Stop on any money drift or source loss.
3. **Production impact and rollback admission:** Obtain latest main HEAD again, compare planned candidate and previously approved business oracles. Confirm live Pages version read-only with owner PC/phone, preserve customer-side original ledger/Undo/material (DO NOT clear browser cache/storage) and previous source SHA snapshots. Ensure user understands simultaneous live links may temporarily load a mixed version. Separate explicit OWNER GO required for production; existing request to 'continue development' is **not** an approval to publish/merge.

## Coordinated production rollout, only AFTER owner authorizes

- Notify real users to **stop processing/dispatching bets**, and stop Telegram/ACK exposure before any deployment. Prevent live workflows during partial cross-repo deployment.
- Capture immutable `main` rollback SHAs above again, current Pages pipeline IDs, planned release source SHAs, user data/ledger preservation evidence and correct approval. If any mismatch, STOP and re-review; do not auto-adjust branch or delete caches.
- In a human-approved operation, deploy Ngang candidate first, verify its published `version.json`, correct engine digest and initial smoke. **Treat this interval as maintenance/HOLD, NOT a ready system.** Then deploy Mobile/Unified candidate; verify all 3 live public version.json URLs, direct HTTPS app, cache revalidation and Ngang iframe money parity. GitHub `main` push triggers `deploy-pages.yml` in both PUBLIC repos; do not manually dispatch unrelated workflows or run private CI.
- Confirm actual Samsung existing-origin (not merely separate preview) upgrade and preservation/restore of original active Cut ledger. If cache/ledger loss, mixed engine, money mismatch, missing mandatory approval or failed hosted checks: **STOP production traffic**. Do not authorize betting despite a green workflow icon.
- Restore normal activity only with human production sign-off AFTER all evidence is inspected and three-role review.

## Rollback / source recovery when any gate fails

- **DO NOT force-push, discard unique client data, clear caches, alter live bets, send Telegram or edit private production stores automatically.**
- Old source SHAs: Mobile `b9eb59fad5a5eb65e47b85fc7a8f5a63f9f8fd69`, Ngang `34b917f3b56d8aefcb23854051ea2b0856f1f70a`; originals preserved on GitHub. These are proposed source rollback references **not** a confirmation that reversing source alone will restore the handset's ledger/cache. Do not directly downgrade active data to an older incompatible representation without human inspection/export.
- For deployment failure, maintenance/HOLD remains active. A rollback would require a **separately approved revert PR/commit** targeting both public mains, with exact tree/version/engine verification and Pages workflow evidence, not a force push or automated blind downgrade. Reconfirm Android phone storage compatibility and reproduce stored ledger before allowing users back.
- Record incident evidence, recovery SHAs, actual served versions/receipts and owner approval in private KTS Issue #18. If safe rollback is uncertain, keep NO_GO and preserve backups; do not fake a restored-service claim.

## Three-role release decision template

**Project director:** Versions + source locks, offline tests, live origin preview, non-atomic release maintenance, preserved originals, zero-cost, rollback references and explicit authorization all checked.

**Independent reviewer role** (same assistant acting as reviewer, **not a separate human third party**): Distinguish static code from actual browser/Android/runtime; re-verify the frozen SHA, money oracles and all scope/ledger/cut logs; any absent external gate = NOT_RUN/BLOCKED, never PASS.

**End user:** On real existing Android shortcut, text readable, all three modes correct, prices conserved, original source editable, Cut/Undo/reload and offline safe; no hidden old messages/data loss. No real customer testing before release.

**As of 2026-10-31:** `SOURCE_MAIN_SNAPSHOT=VERIFIED | PAGES_WORKFLOW_SUCCESS_AT_MAIN=VERIFIED | LIVE_SITE_VERSION=UNVERIFIED | PHYSICAL_ANDROID=NOT_RUN | HUMAN_PRODUCTION_GO=NOT_GRANTED | MERGE=NO | DEPLOY=NO | PRODUCTION=NO_GO | COST_USD=0`.
