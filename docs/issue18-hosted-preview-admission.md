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
- `scripts/KTS_issue18_verify_hosted_preview.js` local Linux Node v22 tested bytes SHA-256 `914afe6f74817f935f64f1ac9d37abb9e729cf54cb18581d4b41cc28c640194f`, Git blob `eeb74c111f41dbac032f7191bc229e2044e14461`, first source-pin commit `520e52b282f8da3e1e17fbd80a489b2e6117d5f2`.
- `scripts/KTS_issue18_verify_hosted_preview.test.js` SHA-256 `229ea25da9ef2950b127b3be1f63d3deb3adfd5edbd3bf453393192ffce3b7b8`, Git blob `996a51c57b399b8850365f89433695f93195cdcd`.
- Older v2 `node --test` 10/10 PASS applies ONLY to previous exact SHA (not rerun). New source v3 focused V8 tests 8/8 PASS; **new full Node suite 13 tests NOT_RUN** until suitable local runtime is available. Synthetic injected `fetch`, **no external network access**, user PC/offline NOT_RUN. Test Git blob matches exact executed bytes, verified with `git hash-object`.
- **2026-10-31 fail-closed security repair:** Two negative fixtures first proved real failures in the ORIGINAL hosted verifier: (a) CSP substring acceptance allowed `connect-src 'self' https://other.example` and `frame-src 'self' https://other.example` to pass; (b) stage file mutation during remote fetch could make a changed remote file pass because code re-read changed local bytes after earlier source validation. The hardened verifier now parses CSP directives, rejects unknown/duplicate/permissive directives, and **snapshots the approved hashes before any HTTP**. Re-run of the 8 original tests + 2 new negatives: **10/10 PASS** on Node.js 22, on source identical to the SHA-pinned GitHub Git blobs. Both are tooling fixes; application/money engine untouched. This is NOT actual hosted service or Android QA.
- **2026-10-31 v3 input-safety follow-up:** Original verifier did not inspect the *entire* upload directory and its CSP gate accepted missing `script-src` / `style-src`, although candidate Unified uses inline JavaScript/CSS. The hardened version now checks an **exact 25-file local export inventory**, including Cloudflare `_headers`, rejecting any unknown/private file or missing file before remote fetch. It also requires full exact CSP UI directives (`script-src 'self' 'unsafe-inline'`, `style-src 'self' 'unsafe-inline'`, `img-src 'self' data:`, `base-uri 'self'`). Three targeted Node regression definitions were added; the full updated 13-test Node suite is **NOT_RUN** in this batch (PC still unverified, no CI). An isolated JavaScript execution of the exact GitHub function source exercised 8/8 focused cases PASS (valid header, 4 missing CSP directives, valid 25-file tree, extra private file, missing `_headers`), with a source-syntax parse check. These 8 checks are not a replacement for the full Node suite, deployed Cloudflare or Android acceptance. Pin NEW SHA for all future downloads; prior verifier file is superseded.
- Only accepts an origin-root `https://<project>.pages.dev/` or `https://<branch>.<project>.pages.dev/`, no URL credentials/path/port/query/fragment; won't access `wilson86.github.io`. For each run first checks immutable **local export** manifest `KTS_PREVIEW_MANIFEST.json` with exact source SHAs and all 21 local asset hashes (no remote HTTP before local validation), then GETs 24 expected hosted response paths with no redirects, checks HTTP 200, local-vs-hosted SHA256 bytes, and CSP/frame/robots/nosniff HTTP response headers. Cloudflare Pages canonical HTML routes map `index.html` to `/`, `Mobile/index.html` to `/Mobile/`, `Ngang/index.html` to `/Ngang/`, and `Mobile/app/index.html` to `/Mobile/app/` (Cloudflare docs: https://developers.cloudflare.com/pages/configuration/serving-pages/).
- The exported folder is **only** `C:\KTS-QA\issue18-preview-upload-20261031`; no private Router/Desktop or customer evidence uploaded. A public Cloudflare Pages preview may be discoverable; `robots.txt` and `X-Robots-Tag: noindex` are not authentication.
- The verifier **does not** run without an explicitly supplied preview URL. It is read-only: no uploads, writes, deletes, paid API, merges, Telegram sends or customer data. Server GETs could count against the host's normal free-tier request limits; confirm zero charge before deployment.

### Only after owner authorizes and actually deploys an independent Cloudflare Pages preview

From owner Windows PowerShell, with the **previously generated and verified 21-asset local export folder** present:

```powershell
& {
    $ErrorActionPreference = 'Stop'
    $target = 'C:\KTS-QA\issue18-hosted-preview-verify-v1.js'
    $url = 'https://raw.githubusercontent.com/wilson86/tach-dai-mobile/520e52b282f8da3e1e17fbd80a489b2e6117d5f2/scripts/KTS_issue18_verify_hosted_preview.js'
    $expected = '914afe6f74817f935f64f1ac9d37abb9e729cf54cb18581d4b41cc28c640194f'
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
