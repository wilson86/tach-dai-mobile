# KTS Issue #18 — Windows evidence receipt gate (NO_GO)

**Scope:** new read-only reviewer only; application source, engine, worker, versions, deployment and release are unchanged. Existing Ubuntu application Node/Chrome CI receipts are reused, not rerun. No paid CI, API or production operations.

## Exact source pins

- Mobile+Unified public candidate `737d689b5388fb1060bca5fbd1891e69328bed1d`: Node workflows `40988221595`, `40988227059` SUCCESS.
- Prior real Ubuntu Chrome `40988211867` SUCCESS at `a9f9b59e61c2d4357e795901979cfdce6832fda5`; compare verified application source unchanged to public candidate.
- Windows QA-only Mobile branch `review/issue18-offline-parity-gate-20261030` HEAD `a6cbffde732e022131d7c79349e1b8bffd6f1f56`.
- Private KTS `eec80f812ff0ab47109edcacc32f31eedaffca79`; public Ngang `6f47f7c6b073c5df25da55b2b8f3bcc61513da20`.

## New offline reviewer

- Source: `scripts/issue18-evidence-gate.js`, Git blob `f281e4dd138562a478fd92453a1e4d5426502d7e`.
- Tests: `tests/issue18-evidence-gate.test.js`, Git blob `888b37a7c4ad9122b682f7c8c393b09c7baeb0f2`.
- **Native Linux Node 22.16.0: 8/8 PASS**, both blobs exact against local tested bytes. These are *synthetic receipt fixtures*, **NOT native Windows QA of the app**.
- Enforces independent exact SHA, version/engine, 50 ordered/check-counted evidence rows including generator, Router/Desktop, 27 Mobile and 15 Ngang; checks child exit/status, Chrome stage 21 asset proofs and five markers. Always returns `release=NO_GO`, `android=NOT_RUN`; refuses non-C: Windows evidence files.

## Next actual Windows gate — only in already prepared C: workspace

From **the pinned Mobile QA checkout** (not this new reviewer branch):

```powershell
cd C:\\KTS-QA\\issue18-review\\Mobile
node .\\scripts\\issue18-run-windows.js --mobile-sha a6cbffde732e022131d7c79349e1b8bffd6f1f56 --chrome
```

The runner produces `C:\\KTS-QA\\issue18-evidence\\issue18-<timestamp>-<pid>.json`. Preserve it. This read-only reviewer is on a **different branch**: run it only from a **separate C:-only checkout** of this branch after the runner, against that explicit JSON path; do **not** copy its files into or dirty the pinned three-source workspace.

```powershell
node .\\scripts\\issue18-evidence-gate.js --receipt 'C:\\KTS-QA\\issue18-evidence\\issue18-<timestamp>-<pid>.json' --mobile-sha a6cbffde732e022131d7c79349e1b8bffd6f1f56 --chrome
```

**No local Windows receipt has been observed**. Browser and Android real-device acceptance + separate human release authorization remain mandatory. This module cannot certify visual behavior, finance oracle, or live Android on its own. Never send Telegram, deploy, publish or merge based on a green JSON review.

**Three-role review:** Project director = safer evidence interpretation, production blocked; Independent reviewer (assistant role) = 8/8 native Node synthetic tests PASS at exact source, Windows NOT_RUN; End user = Windows Chrome and physical Android source Cut/Undo, reload, saved wager, date/region/offline upgrade NOT_RUN.

`COST_USD=0; PRIVATE_CI_NOT_TRIGGERED; PUBLIC_CI_NOT_TRIGGERED_THIS_BATCH; MERGE=NO; DEPLOY=NO; PRODUCTION_MUTATION=NONE; RELEASE=NO_GO`.
