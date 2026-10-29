# Issue #18 — Isolated Unified browser staging (WIP only)

This is a **local-only test builder**, not a deployment or release. The committed
`app/index.html` intentionally retains its public Ngang iframe URL for the
existing published app. **Never open that committed page as a supposedly
isolated Unified end-to-end QA stage.**

## Preconditions

- Use clean, SHA-pinned C: checkouts of the three WIP branches, including:
  - Mobile `5118353d613267428d6917b8932fc790225bb236`
  - Ngang `49fcfd27688436468ec858d2dc855eb80d078843`
  - KTS policy `779a1e8ae9e52ce25f94f4510a8aa45ef8a6d8a3`
- Read each repository's `AGENTS.md` and the WILSON86 zero-cost policy.
- Use **synthetic data only**. Never attach to a personal Chrome profile,
  production database, Telegram session or customer storage.
- Choose a **new, nonexistent** staging directory under an authorized C:
  workspace; its parent must already exist.

## Build from the Mobile repository (Node.js; no packages required)

```powershell
node scripts/issue18-build-local-stage.js --mobile "C:\KTS-QA\mobile-wip" --ngang "C:\KTS-QA\ngang-wip" --out "C:\KTS-QA\issue18-stage-new"
```

The tool verifies that all three `version.json` files share one 64-character
engine SHA, checks required assets, refuses overlapping or symlinked source
paths, refuses existing targets, and copies only into the new staging directory.
It rewrites **only the copy** of the Ngang iframe to `../../Ngang/`; an
unexpected iframe origin fails closed. Original source checkouts remain unchanged.

The output contains `Mobile/`, `Ngang/` and a
`ISSUE18_STAGE_MANIFEST.json` with `release_authorized: false`.

## Serve only on loopback

```powershell
python -m http.server 62545 --bind 127.0.0.1 --directory "C:\KTS-QA\issue18-stage-new"
```

Open `http://127.0.0.1:62545/Mobile/app/` **only in a dedicated disposable
Chrome test profile on C:**. Verify the Ngang iframe is the *local* Ngang page
before any interaction. Never attach computer control to the personal Chrome
profile. If local policy rejects browser control, stop: do not bypass it.

## Scope of actual human/browser acceptance

With synthetic `2d 11 22 11 b6n`, confirm duplicate → Cut one TN/AG result →
reload → Undo; then separately full Cut → reload → immutable origin visible.
Check storage isolation, SW offline/update, N035 mode-specific results, cache,
financial conservation and no-send/ACK. Record screenshots + source/engine SHA.
These tests are **NOT_RUN** until independently executed and evidenced.

## Local deterministic test (does not qualify actual browser)

```powershell
node --test tests/issue18-build-local-stage.test.js
```

No GitHub Pages push, PR, production access, merge, deployment or paid CI/API.
**COST_USD=0; RELEASE=NO_GO until all mandatory gates pass.**
