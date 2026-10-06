# Exact money accounting contract

Settlement money arithmetic must not depend on IEEE-754 floating-point behavior.

## Contract

- `settlement-engine.js` computes accounting values with exact finite-decimal arithmetic backed by `BigInt` integer + decimal scale.
- Public numeric fields remain for current UI compatibility.
- Every category row also carries `exact` decimal strings for `xac`, `commission_value`, `hit_units`, `win_rate`, `qua_co`, and `payout`.
- Every settlement carries `exact` decimal strings for `total_xac`, `total_qua_co`, `total_payout`, `gross_net`, `total_percent`, `refund_percent`, `refund_amount`, and `final_net`.
- Shadow comparison uses exact decimal evidence when available. Numeric tolerance is only a compatibility fallback for old snapshots that predate exact evidence.
- A value that merely rounds to the same one-decimal display is never promotion-safe when exact decimal evidence differs.

## Important separation

Exact internal accounting does **not** decide the unresolved HIOSKT display tie rule for values such as `13.05`. Internal money is stored exactly as `13.05`; the display-rounding oracle remains a separate business-compatibility question.

## Regression requirements

CI must protect at least:

- known MN/MT and MB oracle totals;
- `% tổng` then `% hồi` ordering;
- `commission_type = amount` division by 100;
- repeated decimal values such as `0.1`, `0.2`, `0.3` without binary drift;
- exact-vs-display-only Shadow behavior.

No production promotion should rely solely on rounded UI values.