# MB selector oracle — 2026-09-25

Reference app HIOSKT-TTS, dedicated test profile.

Verified selector contracts used by `app/settlement-mb-rules.js`:

- 2C ĐĐ: DB trailing 2 digits = `dau`; G7 all four = `duoi`. XAC 5/number.
- 2C 8 lô (`tamlo`): G6 all three trailing 2 digits + G7 all four + DB trailing 2 digits. XAC 8/number.
- 3C 7 lô (`baylo`): G6 all three + G5 positions 4-6 + DB trailing 3 digits. XAC 7/number.
- 3C xỉu chủ `xcdau`: all three G6 3-digit results. XAC 3/number.
- 3C xỉu chủ `xcduoi`: DB trailing 3 digits. XAC 1/number.

Reference totals for the discriminating test: XAC 260, exact QUA CÒ 197.60, payout 8,125, final customer BÙ -7,927.4.

Golden winning values:

- 2C ĐĐ: 65 as `dau`; 74,64,48,50 as `duoi`.
- 2C8: 99,79,82,74,64,48,50,65.
- 3C7: 199,279,082,861,622,892,465.
- 3CXC: 199,279,082 (`xcdau`) and 465 (`xcduoi`).

The 2C ĐĐ label direction is intentionally preserved exactly as shown by the HIOSKT detail rows. The aggregate `dd` money selector remains the same five positions, so only named position semantics changed.

Unknown/ambiguous MB categories must remain fail closed.
