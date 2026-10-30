# KTS Issue #18 — Production qualification (NO_GO pending evidence)

**This is a read-only operator-run acceptance plan, not approval to merge, publish, deploy or access customer data.**

## Candidate source (verify exact SHA in latest Issue #18 checkpoint)

- Private wilson86/KTS: review/issue18-cache-isolation-authority-20261029.
- Public wilson86/tach-dai-mobile: review/issue18-staging-commit-pins-20261030.
- Public wilson86/tach-dai-ngang: review/issue18-cache-isolation-20261029.
- Candidate versions: Mobile 2.0.38; Ngang 1.0.37; Unified 1.0.27.
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

The tool refuses non-C: workspace paths, unexpected SHA, dirty checkouts, symlink/junction source paths, mismatched versions/engine or missing assets. It invokes the canonical Python generator strict --check, then **2 offline KTS N035 pytest modules** (Router synthetic SQLite no-send and Desktop station-pair oracle), **4 additional KTS-side JavaScript cross-surface/ledger checks** (N035 Mobile/Ngang/Đá Vòng money oracle, canonical duplicate approval parity, approved-duplicate partial Cut/reload, legacy ledger retention), followed by **25 Mobile + 15 Ngang** explicitly audited, locally runnable Node regression files (all checked-in JavaScript tests except Ngang `tests/verify-published-artifact.js`, which calls the live website and must NOT run in offline admission). No GitHub Actions, package install, API, production mutation or network is required. The Python test command disables external pytest plugin autoload and cache writes. If Python pytest is not already installed offline, the gate reports BLOCKED: do not pip-install online or claim PASS. This test set excludes old scripts with hardcoded E: paths, the Telegram runtime and published-site fetches. Save its JSON evidence in Issue #18. Any failing command blocks the gate. This source-level allowlist is NOT proof that tests have run. The stage-integrity test suite now includes 9 negative/positive cases; they must execute with native Node on the pinned final source.


### Expanded KTS JavaScript safety gate (review branch only)

The new review branch `review/issue18-offline-parity-gate-20261030` adds four existing KTS JavaScript entrypoint tests to offline admission. The KTS tests are loaded from the **pinned `KTS/` clone**, not from Mobile code or any published website. Legacy-ledger test receives the two pinned C:-checkout `Mobile/index.html` and `Ngang/index.html` absolute paths. Each failure is a hard NO_GO result (`BLOCKED_KTS_JS_PARITY` or `BLOCKED_KTS_LEDGER`). No customer data, Telegram transport, network or production database is used. Source SHA and clean checkout are verified again at the end. These expanded checks must **actually run on the clean Windows candidate** and are **NOT_RUN** at this GitHub-only checkpoint. No previous Node/Chrome PASS is transferable to the new preflight script SHA without its own local admission receipt.

## Gate B — isolated browser

After Gate A really PASS, run the already committed isolated staging tool into a NEW directory:

```powershell
node scripts/issue18-build-local-stage.js `
  --mobile 'C:\KTS-QA\issue18-review\Mobile' `
  --ngang 'C:\KTS-QA\issue18-review\Ngang' `
  --out 'C:\KTS-QA\issue18-stage-new' `
  --mobile-sha '<MOBILE_HEAD>' `
  --ngang-sha '<NGANG_HEAD>'
python -m http.server 62545 --bind 127.0.0.1 `
  --directory 'C:\KTS-QA\issue18-stage-new'
```

**MANDATORY before Chrome:** verify the stage with:

```powershell
node scripts/issue18-verify-stage.js `
  --mobile 'C:\KTS-QA\issue18-review\Mobile' `
  --ngang 'C:\KTS-QA\issue18-review\Ngang' `
  --out 'C:\KTS-QA\issue18-stage-new' `
  --mobile-sha '<MOBILE_HEAD>' `
  --ngang-sha '<NGANG_HEAD>'
```

Require `STAGE_SOURCE_BYTES_PASS` and `checked_assets: 21`; otherwise do not open the stage. The verifier confirms exact Git HEAD and clean working trees for both apps, matching the SHA values embedded in the stage manifest, in addition to exact asset bytes. It does not test browser behavior.

Open http://127.0.0.1:62545/Mobile/app/ ONLY in a disposable Chrome profile under C:. Confirm Ngang iframe resolves to localhost /Ngang/, the *staged* Unified service-worker routes match /Mobile/app/ (including offline navigations and icons), and there are no requests to production. The committed public SW asset is not edited. If policy blocks Chrome, do not bypass it.

With synthetic data only, capture actual Chrome screenshots, version/profile, date/region, test output, and non-sensitive localStorage evidence:

1. N035 on 2026-10-29, MN two-station scope TN/AG: '2d 52 dx5n'. Check exact Tách Đài/Ngang outputs and money against the owner-approved Issue #18 N035 oracle for the selected date, region, station scope and mode; do not assume equal output or money between Tách Đài and Ngang. Đá Vòng must REJECT a single-number DX. Missing/ambiguous two-station scope must HOLD without dispatch/ACK. The historical corpus N035 entry still says NEEDS_ORACLE and must be interpreted using the later signed Issue #18 owner override rather than silently rewriting history.
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
