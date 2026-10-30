# KTS Issue #18 — real Node receipt-gate test recovery (2026-10-30)

**Release decision: NO_GO.** Review-only JavaScript test fix; no application, parser, engine, business rules, PWA cache, production or customer data changed.

## Source authority and reproducible failure
- Parent reviewer branch `review/issue18-receipt-reconciliation-20261030`, HEAD `9f66fedcb8d00c9411452c3db796f05769777b2f`.
- Exact original module Git blob: `scripts/issue18-evidence-gate.js` = `f281e4dd138562a478fd92453a1e4d5426502d7e`.
- Exact original test Git blob: `tests/issue18-evidence-gate.test.js` = `888b37a7c4ad9122b682f7c8c393b09c7baeb0f2`. Both Git blobs were reconstructed and verified by local `git hash-object`.
- Repro on Node v22.16.0, Linux, using these exact two Git blobs in the repository's `scripts/` and `tests/` layout:
  `node --test tests/issue18-evidence-gate.test.js` -> **FAIL: MODULE_NOT_FOUND**; the original test imported `./issue18-evidence-gate.js` from `tests/`, whereas the module is in `scripts/`. Therefore the prior claimed 8/8 on the exact GitHub source was **not reproducible**.
- One-line test-only fix: `require('../scripts/issue18-evidence-gate.js')`; new test Git blob = `dc25b471eb28c617cbe3df367e50c64a847c925c`. Production module Git blob remains `f281e4dd138562a478fd92453a1e4d5426502d7e`.
- Actual local execution of fixed exact blobs: `node --test tests/issue18-evidence-gate.test.js` -> **8 PASS, 0 FAIL, exit 0**, Node v22.16.0. Synthetic evidence fixtures ONLY, not Windows/browser/device acceptance. CLI Windows file operations are intentionally not exercised on Linux.

## Existing app evidence reused, NOT rerun
- Mobile+Unified application PR #23 HEAD `737d689b5388fb1060bca5fbd1891e69328bed1d`, draft; GitHub public Ubuntu Node workflows `40988221595` and `40988227059` SUCCESS on the app HEAD.
- Chrome Ubuntu workflow `40988211867` SUCCESS on prior `a9f9b59e61c2d4357e795901979cfdce6832fda5`; previous compare verified app source unchanged.
- Exact pinned Windows QA sources: private KTS `eec80f812ff0ab47109edcacc32f31eedaffca79`, Mobile QA-only `a6cbffde732e022131d7c79349e1b8bffd6f1f56`, Ngang `6f47f7c6b073c5df25da55b2b8f3bcc61513da20`. These sources were not modified in this batch.
- **No hosted CI started** by this review branch; native Windows exact-source Gate A/B, physical Windows Chrome, generator/Router/Desktop on Windows, Android upgrade/cache/Cut/Undo and release approval are still **NOT_RUN / PENDING**.

## Three-role release gate (assistant perspectives, not separately employed reviewers)
- **Project director:** a previously broken QA test is runnable again; keep the app PR draft and prioritize Windows C:-only acceptance. **NO_GO**.
- **Independent reviewer:** original exact source proven FAIL, changed exact source 8/8 PASS; cannot transfer this test result to the actual Windows runner. **LIMITED QA PASS ONLY**.
- **End user:** physical Cut/reload/Undo, money/source retention, version/cache/offline and Android remain unverified. **NO_GO**.

## Next safe operator acceptance
Only after the three pre-existing *clean isolated* `C:\KTS-QA\issue18-review\{KTS,Mobile,Ngang}` checkouts are present and pinned; **never clone/reset/overwrite production paths**:

```powershell
cd C:\KTS-QA\issue18-review\Mobile
node .\scripts\issue18-run-windows.js --mobile-sha a6cbffde732e022131d7c79349e1b8bffd6f1f56 --chrome
```

Preserve the resulting distinct `C:\KTS-QA\issue18-evidence\issue18-*.json` receipt. Run the separate reviewer on this branch in a **separate C:-only reviewer checkout** so the pinned source checkouts remain clean. Do not use the local Node receipt reviewer or existing Ubuntu CI as device acceptance.

`COST_USD=0; CI_NEW=0; CODEX=NOT_USED; MERGE=NO; DEPLOY=NO; NO_CUSTOMER_SEND; PRODUCTION_MUTATION=NONE; E_ACCESS=NO; F_ACCESS=NO; CLEANUP=NO_ACTION; FILES_REMOVED=0; SPACE_RECOVERED_MB=0; FILES_PRESERVED=ALL; CONTEXT=ELEVATED; SKILLS=MANUAL_ONLY.`
