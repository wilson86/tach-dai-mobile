# Operator-confirmed KTS MB single-dot punctuation — 2026-10-17

## Bug and oracle
- The user explicitly confirmed "đúng": a solitary leading dot before `. 32. B20n` is **punctuation**, not part of the wager. Intended first wager `32 b20n`; second separate wager `52 79 b50n da10n`.
- Exact original 2-line Telegram source:
```text
[10/16/2026 5:37 PM] Thiên: . 32. B20n
[10/16/2026 5:42 PM] Thiên: 52.79.b50n.da10n
```
- New parser semantics must not infer station, invent bets, remove unknown symbols, reinterpret money decimal, accept `.. 32` or allow partial output.
- **Source context:** `MOBILE_UNIFIED`, repository `wilson86/tach-dai-mobile` main at prior production SHA `c0f90851b18d6e99c14256c30d427aa94ce61880`.
- **Code/test SHA before checkpoint:** `fe836715e3ead0c6826eab94ebcdd6bbe9e6753b`. Branch `fix/mb-dot-separator-20261017`, **DRAFT, UNMERGED**.

## Source change and cross-surface contract
- Exactly one guarded normalization `/^\\.\\s+(?=\\d{1,4}(?:\\s|[.,_]|$))/u` at the beginning of a normalized source betting line. The existing normalizer still resolves `52.79.b50n.da10n` and selector-scoped decimals; only single standalone initial dot with whitespace now treated as harmless punctuation.
- Scope is deliberately narrower than a global punctuation replacement. Other ambiguous inputs retain HOLD/REJECT.
- No changes to generated business engine SHA `046935677f9d88468b71246410444c27435c72e1415aeb359c799452584c36eb`, station calendar, runtime send/ACK, Android service worker, version or production checkout.
- New targeted test scripts: `tests/mb-leading-dot-chat-envelope.js`, `tests/mb-leading-dot-davong-parity.js`.
- Mobile/Unified: Direct GitHub-source V8 smoke confirmed the exact screenshot normalizes `32 b20n\n52 79 b50n da10n`, both MB wagers valid; Unified/Đá Vòng output `32 b20n`, `52 79 b50n`, `52 79 da 10n`. Any later invalid line -> **zero** output. Grouped checkbox/Undo/ledger unchanged from prior release; actual browser QA pending.
- Ngang: Same input and both outputs checked in isolated V8, invalid near-neighbors rejected, money decimal protected. Normalization matches Mobile.
- KTS Router/Bridge/Desktop: private isolated review branch `test/mb-leading-dot-provenance-review-20261017`; corpus `P016=APPROVED` after user confirmation; Desktop candidate added same normalization and targeted test; `N041` double-dot remains `NEEDS_ORACLE` as a non-accepted neighbor. Router Bridge inherits engine HTML at explicit C: test path; full cross-surface Node + Python proof still required.

## Gates
- Direct **isolated V8 smoke PASS** for exact 2-line Telegram reproduction on Mobile/Ngang and Unified `transformDaVongText`; **native Node suites not yet run**.
- Router/Desktop Python tests and full corpus all-surface parity `NOT_RUN`; extra carrier paths reports/backend `UNMODIFIED`, explicit evidence pending.
- Production Pages versions currently Mobile 2.0.31, Ngang 1.0.27, Unified 1.0.19. No new release, service-worker cache bump or merge authorized by a punctuation/oracle confirmation alone.
- `RELEASE_READINESS=BLOCKED_PENDING_NODE_AND_ROUTER_DESKTOP_QA`; `COST_USD=0`; `PRODUCTION_MUTATION=NONE`; `REAL_TELEGRAM_SEND=NO`; `E_ACCESS=NONE`; `F_ACCESS=NONE`; `GITHUB_CI=NOT_RUN`.
- NEXT: C:-only isolated Codex run of new tests, existing impacted regression and `KTSRouter/tests/run_ingress_adversarial_gate.js` with both candidate root HTML paths, Desktop Python tests; capture exact tested SHAs/sha256 checkpoint. No automatic deployment or private CI.
