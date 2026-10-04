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

## Historical correctness rule

Editing a partner config today must not rewrite an old settlement. Each accepted message/settlement stores the exact config snapshot used for that business date.

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

The v0 data store and engine are intentionally added as isolated modules first. They are not loaded by the production PWA shell yet. UI wiring comes after the unknown rules are verified and golden tests exist.
