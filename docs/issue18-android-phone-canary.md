# KTS Issue #18 — controlled Samsung S25 Ultra canary and rollback acceptance

**Release state:** NOT DEPLOYED, NOT PRODUCTION. Use only after an explicit separate approval to publish a public, separate-origin **preview**. This is a test protocol, not authority to merge/publish/deploy.

## Source and delivered artifact

- Engine: `7952aa29eda4ba7117d0245ed71b79cf8f8643f291b94dbef268b710a4b849ea`.
- KTS PRIVATE Router/Desktop `6210266f34620e4092d38605d970009e5579ef8b` — do not upload.
- Mobile 2.0.38 / Unified 1.0.27 `f882330841a0e84d0f2ee29a75eed1cc1ae14b5b`.
- Ngang 1.0.37 `afc777d01ba2346b7eb3a322afe9bbebc6068fc0`.
- Owner's Windows receipt (2026-10-30T19:49:35Z) SHA-256 `e4728e595337bc9ac509398c2235fb1fdfd84188529c1455588a8a4b2fc7f93c`: **52/52 preflight checks**, isolated Chrome marker gate PASS, stage exact asset verification 21.
- Exporter V2 SHA-256 `b37a5fa2864bfa203da63d7b5f8887dd2e98d58be87e228adab2eb315a19b85b`, committed to `scripts/KTS_issue18_prepare_preview.js` on the *distinct* preview-prep branch, with 8/8 focused Linux synthetic safety QA on identical Git blob. NOT Windows executed.

## Operator next-PC preparation — NO CODEX, no GitHub main merge, no deployment

Use ONE PowerShell block when owner is back at their authorized Windows C: PC. It downloads exactly one source artifact from its immutable GitHub SHA, verifies SHA-256 and launches the offline-only C: exporter. It must not run during power-off, does not upload, and refuses unknown or existing output folders.

```powershell
& {
    $ErrorActionPreference = "Stop"
    $parent = "C:\KTS-QA"
    $file = Join-Path $parent "issue18-preview-export-v2.js"
    $url = "https://raw.githubusercontent.com/wilson86/tach-dai-mobile/2ca90e6b088bef194c06dd5d025c45670d5c56ce/scripts/KTS_issue18_prepare_preview.js"
    $expected = "b37a5fa2864bfa203da63d7b5f8887dd2e98d58be87e228adab2eb315a19b85b"

    $rootItem = Get-Item -LiteralPath $parent -Force
    if (-not $rootItem.PSIsContainer -or
        ($rootItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw "UNSAFE_C_PROJECT_PARENT"
    }
    if (Test-Path -LiteralPath $file) { throw "EXPORTER_FILE_ALREADY_EXISTS_KEEP_EXISTING" }
    $node = Get-Command node -ErrorAction Stop
    Invoke-WebRequest -Uri $url -OutFile $file -UseBasicParsing -MaximumRedirection 2 -TimeoutSec 30
    $actual = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $expected) { throw "EXPORTER_HASH_MISMATCH_PRESERVE_FILE" }
    & node $file
    if ($LASTEXITCODE -ne 0) { throw "PREVIEW_EXPORT_BLOCKED_KEEP_EVIDENCE" }
    Write-Host "KTS_PREVIEW_EXPORT_PREPARED_NOT_PUBLISHED"
}
```

Expected successful JSON is `PREVIEW_FOLDER_READY_NOT_PUBLISHED`, `assets=21`, `release=NO_GO`. Export output `C:\KTS-QA\issue18-preview-upload-20261031` is new and separate; original 21-asset stage, the original stage manifest, and full native Windows JSON are retained. If blocked or partial export: **do not delete or overwrite output**, preserve failure as evidence, share the error for source-based diagnosis. If Node.exe is not installed in PATH, stop; no downloads/install are required as a troubleshooting shortcut.

## Browser-isolation check added in exporter v3

The prepared directory contains **one Cloudflare Pages `_headers` config**, in addition to the 21 SHA-pinned public assets and root landing page/robots/manifest. Cloudflare Pages interprets `_headers` (rather than serving it as app JavaScript) to set: `connect-src 'self'` and `frame-src 'self'` to prevent cross-origin app/iframe loads, `frame-ancestors 'self'` and `X-Frame-Options: SAMEORIGIN` to permit Unified's legitimate embedded child apps while preventing foreign sites embedding the preview, plus `X-Robots-Tag: noindex`. Source/test exact Git blob SHA-1 checked against locally executed test bytes. The **new** focused exporter test result is **8/8 PASS** locally on Linux; Cloudflare live HTTP response headers are **NOT_YET_OBSERVED**. Before Android money tests, independently inspect actual public preview HTTP response headers and verify CSP exists. `robots.txt` and `noindex` do not make the site private.

## New-origin HTTPS preview gate — explicit owner approval required

- Preview must be on a different `scheme://host[:port]` origin than `https://wilson86.github.io`. A new GitHub Pages repository *path* under `wilson86.github.io` is NOT separated from the live app's `localStorage`/Cache Storage; never use it as an isolated trial.
- Expected static preview root layout: `index.html`, `robots.txt`, `KTS_PREVIEW_MANIFEST.json`, `Mobile/`, `Ngang/`. **Do not upload any other C: evidence folder**, private Router/Desktop code, personal tickets, local SQLite, JSON reports, source checkout or keys.
- HTTPS candidate path is `https://<new-distinct-origin>/Mobile/app/`. Synthetic test only, no real Telegram, ACK or bets. Public preview is discoverable despite robots exclusions; do not mistake obscure URL for authentication.
- Cloudflare Pages Direct Upload is one potential provider: documented drag-and-drop folder/ZIP, separate `<name>.pages.dev` origin. Verify free plan, account entitlement and no unexpected charges before owner-authorized publication. No provider account has been accessed or created by this plan.
- At first phone load, verify **all 3 version labels** Mobile 2.0.38, Ngang 1.0.37, Unified 1.0.27, and Ngang iframe loaded from **new preview origin**, not from existing `wilson86.github.io`. If mismatch, stop: no money test.

## Minimal synthetic manual canary on S25 Ultra

| Gate | Synthetic action | Required outcome / evidence |
| --- | --- | --- |
| C1 | Open isolated HTTPS preview, take screenshot with all three tabs and version labels | Unified and both child modes render; no mixed-origin iframe, no production data copied |
| C2 | Select region MN, manually select **2026-10-29 (Thursday, TN/AG)**, uncheck Today; run `2d 52 dx5n` separately in the two modes | Tách Đài output **`tn ag 52 dx5n`**; Tách Ngang output **two rows `2d 52 dx2.5n`**. Correct amount conserved; these modes must NOT be identical |
| C3 | Enter the same single-number DX in Đá Vòng | **REJECT/HOLD**, not accepted as one-number pair; no money output or dispatch |
| C4 | With separate synthetic multi-line valid input, partial Cut → reload browser tab → Undo | Only selected output removed; other rows survive; original source and exact ledger restored by Undo; record before/after screenshots |
| C5 | **Full Cut** → reload → Undo | No phantom wager resurrection or loss of source; record before/after screenshots. If unclear, mark BLOCKED and do not approve |
| C6 | With a saved synthetic Cut ledger, change date/region then restore the original | New scope HOLD without stale original-date wager shown; switching back recovers exact survivor rows |
| C7 | After verified SW activation, enable airplane mode, reload all 3 tabs, then restore network | Each mode displays expected cached app and its correct version; no production origin fetch or data loss. No app uninstall/cache clear |
| C8 | App's duplicate/unrecognized source checks, including `.. 32 b20n` and MN missing station | Fail closed; no accepted wager, no partial sibling output or send |

**Do not deliberately fill Android storage or force quota errors on a personal phone.** The quota-failure fail-closed/retry negative case remains `PENDING_CONTROLLED_ISOLATED_FAULT_TEST` (must be qualified independently with a disposable profile/fixture). C5 and C7 are NOT proven solely by old partial Cut/Chrome QA.

P016: operator approved the ONE leading-dot MB chat case in 2026-10-17 private canonical corpus; `N041` double dot remains unapproved and is rejected by current candidate. No need to re-approve P016; do not extrapolate to unseen formats. N035 exact-money topology supersedes the old undecided corpus record only for the approved TN/AG schedule/region/date case.

## Final reviews after phone evidence (same assistant in distinct roles, NOT three separate humans)

1. **Project director:** Stage, independent HTTPS origin, rollout/rollback and preservation of existing GitHub Pages app/ledger proven; no new hidden subscription or Actions cost.
2. **Independent reviewer role:** Cross-check source pins, staging hashes, Android screenshots, all C1–C8 receipts; distinguish pass/fail/not-run and do not infer human acceptance from synthetic test. Quota failure separate.
3. **End user:** Device interaction legible and correct in Tách Đài, Ngang, Đá Vòng, Cut/reload/Undo/Full Cut, source and money, date HOLD and offline; no deletion of existing live-phone data.

**Production requires a separate owner release decision after these gates.** Both public `deploy-pages.yml` workflows automatically deploy on `main` changes; neither may be merged just to test on a real phone. Draft Mobile PR #23/Ngang PR #15 record old release SHA pins, so review exact verified final SHAs and rollback snapshot rather than treating draft PR title as authority.

`RELEASE=NO_GO | ANDROID=NOT_RUN | EXTERNAL_PREVIEW=NOT_DEPLOYED | COST_USD=0 | MERGE=NO | DEPLOY=NO | E/F_ACCESS=NONE`
