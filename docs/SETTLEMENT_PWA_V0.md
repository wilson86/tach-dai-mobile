# KTS PWA Settlement v0

Status: internal shadow-development only. Not deployed to production/main.

## Product direction

- Primary working surface: mobile PWA on phone.
- PC/Desktop remains internal to the owner and is not part of customer commercialization.
- PWA persists editable partners, effective-dated pricing configs, messages, KQXS snapshots and settlement reports.
- Current HIOSKT-TTS reference app remains the accounting oracle during shadow comparison.

## Local persistence

IndexedDB database: `kts_settlement_v0`, schema version 4.

Stores:

- `partners`: customer/owner records.
- `configs`: versioned pricing/config records per partner.
- `messages`: raw input + canonical KTS parse + immutable config snapshot.
- `results`: latest KQXS snapshot by business date/region.
- `result_events`: append-only changed KQXS snapshots for audit/correction history.
- `settlements`: calculated result + immutable config/result snapshots + reference-app comparison status.
- `metadata`: local schema/app metadata.

Export/import is required so the phone database can be backed up before later server sync exists.

## Effective-date pricing history

Saving a changed partner configuration requires `effective_from_date` (`YYYY-MM-DD`). The resolver selects the latest config with `effective_from_date <= business_date`.

Old configs are never overwritten merely because a new price is saved. Accepted messages and settlements retain the exact config snapshot used, so later price changes cannot rewrite historical reports.

## Accounting direction

`partner_role` is the counterparty role relative to the operator:

- `customer`: gross = `QUA_CO - PAYOUT`; positive = THU, negative = BÙ.
- `owner`: gross = `PAYOUT - QUA_CO`; positive = THU, negative = BÙ.

Reference-app order is verified as:

`gross -> total_percent -> eligible refund -> final THU/BÙ`

Refund eligibility:

- customer: refund reduces operator THU when the customer loses.
- owner: refund reduces operator BÙ when the owner wins against the operator.

## Commission modes

Verified:

- `ratio` (`Tỉ lệ`): `QUA_CO = XAC * value`.
- `amount` (`Thành tiền`): `QUA_CO = XAC * value / 100`.
- `direct`: direct money per stake unit, used by MB Xiên 2/3/4. Values are partner config, not hard-coded business constants.

All exact money is retained internally; one-decimal display is presentation only.

## Verified MN / MT category rules

The user confirmed MT uses the same settlement structure as MN.

XÁC units for stake 1:

| Category | XÁC rule |
|---|---:|
| 2CB | 18 per number |
| 2CĐ / DD | 2 per number (đầu + đuôi) |
| 2C 7lô | 7 per number |
| ĐáT | 36 per unordered number pair |
| ĐáX | 72 per unordered number-pair × unordered station-pair |
| 3CB | 17 per number |
| 3C 7lô | 7 per number |
| XC / 3CXC | 2 per number (xcđầu + xcđuôi) |
| 4C | 16 per number |

Winning selectors proven by reference-app oracle:

- 2CB: all 18 MN/MT draw results.
- 2CĐ: G8 last 2 digits = đầu; DB last 2 digits = đuôi.
- 2C 7lô: G8 + G7 + all 3 G6 + G5 + DB = 7 draw results.
- 3CB: all draw results with at least 3 digits = 17 results (everything except G8).
- 3C 7lô: G7 + all 3 G6 + G5 + first G4 + DB = 7 draw results.
- XC / 3CXC: G7 last 3 digits = xcđầu; DB last 3 digits = xcđuôi.
- XC payout uses the configured `3C ĐĐ` win rate.
- 4C: 16 results with at least 4 digits (G6..DB).

## Verified MN / MT DAT / DAX rules

Classification:

- one station + `da` => DAT (Đá thẳng).
- two or more stations + `da`/`dx` => DAX (Đá xiên).

Expansion:

- DAT with N numbers => all `C(N,2)` unordered number pairs.
- DAX => all unordered number pairs × all unordered station pairs.

For each pair, if either side has zero occurrences => 0 hit units.

Three hit modes are verified for DAT and per-station-pair DAX:

- `one_time` / `1 lần`: 1 unit when both sides hit.
- `multi_pair` / `nhiều cặp`: `min(hitsA, hitsB)`.
- `ky_ruoi` / `kỳ rưỡi`: `(hitsA + hitsB) / 2`.

DAX is evaluated independently for each station pair and then summed.

## Verified MB category rules

The following syntax is confirmed and supported by the canonical settlement parser:

- `01 tamlo 1n` => **2C 8 lô**.
- `01 02 da 1n` => **2C Đá thẳng**.
- `012 baylo 1n` => **3C 7 lô**.
- `012 xcdau 1n xcduoi 1n` => **3C ĐĐ**, meaning **xỉu chủ đầu + xỉu chủ đuôi**.
- `xien` is MB Xiên 2/3/4 syntax.

Verified MB XÁC/selectors:

- 2CB: 27 XÁC per number; all 27 MB results.
- 2CĐ: 5 XÁC per number; đầu = all four G7 values, đuôi = DB.
- 2C 8 lô / `tamlo`: 8 XÁC per number; all three G6 + all four G7 + DB.
- 3CB: 23 XÁC per number; G6 through DB.
- 3C 7 lô / `baylo`: 7 XÁC per number; all three G6 + G5 positions 4,5,6 + DB.
- `xcdau`: 3 XÁC per number; all three G6.
- `xcduoi`: 1 XÁC per number; DB.
- 4C: 20 XÁC per number; G5 through DB.

### MB đá thẳng: fixed selected-number multi-pair behavior

MB does not use the MN/MT hit-mode switch. Its target business rule is always đá thẳng with all selected-number pairs evaluated.

- `92 61 da 1n` => one hidden pair: `92-61`.
- `92 61 44 da 1n` => three hidden pairs: `92-61`, `92-44`, `61-44`.
- N selected numbers => `C(N,2)` hidden unordered pairs.
- Each hidden pair has XÁC `54 × stake` (`27 lô positions × 2 numbers`).
- Total MB đá XÁC = `C(N,2) × 54 × stake`.
- Each hidden pair can win at most one unit: both numbers occur at least once => 1; otherwise 0. Repeat lô occurrences do not multiply that pair.
- Total đá hit units are the sum of winning hidden selected pairs.

**Display rule:** internal pair expansion must not rewrite the visible accepted message. `92 61 44 da 1n` remains displayed as that original line in message/report views.

## Verified MB Xiên 2-3-4

Examples:

- `92 61 xien 1n` => Xiên 2.
- `92 61 44 xien 1n` => Xiên 3.
- `92 61 44 51 xien 1n` => Xiên 4.

For one ticket at stake 1:

- XÁC = 1.
- all selected numbers must occur for the ticket to win; winning ticket contributes 1 hit unit.
- QUA CÒ is direct per-ticket money from partner config.
- payout is `hit_units * configured win rate`.

Reference TEST_KTS example used Cò 56/52/45 and Trúng 1000/4000/10000. Those rates are config values and must never be hard-coded for every partner.

## Tính Ủi

Verified visible hit rule for MN/MT DD: a selected 2-digit number exactly `-1` or `+1` from the winning đầu/đuôi number is counted as `An Ủi`.

Implementation helper currently supports exact numeric ±1 only. Wrap behavior around `00`/`99` has not been proven. Non-zero Ủi payout still requires an oracle case before automatic money impact is enabled.

## Detailed report contract

Reports are dynamic: if a partner bet a category, it must appear; categories with no activity do not need empty rows.

For every partner/date, reports must support MN / MT / MB sections, every category actually present, XÁC, QUA CÒ, TRÚNG units, payout, HỒI, final THU/BÙ, original message text, detailed winning rows, message/day totals, and reference-app comparison status.

For MB đá with 3+ selected numbers, settlement may carry hidden pair legs for calculation, but the user-facing message line must remain the original raw/canonical accepted line rather than three rewritten bet lines.

`app/settlement-report.js` builds reports dynamically rather than from a fixed category list.

## KQXS auto-update

`app/result-service.js` is source-independent and defaults to 90-second polling (must stay within 60-120 seconds).

Normalized snapshots contain date, region, source, fetched time, stations, prize arrays, completeness, verification state and a deterministic fingerprint. Incomplete draws are `partial`. Network/provider failures retain the last snapshot and retry.

A poller can require repeated identical complete snapshots before stopping. The message-driven automatic manager uses three identical complete observations for the current business date, so a provider correction on the next 90-second fetch resets the confirmation streak instead of silently freezing the first complete response. Historical dates use one complete fetch. Independently verified results can stop immediately.

`app/result-auto.js` starts the correct date/region KQXS monitor automatically when a settlement message is saved. Result updates are persisted and trigger `recalculateDateRegion`, so the operator does not have to remember to open the KQXS tab and start polling manually. Multiple date/region scopes are keyed independently and duplicate running pollers for the same scope are suppressed.

`app/settlement-store.js` stores both the latest result and changed-result audit events. A changed provider result therefore causes a new audit event and can trigger settlement recalculation/warning without losing prior evidence.

No API key or provider secret belongs in PWA JavaScript. Provider fetching must be injected through an adapter/server endpoint.

## Shadow comparison and observation gate

`app/settlement-shadow.js` and `app/settlement-shadow-runtime.js` compare the exact KTS settlement against HIOSKT-TTS by partner/date/region and persist the reference snapshot plus comparison result.

A scope can be `MATCH_EXACT`, `MATCH_DISPLAY_ONLY`, `MISMATCH`, blocked/provisional, or still unverified. Matching only the rounded one-decimal display is not sufficient for promotion; exact internal monetary values are required.

`app/settlement-observation.js` aggregates the observation window across scopes and days. It deliberately does not invent the required duration. Until `required_observation_days` is explicitly configured, `promotion_ready` is always false with blocker `OBSERVATION_DURATION_NOT_CONFIGURED`. When a duration is configured, promotion readiness requires every included scope to be exact and at least that many observation days to have all included scopes exact.

The report pane exposes a Shadow observation dashboard for date range, required-day gate, exact/mismatch/display-only/blocked/provisional/unverified counts and remaining blockers.

## Remaining fail-closed items before full all-region automatic settlement

1. `Tính Ủi` with a non-zero configured payout rate, including 00/99 edge behavior.
2. Exact one-decimal display tie behavior at an exact `x.xx5` boundary. Exact internal money must never be rounded early.

Unsupported paths fail closed rather than guess.

## Release gate

The visible production PWA/main remains untouched; development stays isolated on `feature/settlement-pwa-v0`.

Commercial readiness remains blocked until an agreed live observation window has zero unexplained monetary differences against HIOSKT-TTS and satisfies the configured observation-duration gate. No automatic customer money action is allowed before that gate.
