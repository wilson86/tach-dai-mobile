# KTS Issue #18 — Hosted HTTPS Preview Admission (remote read-only verifier)

**STATUS: SOURCE READY; SITE NOT DEPLOYED; DEVICE NOT RUN; PRODUCTION NO_GO.** This gate never publishes/merges/sends customer wagers.

## Frozen application candidate

- Private canonical KTS: `wilson86/KTS@6210266f34620e4092d38605d970009e5579ef8b`.
- Public Mobile 2.0.38 + Unified 1.0.27: `wilson86/tach-dai-mobile@f882330841a0e84d0f2ee29a75eed1cc1ae14b5b`.
- Public Ngang 1.0.37: `wilson86/tach-dai-ngang@afc777d01ba2346b7eb3a322afe9bbebc6068fc0`.
- Original Windows JSON verified at exact source SHA: `issue18-2026-10-30T19-49-35-266Z-26104.json`, SHA256 `e4728e595337bc9ac509398c2235fb1fdfd84188529c1455588a8a4b2fc7f93c`; Gate A 52/52 checks PASS, isolated Chrome Gate B PASS. Does **not** approve Android.

## Evidence reclassification — DO NOT rerun already qualified SHA

Exact owner Windows receipt Gate A has `exitCode=0` and PASS stdout on both:
- `MOBILE/tests/ledger-readable-working-ui.js` (blob `84c94d3e93cba85bbc48241dc38f289f7a3f5100`).
- `NGANG/tests/ledger-readable-working-ui.js` (blob `e31403203dde7c5b0c789b0819de280d202a0829`).
Both actual test sources cover **Full Cut → simulated browser reload → Undo restoring original** (zero surviving rows), **Cut persistence failure**, **Clear quota failure** and **Undo quota failure** with injected `localStorage` write errors, preserving previous working state. Therefore mark `FULL_CUT_SYNTHETIC_NODE_WINDOWS=PASS`, `QUOTA_FAIL_CLOSED_SYNTHETIC_NODE_WINDOWS=PASS`. **Not** `ANDROID_PASS`, `REAL_CHROME_QUOTA_PASS` or `CROSS_ORIGIN_MIGRATION_PASS`. Browser/device acceptance is still pending. Old status `QUOTA_FAILURE_NOT_TESTED` was too broad and is superseded by this scoped classification.

## Separate-origin hosted-source verification tool

On the PREVIEW-PREP review branch (never merge into public main as a test) the two new files are:
- `scripts/KTS_issue18_verify_hosted_preview.js` local Linux Node v22 tested bytes SHA-256 `1c11bf0bc7240e8c43ff193d666942fd8d45d1a2e23ba30d77c17a07a2caf89e`, Git blob `e05d956b9fb2b82e79935aa6104084eb7c0560ec`, first source-pin commit `c18f74b212a311b652631ed5bc98d398a970cd45`.
- `scripts/KTS_issue18_verify_hosted_preview.test.js` SHA-256 `a9405c1f15c347e32ffc12a4de5e707c360c33a23ce7ed6f18c680dfbcd2f570`, Git blob `08792c318673a05d9e2c9b0ce60e5064430ab0b7`.
- Actual sandbox execution: `node --test KTS_issue18_verify_hosted_preview.test.js` on Node v22.16.0, **8 PASS / 0 FAIL**. Synthetic injected `fetch`, **no external network access**, user PC/offline NOT_RUN. Test Git blob matches exact executed bytes, verified with `git hash-object`.
- Only accepts an origin-root `https://<project>.pages.dev/` or `https://<branch>.<project>.pages.dev/`, no URL credentials/path/port/query/fragment; won't access `wilson86.github.io`. For each run first checks immutable **local export** manifest `KTS_PREVIEW_MANIFEST.json` with exact source SHAs and all 21 local asset hashes (no remote HTTP before local validation), then GETs 24 expected hosted response paths with no redirects, checks HTTP 200, local-vs-hosted SHA256 bytes, and CSP/frame/robots/nosniff HTTP response headers. Cloudflare Pages canonical HTML routes map `index.html` to `/`, `Mobile/index.html` to `/Mobile/`, `Ngang/index.html` to `/Ngang/`, and `Mobile/app/index.html` to `/Mobile/app/` (Cloudflare docs: https://developers.cloudflare.com/pages/configuration/serving-pages/).
- The exported folder is **only** `C:\KTS-QA\issue18-preview-upload-20261031`; no private Router/Desktop or customer evidence uploaded. A public Cloudflare Pages preview may be discoverable; `robots.txt` and `X-Robots-Tag: noindex` are not authentication.
- The verifier **does not** run without an explicitly supplied preview URL. It is read-only: no uploads, writes, deletes, paid API, merges, Telegram sends or customer data. Server GETs could count against the host's normal free-tier request limits; confirm zero charge before deployment.

### Only after owner authorizes and actually deploys an independent Cloudflare Pages preview

From owner Windows PowerShell, with the **previously generated and verified 21-asset local export folder** present:

```powershell
& {
    $ErrorActionPreference = 'Stop'
    $target = 'C:\KTS-QA\issue18-hosted-preview-verify-v1.js'
    $url = 'https://raw.githubusercontent.com/wilson86/tach-dai-mobile/c18f74b212a311b652631ed5bc98d398a970cd45/scripts/KTS_issue18_verify_hosted_preview.js'
    $expected = '1c11bf0bc7240e8c43ff193d666942fd8d45d1a2e23ba30d77c17a07a2caf89e'
    if(Test-Path -LiteralPath $target) { throw 'VERIFIER_EXISTS_KEEP_UNCHANGED' }
    Invoke-WebRequest -Uri $url -OutFile $target -UseBasicParsing -TimeoutSec 30
    $actual = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
    if($actual -ne $expected) { throw 'VERIFY_DOWNLOADED_SHA_MISMATCH' }
    # Replace <ACTUAL_PROJECT> only after actual Pages deployment has been approved.
    & node $target 'https://<ACTUAL_PROJECT>.pages.dev/'
    if($LASTEXITCODE -ne 0) { throw 'HOSTED_PREVIEW_NOT_QUALIFIED' }
}
```

Do not run this script using a fabricated URL: the URL will not exist before a separate deployment. The script refuses the current `wilson86.github.io` production origin. **Expected** only after real deployment: `HOSTED_PREVIEW_SOURCE_AND_HEADERS_PASS`, `checked_files=24`, `sha_bound_asset_files=21`, `android=NOT_RUN`, `production=NO_GO`. Until a real response has been checked: `HOSTED_PREVIEW_QA=NOT_RUN`.

## Last physical acceptance gates after remote source-header admission

Android Chrome on S25 Ultra must run from the new isolated HTTPS origin; mode parity money N035, DaVong singleton rejection, full+partial Cut/reload/Undo, wrong-date HOLD and recovery, offline caching, source-line provenance, and ensure live installed existing app remains untouched. The native Node suite's injected-quota tests **do not** replace a controlled real Chrome storage-fault test; do not deliberately fill personal Android storage.

**Three-role review**: PM = lock SHA and planned coordinated Ngang/Mobile eventual rollout, require rollback snapshot; independent reviewer role = no Android or Cloudflare remote PASS inferred; end user = actual phone interaction required. Production publication separately authorized after independent device review.

`RELEASE=NO_GO | MERGE=NO | DEPLOY=NO | PHYSICAL_ANDROID=NOT_RUN | HOSTED_PREVIEW=NOT_DEPLOYED | COST_USD=0`
