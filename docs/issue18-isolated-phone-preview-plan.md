# KTS Issue #18 — isolated Android web preview preparation (NOT DEPLOYED)

**Goal:** Give the operator an HTTPS link that opens directly on Samsung S25 Ultra without USB/ADB, while keeping both current GitHub Pages production sites and old phone data untouched.

## Immutable tested candidate

| Component | Repository / exact SHA |
| --- | --- |
| KTS Router/Desktop/authority (PRIVATE; never upload) | `wilson86/KTS@6210266f34620e4092d38605d970009e5579ef8b` |
| Mobile 2.0.38 / Unified 1.0.27 | `wilson86/tach-dai-mobile@f882330841a0e84d0f2ee29a75eed1cc1ae14b5b` |
| Ngang 1.0.37 | `wilson86/tach-dai-ngang@afc777d01ba2346b7eb3a322afe9bbebc6068fc0` |
| Generated engine digest | `7952aa29eda4ba7117d0245ed71b79cf8f8643f291b94dbef268b710a4b849ea` |

Owner's Windows JSON `issue18-2026-10-30T19-49-35-266Z-26104.json` (SHA-256 `e4728e595337bc9ac509398c2235fb1fdfd84188529c1455588a8a4b2fc7f93c`) was independently inspected: Gate A 52/52 check rows PASS; isolated real Windows Chrome Gate B PASS; 21 stage files verified. **Physical Android, public preview, release authorization NOT_RUN/NOT_GRANTED.** Do not rerun unchanged-SHA Gate A/B.

## Important: preview MUST be a different **origin**

A second repository at `https://wilson86.github.io/other-repo/` remains on the SAME `https://wilson86.github.io` origin as the currently used apps. `localStorage` and Cache Storage are origin-scoped (even when service workers have distinct path scopes). This can corrupt or cross-contaminate legacy Cut/Undo/ledger/cache expectations. **Never claim a same-origin GitHub Pages subpath is an isolated phone preview.**

An independently verified free-tier host with a **different origin** (for example, a dedicated `.pages.dev` project) can technically host a self-contained static folder. Cloudflare Pages Direct Upload accepts a local folder or ZIP through its dashboard; free-tier limits must remain respected, with no paid upgrades or account/billing changes. Cloudflare's official documented drag-and-drop Direct Upload supports folder/ZIP, maximum 1,000 files in a single upload and 25 MiB per asset; this static preview will have 25 small files. Docs: https://developers.cloudflare.com/pages/get-started/direct-upload/ and https://developers.cloudflare.com/pages/platform/limits/. Publishing even a preview requires **separate owner consent** and access to that provider. Static preview would ordinarily be accessible to anyone who discovers its URL; `robots.txt` alone is not access control. Do not upload private KTS/Router code, personal/customer tickets or secrets.

## Source-pinned staging and safe export

The exact owner C: directory:
`C:\KTS-QA\issue18-calendar-evidence\issue18-stage-2026-10-30T19-49-35-266Z-26104`

Stage manifest SHA-256:
`7b224b1d40a0d5f1c76402f5df858bb14976062f972e3d8c8a59d58c4b9cfb53`

`scripts/issue18-verify-stage.js` on immutable Mobile SHA validates **21** public allowlisted assets, exact SHA/source bytes, local Ngang iframe `../../Ngang/`, 3-version/engine identity, and `release_authorized:false`.

A GitHub-pinned offline preview export helper and its focused tests are committed **on this preview-prep branch only** (the actual qualified application SHA remains unchanged):

- Filename: `KTS_issue18_prepare_preview.js`
- Source: `scripts/KTS_issue18_prepare_preview.js`; SHA-256: `3a767f07dec8c5e7308ba4c588be285d8b8a710b3d217ac4198581e6e8934dfa`; Git blob SHA: `4f6ebae95baf12c3451df089402fb62cb4659a4f`.
- Focused source test: `scripts/KTS_issue18_prepare_preview.test.js` (run with `node --test scripts/KTS_issue18_prepare_preview.test.js`).
- Test SHA-256: `0e23355aff877f8c66bdfa2e22edaf5cf9096dca61fbb9ffd2c80169889ddbaa`; Git blob SHA: `c7ea744b6d60b39fd6d6cbc16d9cc06ee337b252`.
- Synthetic Linux Node 22 focused QA: **7 PASS, 0 FAIL**, including two negative tests for post-verifier manifest and asset mutation. Code SHA identity on GitHub verified against `git hash-object` of independently tested local bytes. This is **NOT Windows execution**, not production deployment, not Android acceptance.
- Runtime requires Windows, normal nonlinked C: source checkout, *existing* verified stage and normal C: output parent; calls original source-bounded stage verifier and rebinds every exported byte to the exact original stage manifest after validation. Fails if any extra/linked/corrupted/unexpected stage files or if preview export destination already exists; creates only NEW `C:\KTS-QA\issue18-preview-upload-20261031`. No overwrite, deletion, Git actions, credentials, network, CI or publishing.
- Export copies **only 21 public staged asset bytes**, with already rewritten same-origin Ngang iframe `../../Ngang/` and Unified service-worker paths rooted at `/Mobile/`, plus nonproduction entry page/robots and per-file SHA manifest. It intentionally excludes private KTS/Router sources and local `ISSUE18_STAGE_MANIFEST.json` from upload. Hosted URL would be `https://<separate-preview-origin>/Mobile/app/`, not `/<repo>/Mobile/app/`. Do not upload the original whole C: evidence directory.

IMPORTANT: The older conversation attachment with SHA-256 `4c4b11489440b5ff0e153a53c9dcc1b1471df924375e065e2dca2db98d1900d6` is **superseded**; use only the new exact GitHub-pinned source with SHA-256 `3a767f07dec8c5e7308ba4c588be285d8b8a710b3d217ac4198581e6e8934dfa`. Do not run it while the PC is off. No independent native Windows QA has yet been executed on this helper. Export is not publication; **publishing this folder still requires separate owner consent**.

## Three-role release gate

- **Project director:** Existing old URLs must remain unmodified while new preview is qualified. Production Pages `.github/workflows/deploy-pages.yml` triggers on pushes to `main` for BOTH public repositories; a main merge is immediate production-effecting, not preview. Both original Draft PRs (#23 Mobile, #15 Ngang) contain outdated coordinated SHA pins. No merge.
- **Independent reviewer role:** Application candidate and 21 staged assets are SHA-bound; preview export helper 7/7 synthetic tests alone is not an uploaded/Android PASS. Other oracle cases remain fail-closed. Need manual full-cut/quota/device/old-origin cache acceptance on actual phone and coordinated rollback readiness.
- **End user:** The new preview is a different-origin standalone test. Only synthetic wagers. Test N035 Tách Đài vs Ngang exact amount, singleton Đá Vòng rejection, full/partial Cut -> reload -> Undo, original-message and ledger preservation, wrong-date HOLD, offline, update and reinstall.

## Stop/rollback controls

- No private repo/main changes, no release or production customer wager/Telegram dispatch, no paid CI.
- Preserve owner original stage, JSON receipts, backup, rollback and all unknown files; do not clean C: broadly.
- Do not present any hosted preview URL until that actual deployment is separately approved, completed and device-verified.
- Preview-origin/Pages host and login credentials NEVER embedded in source or checkpoints.
- `RELEASE=NO_GO`, `COST_USD=0`, `CLEANUP_STATUS=NO_ACTION`, `FILES_REMOVED=0`, `SPACE_RECOVERED_MB=0`, `FILES_PRESERVED=ALL`, `CLEANUP_BLOCKERS=NO_DIRECT_OWNER_WINDOWS_FILESYSTEM_ACCESS`.
