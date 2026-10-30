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

The tool refuses non-C: workspace paths, unexpected SHA, dirty checkouts, symlink/junction source paths, mismatched versions/engine or missing assets. It invokes the canonical Python generator strict --check, then **2 offline KTS N035 pytest modules** (Router synthetic SQLite no-send and Desktop station-pair oracle), **4 additional KTS-side JavaScript cross-surface/ledger checks** (N035 Mobile/Ngang/Đá Vòng money oracle, canonical duplicate approval parity, approved-duplicate partial Cut/reload, legacy ledger retention), followed by **26 Mobile + 15 Ngang** explicitly audited, locally runnable Node regression files (all checked-in JavaScript tests except Ngang `tests/verify-published-artifact.js`, which calls the live website and must NOT run in offline admission). No GitHub Actions, package install, API, production mutation or network is required. The Python test command disables external pytest plugin autoload and cache writes. If Python pytest is not already installed offline, the gate reports BLOCKED: do not pip-install online or claim PASS. This test set excludes old scripts with hardcoded E: paths, the Telegram runtime and published-site fetches. Save its JSON evidence in Issue #18. Any failing command blocks the gate. This source-level allowlist is NOT proof that tests have run. The stage-integrity test suite now includes 9 negative/positive cases; they must execute with native Node on the pinned final source.


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


## Independent GitHub-content engine execution (review-only evidence, 2026-10-30)

This evidence is **in-memory V8 execution of the real generated JavaScript**, loaded from immutable GitHub file refs, not a fabricated mock, not an OS/browser/Android qualification and not a claim that the new KTS-side Node allowlist ran. Evaluated exact generated engine files at Mobile `737d689b5388fb1060bca5fbd1891e69328bed1d` and Ngang `6f47f7c6b073c5df25da55b2b8f3bcc61513da20`: the two JavaScript files are **byte-identical**, with identical Git blob `0131c6fafa1641ab6255dcd647af188a7c5784c6` and pinned engine SHA `7952aa29eda4ba7117d0245ed71b79cf8f8643f291b94dbef268b710a4b849ea`.

- **640 deterministic money-conservation cases PASS** on the actual `allocateStake` function: both `TACH_3_MIEN` and `NGANG`, amount 1 through 40, whole and plus-0.5 units, division counts 1–4. Each resulting monetary half-unit total exactly equals its input. Tests checked `null` rows for zero allocations without losing money.
- Mode-specific proof: `allocateStake('5n', 2, 'TACH_3_MIEN') => ['2.5n','2.5n']`, while `allocateStake('5n', 2, 'NGANG') => ['2n','3n']`. This is the generic workflow allocation policy; do **not** substitute it for the special number-pair `DX` N035 oracle or say the two modes are equivalent.
- The approved Quýt money transform on the actual engine returned `bao 100 -> 107` and `bl 101 -> 108` under `BAO_MULTIPLIER_CEIL`; `dx 101` was not multiplied.
- Fail-closed parser behavior on actual engine: duplicate `11 11 dx6n` and `11 11 da6n` -> `DUPLICATE_NUMBER_PAIR_INVALID`; ordinary `11 11 b6n` -> `DUPLICATE_NUMBER_CONFIRM_REQUIRED`; `11 22 b6n` accepted.
- The bare `2d 52 dx5n` text is rejected by `parseBetPayloadAst` without station context. **Contextual N035 validity must be verified through the real Mobile/Ngang entrypoints** (new offline admission gates), not inferred from a context-free parser call.

The expanded offline preflight source was examined for executable JavaScript syntax using a JS parser on both the runner and its regression test (**2/2 syntax PASS**) and checked for expected allowlists, exact status/error paths and scoped HTML inputs. All four referenced KTS JS test files exist at the pinned KTS SHA. **New expanded native Windows preflight, Chrome and Android remain NOT_RUN**. Source/manifest check alone is not a production go-ahead.

**Manager:** escalate to real Windows test only after exact-pin check; **Reviewer:** engine money invariant proof passed in-memory and KTS JS acceptance added but NOT_RUN; **End user:** no real UI Cut/Undo/ledger approval. `RELEASE=NO_GO; CODEX=NOT_INVOKED; PRIVATE_CI=NOT_TRIGGERED; COST_USD=0; PROD_MUTATION=NONE.`


## Actual PWA entrypoint N035 proof in isolated JavaScript runtime (2026-10-30)

Independently fetched the pinned **actual** `index.html`, `station_calendar.generated.js`, and `business_engine.generated.js` files from BOTH original review commits: Mobile `737d689b5388fb1060bca5fbd1891e69328bed1d`, Ngang `6f47f7c6b073c5df25da55b2b8f3bcc61513da20`. Executed each app's real `validateCheckOnlyLine` and `processLine` functions in a fresh isolated V8 context with a minimal synthetic DOM. The fixture uses `2026-10-29`, MN, stations TN/AG and ticket `2d 52 dx5n`.

| Actual entrypoint | Expected | Observed |
| --- | --- | --- |
| Mobile Tách Đài | `tn ag 52 dx5n` | **MATCH** |
| Ngang Tách Ngang | `2d 52 dx2.5n` × 2 lines | **MATCH** |
| Mobile missing second station | HOLD | `RELATIVE_2D_ACTIVE_SCOPE_UNAVAILABLE` |
| Ngang missing second station | HOLD | `RELATIVE_2D_ACTIVE_SCOPE_UNAVAILABLE` |
| Mobile duplicate active station | HOLD | `RELATIVE_2D_ACTIVE_SCOPE_DUPLICATE` |
| Ngang duplicate active station | HOLD | `RELATIVE_2D_ACTIVE_SCOPE_DUPLICATE` |
| Unified/Đá Vòng `transformDaVongText` with genuine Mobile entrypoint API | Reject, no materialized output | `ok=false`, `outputs=[]`, `DA_VONG_NEEDS_AT_LEAST_TWO_NUMBERS` |

The Unified function came directly from the pinned real `app/unified-core.js`, executed in V8, not from an invented imitation. The result directly supports the signed N035 authority. It does **not** certify native Windows Chrome, Android or persistent browser storage.

**Important caution (Cut):** An additional non-browser Cut/reload exploration with an incomplete synthetic DOM did not produce a meaningful selection; it was **inconclusive**, and is **neither** a verified product regression **nor** a PASS. The candidate uses checkbox/grouped selection behavior, which a minimal synthetic DOM cannot establish. Required original committed Node Cut/Undo QA, isolated real Chrome, storage failure/rollback and end-user checks remain NOT_RUN for the expanded review gate. Do not claim device/release readiness from isolated V8.

**Three roles:** Director = continue focused acceptance and gate release; independent reviewer = actual N035 PWA entrypoint and Unified rejection PASS in-memory, Cut proof blocked; end user = do not use money/Cut flows in production before device acceptance. `RELEASE=NO_GO`.


## Source-executed offline preflight control-flow verification (2026-10-30)

**Scope explicitly limited:** Fetched the exact candidate `scripts/issue18-production-preflight.js` JavaScript from GitHub review HEAD (blob `66db0753a59923aad35eafd7f34393e043b4a7d4`), loaded its actual `admission()` entrypoint in isolated V8, and supplied **synthetic Windows C: filesystem/Git/process APIs**. Thus these tests exercise the **real orchestration code**, but replace the executed pytest/Node tests with controlled outcomes. **This is NOT a native Windows qualification, not the 47 original checks passing, and not device/browser QA.**

| Synthetic scenario | Expected from actual preflight code | Observed |
| --- | --- | --- |
| All mocked subcommands success | `LOCAL_DETERMINISTIC_PASS_BROWSER_PENDING`, 48 result rows (47 subprocesses + final pin check) | **MATCH** |
| First KTS N035 JavaScript command fails | `BLOCKED_KTS_JS_PARITY`, no Mobile/Ngang tests executed | **MATCH** |
| Legacy ledger test fails | `BLOCKED_KTS_LEDGER`, no Mobile/Ngang tests executed | **MATCH** |
| First Mobile test fails | `BLOCKED_FOCUSED_TEST`, no Ngang tests executed | **MATCH** |
| KTS JS test path is unsafe | `UNSAFE_SOURCE_FILE` thrown before invoking that test | **MATCH** |

**Synthetic control-flow QA: 5/5 PASS.** With all simulated success, command sequence is Python generator, Python Router/Desktop N035, 3 KTS JS entrypoints, 1 KTS legacy ledger JS, 26 Mobile Node and 15 Ngang Node, then 3 Git/identity rechecks. The total **48** is a count of receipt rows, NOT an actual claim of tests passing. GitHub source identity, Windows file access, real subprocess results, money/SQLite/Undo/Chrome/Android remain subject to exact pinned physical/local acceptance.

**Reviewer caution:** No business rules, customer data, source repositories, PWA version or cache changed in this verification. The operator must run the full unmocked preflight in the C:-only test workspace. `COST_USD=0; RELEASE=NO_GO`.


## One-command Windows C:-only evidence collector (without Codex)

A new **review-branch only** entrypoint, `scripts/issue18-run-windows.js`, performs the complete existing exact-source `admission()` and preserves the resulting diagnostic JSON in a separate C:-only folder without requiring Codex or an online API. It does not stage/deploy an app, publish, send Telegram or change production; it always sets `release=NO_GO`. This is intended to reduce the owner's manual steps **when the existing three isolated C:-only clean checkouts are already present**. It does NOT clone, reset, fetch, pull, overwrite or otherwise alter source, and does NOT claim a successful Windows result until locally executed.

Preconditions: `C:\KTS-QA\issue18-review\KTS`, `...\Mobile`, `...\Ngang` are clean normal Git clones (no junctions, no linked worktrees), with Node + Python/pytest already installed locally. The private KTS checkout must be at exactly `eec80f812ff0ab47109edcacc32f31eedaffca79`; Ngang at `6f47f7c6b073c5df25da55b2b8f3bcc61513da20`; Mobile must be on `review/issue18-offline-parity-gate-20261030` and descend from `737d689b5388fb1060bca5fbd1891e69328bed1d`, with no uncommitted files. The new runner is executed from that **same** Mobile checkout.

From Windows PowerShell (no Codex):

```powershell
Set-Location 'C:\KTS-QA\issue18-review\Mobile'
node .\scripts\issue18-run-windows.js --mobile-sha '<EXACT_REVIEW_SHA_FROM_GITHUB_CHECKPOINT>'
```

The runner aborts if not on Windows C:, if the workspace/evidence path is linked, if the Git roots/branch/pins differ, or if the source tree is dirty. It then runs the pinned Python generator strict check, N035 offline pytest, 4 KTS JS checks, 26 Mobile and 15 Ngang JS regressions, and postflight Git integrity checks, saving an **append-only, unique JSON receipt** at `C:\KTS-QA\issue18-evidence\issue18-<timestamp>-<pid>.json`. The evidence folder is outside all three checkouts and created only after confirming the C: parent; preexisting file names cannot be overwritten (`wx`). An optional alternative root may be supplied with `--workspace ABS_C_DIR --evidence ABS_C_DIR`, but the safety guards remain.

`LOCAL_DETERMINISTIC_PASS_BROWSER_PENDING` means only Gate A passed; browser Chrome, real Android, personal data and release authorization remain separate gates. A failing test exits nonzero and writes the failing admission receipt; failures of preliminary source/disk safety checks abort without writing any checkout files.

**Evidence at this checkpoint:** tests of the committed helper's CLI validation/default C: paths and non-Windows refusal **5/5 PASS** using the exact GitHub JavaScript code in isolated V8; local Node test file covers defaults, invalid overrides and non-Windows refusal (3 cases). **Windows live execution NOT_RUN; no Actions triggered.** Do not claim device or full admission PASS from these helper-unit results. `COST_USD=0; RELEASE=NO_GO`.


## Additional safety review — Windows receipt path and Git index (2026-10-30)

**Defects fixed only in candidate QA tools; application source remains pinned/unchanged.**

1. `scripts/issue18-run-windows.js` previously used case-sensitive `startsWith` to reject evidence paths inside or containing the C: workspace. Real Windows paths are case-insensitive, so a path with mixed-case spelling could bypass this safety gate. The new pure `overlapsWorkspace` routine normalizes and case-folds both Windows paths, rejects identical/ancestor/descendant paths and allows only independent evidence folders. GitHub source and exact test bytes are verified with blob SHA.
2. `git status` may refresh the optional Git index even when the test runner intends to be read-only. The helper's Git probes now force `GIT_OPTIONAL_LOCKS=0`, `GIT_TERMINAL_PROMPT=0`, regardless of inherited settings. The preflight's child process wrapper applies the same overrides to its subprocesses. This limits optional Git writes and interactive credential requests; it does not imply every existing synthetic test is side-effect free.

**Observed QA, not Windows qualification:** Isolated Linux Node 22 `node --test tests/issue18-run-windows.test.js` -> **5/5 PASS** (C: defaults, mixed-case path overlaps, Git environment policy, invalid arguments, non-Windows refusal). Exact tested Git blobs: runner `48f685f214e7eb8b91f55c67ab5646b1f87a2f6b`, tests `1418b68e18cb45434dd6d2a5fd0b45c3e960a0e8`. The revised `scripts/issue18-production-preflight.js` (blob `b8e9814209883fe26046ee8dd2689ed3cc0b2cd2`) passed JS syntax parsing and **2 source-executed isolated V8 orchestrator simulations**: all-success returns `LOCAL_DETERMINISTIC_PASS_BROWSER_PENDING` with 47 synthetic receipt rows / 46 mocked subprocess calls / 18 Git calls all configured read-only; first KTS JS N035 error returns `BLOCKED_KTS_JS_PARITY` with no subsequent PWA tests. The **47 rows and 46 mocks are not genuine application test receipts**.

**Three-role review:**
- Project director: no uncontrolled input/QA path writes authorized; additional blocker removed before local Windows test. RELEASE NO_GO pending device acceptance.
- Independent reviewer: verified patch scope + exactly tested helper bytes, negative path tests, preflight fail-closed orchestration; no claims of actual Windows or full native app PASS.
- End user: Cut/Undo/reload, real financial output and Android offline/cache still need live-device isolated acceptance; no production wagers allowed.

`CODEX=NOT_USED; GITHUB_ACTIONS=NOT_REQUESTED; COST_USD=0; MERGE=NO; DEPLOY=NO; PRODUCTION_MUTATION=NONE; RELEASE=NO_GO.`


## Further offline admission repair — self-test pin and safe source paths (30 October 2026)

**Why this batch:** The original expanded preflight listed **25** Mobile test files and omitted the new `tests/issue18-run-windows.test.js` guarding its own one-command Windows evidence launcher. Thus the native admission could report success without exercising a recently added safety-critical test. The candidate now pins **26 Mobile Node tests**, 15 Ngang tests, 4 KTS cross-surface JS checks, and 2 KTS pytest modules. Inactive `issue18-public-qa-only.yml` allowlist count updated to 26 to avoid stale CI assertions if the code is later reviewed there. **No GitHub Actions were intentionally launched.**

**Further safety:** All KTS pytest and Mobile/Ngang Node test source paths now pass the existing `safeFile` C:-checkout regular-file realpath guard, not just `lstat` on the last file. This protects against test-directory junctions redirecting execution out of the pinned workspace. Added isolated dependency injection only to test `safeFile` without touching real filesystem; the production path always uses the real `fs` module.

**Real defect reproduced and corrected:** The first revision of the self-test check mistakenly demanded that *Ngang* also contain Mobile's Windows runner test, causing an inevitable test FAIL. Source-executed regression caught it. The contract now requires `tests/issue18-run-windows.test.js` in Mobile **only**, while preserving all three cross-app shared test assertions on both modes.

**Observed evidence, carefully classified:**
- Pinned source-executed V8 Windows filesystem/Git/process simulation of revised preflight: **3/3 PASS** (green route 48 simulated receipt rows and 47 mocked subprocesses, blocked Python test source junction, blocked Mobile runner source junction). This is not Windows native QA.
- Source-executed V8 test callbacks from the **actual new 8-test** `tests/issue18-production-preflight.test.js` with mocked Node modules/assertions: **8/8 PASS** after the Mobile-only test fix. Initial negative run produced 7/8 and proved the allowlist defect, now fixed.
- Both revised JS files passed source-level syntax parsing. These tests do **not** establish that the actual pytest/Node regression suite ran on native Windows, Chrome or Android.

**Three-role milestone review:** Project director: QA admission now covers its own launcher and rejects symlinked test sources, but release still NO_GO. Independent reviewer: verified the test-scoping regression and a fail-closed correction, simulation evidence is not actual Windows Node. End user: N035 money/Cut/Undo on real Chrome/Android remains NOT_RUN. No source engine, parser, version, cache, user ledger, production or money behavior changed.

`RELEASE=NO_GO; CODEX=NOT_USED; GITHUB_ACTIONS=NOT_TRIGGERED; COST_USD=0; E_ACCESS=NONE; F_ACCESS=NONE; MERGE=NO; DEPLOY=NO; CONTEXT=ELEVATED; SKILLS=MANUAL_ONLY.`

`CLEANUP_STATUS=NO_ACTION; FILES_REMOVED=0; SPACE_RECOVERED_MB=0; FILES_PRESERVED=all existing sandbox files and GitHub source; CLEANUP_BLOCKERS=unrelated pre-existing sandbox files not identified as owned by this batch are retained.`


## Optional no-Codex Gate A + isolated Chrome Gate B in one Windows command (2026-10-30)

The read-only Windows evidence entrypoint has a new **explicit opt-in** `--chrome` flag. The old command (no flag) is unchanged: run only Gate A preflight, save a JSON receipt, and retain `release=NO_GO`. The new flag does not publish, deploy, send or ACK messages, touch real Chrome profiles or production, nor grant device acceptance.

**Prerequisites (not verified on the owner's machine):** all three clean, independent, source-pinned C:-only checkouts, already installed local Python/pytest + Node 22+, and Chrome on C:. No Codex, GitHub Actions or paid API is required. The helper locates Chrome in the usual C: program paths, or accepts a C:-only `CHROME_PATH` value. It will refuse symlinked/junction/other-drive paths. From a clean `C:\KTS-QA\issue18-review\Mobile` checkout on the documented review branch:

```powershell
Set-Location 'C:\KTS-QA\issue18-review\Mobile'
node .\scripts\issue18-run-windows.js --mobile-sha '<EXACT_REVIEW_SHA_FROM_GITHUB_CHECKPOINT>' --chrome
```

The helper first runs the **actual** SHA/clean-checkout-verified Gate A (Python strict generator, N035 Router/Desktop, four KTS cross-surface Node, 26 Mobile Node and 15 Ngang Node, postflight source pins). **Only** if Gate A returns `LOCAL_DETERMINISTIC_PASS_BROWSER_PENDING`, it creates a brand-new **append-only C:-only evidence stage** outside the three source checkouts, assembles and verifies the 21 original exact-commit assets plus two safe isolated Unified rewrites, and launches the existing `issue18-chrome-isolated-smoke.js` in a disposable Chrome profile against an ephemeral **127.0.0.1-only** server. Browser smoke explicitly exercises both mode outputs, N035 singleton reject, Cut/reload/Undo, 3 SW scopes offline and date-mismatch HOLD recovery. Its temporary profile is handled by that existing smoke; the stage remains as rollback/failure evidence until authorized cleanup.

**Fail-closed condition:** A subprocess exit code 0 is insufficient. The new launcher additionally requires all five independent existing stdout receipt markers: `ISSUE18_PUBLIC_CHROME_CUT_RELOAD_UNDO_PASS`, `ISSUE18_PUBLIC_CHROME_WRONG_DATE_HOLD_AND_RECOVERY_BOTH_MODES_PASS`, `ISSUE18_PUBLIC_CHROME_N035_THURSDAY_EXACT_ORACLE_PASS`, `ISSUE18_PUBLIC_CHROME_OFFLINE_3_SCOPE_PASS`, and `ISSUE18_PUBLIC_CHROME_LOCAL_ONLY_PASS`. Missing any one => `BLOCKED_CHROME`, never Browser PASS. A second source-Git pin check follows. No source checkout writes should occur. A new unique `issue18-<timestamp>-<pid>.json` receipt records both `preflight` and `browser` outcomes. If Gate A fails, `browser.status=NOT_RUN`; if Chrome fails, `browser.status=BLOCKED_CHROME`, `success=false`. Only a qualified local Chrome run can produce `LOCAL_CHROME_PASS_ANDROID_PENDING`; `release` remains **NO_GO** regardless.

**Observed QA, independent of any Windows claim:** Node **22.16.0** in a disposable Linux sandbox, `node --test tests/issue18-run-windows.test.js` => **7 PASS / 0 FAIL** on **byte-identical GitHub files**, including opt-in CLI rejection and all-five-receipt negative tests. Exact blob IDs: `scripts/issue18-run-windows.js` `d2a2486fd51fa7f2a7fb90ba59fffd4914f5b908` (SHA-256 `41ac2a23d10fcb1b4f81feb80b7938c5a890e7f3c943a3514d74781b84dc3277`) and `tests/issue18-run-windows.test.js` `6ca6f9a2634a772e74063814c329492fcd70b41d` (SHA-256 `65ab83906d67900480b4dcc6186815c8afe1528497313fb443fa29e18880e3d2`). Chromium 144.0.7559.96 is installed in this *Linux* sandbox but the complete source-pinned three-app stage was **not** available here; therefore **real browser PWA acceptance NOT_RUN**. The native Windows `--chrome` end-to-end path itself remains **NOT_RUN** and must not be called qualified until performed on the owner's PC.

**Three-role gate:** project director = optional zero-cost browser step prepared, NO_GO release; independent reviewer = real 7/7 Node helper tests qualify only the launcher and receipts, no Windows/Chrome PASS; end user = still needs real Chrome/Android visual and monetary Cut/Undo acceptance and explicit owner approval. `COST_USD=0; CODEX=NOT_INVOKED; CI=NOT_TRIGGERED; MERGE=NO; DEPLOY=NO; PROD_MUTATION=NONE; SKILLS=MANUAL_ONLY; CONTEXT=ELEVATED.`


## Critical identity gate: exact Mobile review SHA is now mandatory (2026-10-30)

**Verified unsafe earlier condition:** Previously the Windows evidence launcher accepted any syntactically valid Mobile Git HEAD on `review/issue18-offline-parity-gate-20261030` as long as it descended from the old base commit. A source-executed minimal fake Windows/Git environment proved an arbitrary **unreviewed** synthetic 40-hex descendant could obtain `LOCAL_DETERMINISTIC_PASS_BROWSER_PENDING` and write a JSON receipt. This is **a QA launcher source-identity defect**, not a product-parser defect. Evidence: actual prior launcher Git blob `d2a2486fd51fa7f2a7fb90ba59fffd4914f5b908`, synthetic arbitrary HEAD `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`, resulting `success=true` and one receipt in fake filesystem.

**Fix:** `scripts/issue18-run-windows.js` now requires `--mobile-sha` followed by **exactly 40 lowercase hex characters** from an **independently inspected GitHub checkpoint SHA**. It refuses missing/malformed/duplicate source pins before reading any source or writing evidence. `probe(root,pin)` compares `git rev-parse HEAD` against that exact value, in addition to KTS/Ngang fixed SHAs and Mobile review branch/ancestry/clean-checkout checks; it also uses the same pin after Chrome. This protects against unexpectedly advancing Mobile checkout after review. Do not replace the independent checkpoint SHA with `git rev-parse HEAD` from a checkout being tested—that would defeat the trust check.

From the **clean, already prepared** Windows C: checkout, substitute the *actual reviewed full Mobile HEAD from GitHub checkpoint* for `<EXACT_REVIEW_SHA_FROM_GITHUB_CHECKPOINT>`. No Codex required:

```powershell
Set-Location 'C:\KTS-QA\issue18-review\Mobile'
node .\scripts\issue18-run-windows.js --mobile-sha '<EXACT_REVIEW_SHA_FROM_GITHUB_CHECKPOINT>' --chrome
```

Without `--chrome`, the same command runs only Gate A. Both modes write fail-closed C:-only receipts outside source and **never** grant release permission. A source mismatch exits nonzero and aborts before writing a receipt. When the review branch advances, the independent GitHub checkpoint pin must change after re-review; old receipts remain tied to their own SHAs.

**Observed scoped QA, not physical Windows:** Actual source-executed V8 regression callbacks from the GitHub test source, using mocked Node builtins, **9/9 PASS** on the final runner/test code SHA as of this checkpoint, including explicit SHA validation, unapproved synthetic descendant denial, Chrome option and old fail-closed checks. An additional source-executed virtual Windows/Git negative scenario rejected a synthetic unreviewed HEAD with `SOURCE_DRIFT` before receipt creation; an explicitly matching synthetic SHA could proceed. The older **7/7 actual Node.js sandbox PASS** was on the previous helper code SHA and is **not a new real-Node qualification of this modified SHA**. Windows, physical Chrome, Android, user money/Cut/Undo/ledger acceptance remain **NOT_RUN**.

**Three-role decision:** PM = identity defect closed in candidate QA tool; reviewer = repro and exact-pin regression observed, real Windows still pending; end user = safe to begin offline acceptance only, not use live bets. `RELEASE=NO_GO; CODEX=NOT_USED; PRIVATE_CI=NOT_TRIGGERED; COST_USD=0; E/F_ACCESS=NONE; SKILLS=MANUAL_ONLY; CONTEXT=ELEVATED`.


## Raw-byte manifest diagnosis before Windows generator — 30 October 2026 (LATEST)

**Symptom under investigation:** A previous Windows strict generator `--check` was reported FAIL. The exact failing stale path is *still unknown*. Current three application candidate roots have **no root `.gitattributes`**; Git on Windows **may** check out tracked JSON using CRLF conversion. The generator compares immutable `BUILD_MANIFEST.json` content hashes of JSON **raw bytes**. Git clean status and JSON parse success are not sufficient proofs of byte identity. CRLF is a **hypothesis, not the verified historical failure cause**.

**Added read-only source gate, BEFORE Python generator:** `scripts/issue18-canonical-byte-guard.js` checks the actual KTS `SharedBusinessEngine/engine_spec.json`, `calendar_authority.json`, and `pwa_version_templates.json` raw SHA-256 against three *independently pinned SHA values* published by the exact KTS candidate `BUILD_MANIFEST.json`. All paths must pass the existing C:-checkout `safeFile` no-junction/non-symlink test. Receipt `CANONICAL_INPUT_RAW_BYTE_PINS` names every source file, expected SHA, actual SHA, classification, and `ok`. `MATCH` continues; any mismatch gives `BLOCKED_CANONICAL_INPUT_BYTES` **without executing Python**. A file whose SHA becomes the pinned value *only* after normalizing CRLF to LF is `CRLF_CHECKOUT`; other mismatch is `SOURCE_BYTES_DRIFT`. Neither failure is silently normalized or fixed. Missing/unsafe source stops closed. Engine, data, original generated artifacts and production remain untouched.

**Native Node 22.16.0 exact-source evidence:** `node --test tests/issue18-canonical-byte-guard.test.js` in an isolated Linux scratch directory → **5 PASS / 0 FAIL**, with exact source file Git blobs matching GitHub: module `142c84aa359a2bcb10270d4171e9e07e1711d645`, test `3c55817d776845ed748a041ed01e34cace5f70d2`. Five assertions cover manifest pin allowlist, true LF exact match, CRLF vs real drift, malformed inputs, read-only multi-file aggregation. Source-executed V8 mock invocation of the **actual revised preflight** `29a7c895c061ff3fcb742cb6f6368ba2abe40b4b` verified **2/2 admission control paths**: mismatch → `BLOCKED_CANONICAL_INPUT_BYTES`, no generator/subprocess, 1 synthetic receipt; all-match → original checks proceed with 50 synthetic receipt rows (48 mocked subprocesses). The 50 rows are NOT real QA application results. Latest allowlist **27 Mobile / 15 Ngang**; public workflow count reconciled, **GitHub Actions NOT triggered**.

**Safe Windows response if this gate reports `CRLF_CHECKOUT`:** preserve failed JSON receipt, do not use `dos2unix`, `git add --renormalize`, `git reset --hard`, or rewrite canonical source in an existing repository. Only in a **new, separately authorized empty C:-only isolated folder**, arrange a clean source clone with `git -c core.autocrlf=false clone ...` (or a repo-local checkout that guarantees byte-identical JSON) and run the exact SHA/clean-checkout admission again. Never access E:/F:. If classification is `SOURCE_BYTES_DRIFT`, inspect the actual local checkout and expected Git source before changes; do not assume a newline-only issue. If the raw-byte gate passes yet strict generator still fails, preserve the generator's `stale` list: further mismatch must be diagnosed independently, not attributed to CRLF.

**Operator command on a ready clean C: workspace** (no Codex; substitute the final independently reviewed full Mobile HEAD from GitHub, not `git rev-parse HEAD` from the unreviewed checkout):
```powershell
Set-Location 'C:\KTS-QA\issue18-review\Mobile'
node .\scripts\issue18-run-windows.js --mobile-sha '<EXACT_REVIEW_HEAD_FROM_GITHUB>' --chrome
```

**Three-role gate:** project director = transparent upstream Windows diagnosis added and no source mutation; independent reviewer = real pinned Node unit tests 5/5 plus **mocked** preflight 2/2 properly separated; end user = real Windows generator, Chrome, Android, money Cut/Undo and persistent ledger still **NOT_RUN**, release NO_GO. `COST_USD=0; CODEX=NOT_USED; GITHUB_CI=NOT_RUN; MERGE=NO; DEPLOY=NO; PRODUCTION_MUTATION=NONE; SKILLS=MANUAL_ONLY; CONTEXT=ELEVATED.`


## No-Codex bootstrap for the missing three C:-only checkouts (latest)

**Verified state before this batch:** source branch SHA for private KTS app `eec80f812ff0ab47109edcacc32f31eedaffca79`, public Ngang `6f47f7c6b073c5df25da55b2b8f3bcc61513da20`, and public Mobile review `review/issue18-offline-parity-gate-20261030` all matched their independently reviewed pins on GitHub. **This does NOT establish that any checkout exists on the owner's PC.** Earlier operator instructions assumed those checkouts were prepared. The new *optional, operator-run* `scripts/issue18-bootstrap-windows.js` closes that preparation gap without Codex, merge/deploy, CI or paid services.

**What it can do after the operator invokes it on Windows:** restrict source and temporary files to C:; require `--mobile-sha` equal to the latest **independently reviewed full GitHub HEAD**; refuse unsafe Git environment overrides; create only `C:\KTS-QA\issue18-review/{KTS,Mobile,Ngang}` as new clean Git clones from the three fixed official branch/repositories, using **repo-local `core.autocrlf=false` before first checkout**. It verifies full branch name, exact KTS/Mobile/Ngang commits, official remote origin, clean index and normal `.git` directories. An existing full workspace is used only after **read-only exact validation**; a partially present or unknown workspace produces `PARTIAL_OR_UNKNOWN_WORKSPACE`. It never overwrites, deletes, resets, pulls or cleans existing source and never touches E:/F:. If cloning fails, keep partial objects as failure evidence and do not auto-clean; fix authentication/paths manually before another invocation.

**Prerequisites:** Windows 11; Git CLI and Node.js already installed; Git credentials authorized locally for **private** `wilson86/KTS` (first clone fails closed if no authorization); Python/pytest and Chrome already installed if requesting the acceptance run. All must use no paid API or subscription. This code cannot remotely create files on the owner's computer from ChatGPT. Its user invocation is separate and voluntary.

**Shortest operator path:** after inspecting the repository script on GitHub, copy the exact current Mobile review **HEAD SHA** into `$sha`. Download the public, **SHA-pinned** script only to the authorized C: folder, refusing a reparse-point parent and existing source script. Then invoke it. The example URL is a fixed file retrieval, *not* a connector to production.

```powershell
$sha = '<CURRENT_FULL_MOBILE_REVIEW_SHA_FROM_GITHUB>'
$dir = 'C:\KTS-QA'
if (Test-Path -LiteralPath $dir) {
  if ((Get-Item -LiteralPath $dir -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'UNSAFE_QA_PARENT' }
} else { New-Item -ItemType Directory -Path $dir | Out-Null }
$file = Join-Path $dir 'issue18-bootstrap-windows.js'
if (Test-Path -LiteralPath $file) { throw 'BOOTSTRAP_ALREADY_EXISTS_KEEP_AND_REVIEW' }
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/wilson86/tach-dai-mobile/$sha/scripts/issue18-bootstrap-windows.js" -OutFile $file
node $file --mobile-sha $sha --run-chrome
```

The bootstrap tool has two modes: no `--run-chrome` means **prepare/validate exact checkouts only**; with `--run-chrome` it first qualifies the three source clones, then invokes the existing exact-pin local Windows preflight + isolated Chrome stage and saves the separate detailed JSON receipt outside the clones at `C:\KTS-QA\issue18-evidence`. On a failing command it stops and leaves sources/evidence untouched, without deleting unique failure artifacts. Even `LOCAL_ACCEPTANCE_RECEIPT_REVIEW_REQUIRED` is **not a release approval**; Android/physical end-user QA and explicit release authorization remain.

**Observed scoped QA:** Actual GitHub source of the new bootstrap helper (blob `ecf52271b8ba1a349fd8458506ae930b6da50243`) and regression test (blob `d5b15dd4a22eae8e11e235c2520e4b3902ef4c52`) loaded in V8 with mocked OS/Node internals: **6/6 pure admission/argument safety test callbacks PASS**, including strict repo/pin, partial workspace rejection, origin validation and non-Windows refusal. A separate **real git executable** in Linux isolated scratch confirmed `git clone -c core.autocrlf=false --branch … --single-branch --no-tags` preserves branch+HEAD, clean status, local `core.autocrlf=false` and byte-identical LF JSON; no private GitHub repository, Windows or browser execution was performed. All sandbox fixture Git repositories were deleted after QA. QA count is now **28 Mobile Node files + 15 Ngang** in **new unexecuted preflight**, public workflow count synchronized but NOT triggered. Original 25 Mobile + 15 Ngang **real Ubuntu CI** and final-source Chrome asset-equivalent evidence remain PASS only on their respective unchanged app SHA. No new application logic was changed.

**Tri-role decision:** project director = operator C: bootstrap path ready for review, still NO_GO; independent reviewer role = isolated logic and actual Linux git command qualify only the preparation approach, Windows bootstrap NOT_RUN; end user = no production readiness until Windows receipts, Android actual Cut/Undo/ledger/reload/offline acceptance and owner approval. `COST_USD=0; CODEX=NOT_USED; CI=NOT_TRIGGERED; MERGE=NO; DEPLOY=NO; PROD_MUTATION=NONE; SKILLS=MANUAL_ONLY; CONTEXT=ELEVATED; RELEASE=NO_GO`.
