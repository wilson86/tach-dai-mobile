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
| All mocked subcommands success | `LOCAL_DETERMINISTIC_PASS_BROWSER_PENDING`, 47 result rows (46 subprocesses + final pin check) | **MATCH** |
| First KTS N035 JavaScript command fails | `BLOCKED_KTS_JS_PARITY`, no Mobile/Ngang tests executed | **MATCH** |
| Legacy ledger test fails | `BLOCKED_KTS_LEDGER`, no Mobile/Ngang tests executed | **MATCH** |
| First Mobile test fails | `BLOCKED_FOCUSED_TEST`, no Ngang tests executed | **MATCH** |
| KTS JS test path is unsafe | `UNSAFE_SOURCE_FILE` thrown before invoking that test | **MATCH** |

**Synthetic control-flow QA: 5/5 PASS.** With all simulated success, command sequence is Python generator, Python Router/Desktop N035, 3 KTS JS entrypoints, 1 KTS legacy ledger JS, 25 Mobile Node and 15 Ngang Node, then 3 Git/identity rechecks. The total **47** is a count of receipt rows, NOT an actual claim of tests passing. GitHub source identity, Windows file access, real subprocess results, money/SQLite/Undo/Chrome/Android remain subject to exact pinned physical/local acceptance.

**Reviewer caution:** No business rules, customer data, source repositories, PWA version or cache changed in this verification. The operator must run the full unmocked preflight in the C:-only test workspace. `COST_USD=0; RELEASE=NO_GO`.
