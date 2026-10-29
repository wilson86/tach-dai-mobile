# KTS Issue #18 — Production qualification (NO_GO pending evidence)

**This is a read-only operator-run acceptance plan, not approval to merge, publish, deploy or access customer data.**

## Candidate source (verify exact SHA in latest Issue #18 checkpoint)

- Private wilson86/KTS: review/issue18-cache-authority-20261029.
- Public wilson86/tach-dai-mobile: review/issue18-production-preflight-20261029.
- Public wilson86/tach-dai-ngang: review/issue18-ledger-drift-20261029.
- Candidate versions: Mobile 2.0.36; Ngang 1.0.34; Unified 1.0.25.
- Engine SHA: 7952aa29eda4ba7117d0245ed71b79cf8f8643f291b94dbef268b710a4b849ea.

Do not reset or clean an existing dirty worktree. Create three fresh isolated C: checkouts, with paths C:\KTS-QA\issue18-review\KTS, C:\KTS-QA\issue18-review\Mobile and C:\KTS-QA\issue18-review\Ngang. Record their full HEAD SHA values.

## Gate A — exact-source, offline deterministic QA

Run the following from the Mobile checkout after replacing SHA placeholders with the three exact verified commits:

```powershell
node scripts/issue18-production-preflight.js `
  --workspace 'C:\KTS-QA\issue18-review' `
  --kts-sha '<KTS_HEAD>' `
  --mobile-sha '<MOBILE_HEAD>' `
  --ngang-sha '<NGANG_HEAD>'
```

The tool refuses non-C: workspace paths, unexpected SHA, dirty checkouts, symlink/junction source paths, mismatched versions/engine or missing assets. It invokes the canonical Python generator strict --check and only allowlisted synthetic Node tests. No GitHub Actions, package install, API, mutation or network is required. Save its JSON evidence in Issue #18. Any failing command blocks the gate.

## Gate B — isolated browser

After Gate A really PASS, run the already committed isolated staging tool into a NEW directory:

```powershell
node scripts/issue18-build-local-stage.js `
  --mobile 'C:\KTS-QA\issue18-review\Mobile' `
  --ngang 'C:\KTS-QA\issue18-review\Ngang' `
  --out 'C:\KTS-QA\issue18-stage-new'
python -m http.server 62545 --bind 127.0.0.1 `
  --directory 'C:\KTS-QA\issue18-stage-new'
```

Open http://127.0.0.1:62545/Mobile/app/ ONLY in a disposable Chrome profile under C:. Confirm Ngang iframe resolves to localhost /Ngang/ and does not contact production. If policy blocks Chrome, do not bypass it.

With synthetic data only, capture actual Chrome screenshots, version/profile, date/region, test output, and non-sensitive localStorage evidence:

1. N035 on 2026-10-29, MN TN/AG: '2d 52 dx5n' -> Tách Đài 'tn ag 52 dx5n', Ngang two '2d 52 dx2.5n', Đá Vòng REJECT. Missing/duplicate station pair HOLD without dispatch/ACK.
2. Partial Cut -> browser reload -> one-step Undo; exact original source and remaining rows.
3. Full Cut -> browser reload -> Undo; prevent resurrected wager rows and lost source.
4. Quota failure on isolated profile: Cut, Clear, Undo, source Cut all fail closed and retry succeeds.
5. Switch date/region with persisted Cut: HOLD without silent deletion; switch back/reload recovers correctly.
6. Offline SW/cache and reconnected version parity; no production iframe leak.

## Gate C — human authorization (not included in Gate A or B)

Independent reviewer checks Router/backend no-send, Desktop parity, corpus/money/source-line provenance, rollback/backup, actual release diff and production environment constraints. Android device smoke is mandatory after a separately approved deployment, never auto-performed here. Current evidence does not authorize it.

| Gate | Current state |
| --- | --- |
| GitHub source backup | VERIFIED |
| Python strict generator --check on full current checkout | NOT_RUN |
| Native Node suite on full current checkout | NOT_RUN |
| Real Chrome / SW offline / storage reload | NOT_RUN |
| Router/desktop final parity | NOT_RUN |
| Physical Android smoke | NOT_RUN |
| Human release decision | NOT_GRANTED |
| Production | **NO_GO** |

Do not merge, publish, deploy, enable paid CI or send Telegram/ACK. COST_USD=0. Keep checkpoint, rollback and QA evidence; do not delete unknown files.
