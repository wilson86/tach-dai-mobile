# KTS PWA Settlement v0

Status: internal shadow-development only. Not deployed to production/main.

## Product direction

- Primary working surface: mobile PWA on phone.
- PC/Desktop remains internal to the owner and is not part of customer commercialization.
- PWA must persist editable partners, pricing configs, messages, result snapshots and settlement reports.
- Current reference app remains the accounting oracle during the shadow-comparison period.

## Local persistence

IndexedDB database: `kts_settlement_v0`.

Stores:

- `partners`: customer/owner records.
- `configs`: versioned pricing/config records per partner.
- `messages`: raw input plus canonical KTS parse and the config snapshot used.
- `results`: lottery-result snapshots by business date/region.
- `settlements`: calculated result plus immutable config/result snapshots and reference-app comparison status.
- `metadata`: local schema/app metadata.

Export/import is required so the phone database can be backed up before later server sync exists.

## Effective-date pricing history

Saving a changed partner configuration must require an `effective_from_date` (`YYYY-MM-DD`).

Example:

- config v1 effective 2026-10-01
- config v2 effective 2026-10-10

Then:

- business dates 2026-10-01 through 2026-10-09 use v1
- business dates on/after 2026-10-10 use v2 until another later config becomes effective

The resolver selects the latest config whose `effective_from_date <= business_date`.

Old configs are not overwritten merely because a newer price is saved. Each accepted message also stores the resolved config snapshot, so editing prices later cannot rewrite an old report.

## Historical correctness rule

Editing a partner config today must not rewrite an old settlement. Each accepted message/settlement stores the exact config snapshot used for that business date.

## Detailed report contract

Reports are dynamic and must reflect exactly what that partner actually bet. Do not use a fixed category list that can hide activity.

For every partner/date, the report must support:

- separate region sections (MN / MT / MB when present)
- every category actually present in the bets (for example 2CB, 2CĐ, ĐáT, ĐáX, 3C, 4C, XC, etc.)
- XÁC per category
- QUA CÒ per category
- TRÚNG units per category
- payout per category
- HỒI when applicable
- final THU / BÙ
- original message text
- detailed winning rows: station/pair/number/selector/points so the user can explain why a line won
- message-level and day-level totals
- reference-app comparison status during shadow mode

If a person did not bet a category, the report does not need to show an empty category. If they did bet it, it must appear.

`app/settlement-report.js` builds this dynamically from settlement/category/detail rows rather than from a hard-coded report template.

## Lottery results

The PWA result feature is in scope:

- show results by business date and region/station, comparable to the current reference app
- poll during live draw windows at roughly 60-120 second intervals
- persist timestamped result snapshots
- recalculate affected settlements when a result snapshot changes
- mark incomplete draws as provisional, not final
- stop polling once the required draw is complete
- later use primary + verification source before marking a settlement final

A result-source adapter must be separate from settlement rules so changing the provider does not change accounting logic.

## Settlement integration

Do not add a second parser. The PWA settlement layer consumes canonical KTS output. Unknown payout rules fail closed.

Confirmed settlement arithmetic is implemented separately in `app/settlement-engine.js` and mirrored by the Python settlement engine in the KTS repository feature branch.

## Shadow comparison

Every report should eventually carry:

- KTS calculated totals
- reference-app totals entered/recorded for comparison
- MATCH / MISMATCH / UNVERIFIED
- per-category differences

Commercial readiness is blocked until an agreed observation window has zero unexplained money differences.

## Not yet wired into the visible PWA

The v0 data store, settlement engine and report builder are intentionally isolated first. They are not loaded by the production PWA shell yet. Visible UI wiring comes after unknown rules are verified and golden tests exist.
