# Shadow evidence history

Status: feature branch only. This contract is for shadow qualification and must not be treated as production approval by itself.

## Purpose

Every meaningful HIOSKT comparison is preserved as append-only evidence so a future rule/config/KQXS/parser change can be compared against the exact prior state instead of keeping only the latest comparison.

## Stored evidence

Each `shadow_events` record is scoped by `partner_id + business_date + region` and stores:

- trigger and reason (`MANUAL_COMPARE`, automatic recalculation trigger, etc.);
- exact local settlement totals and category rows;
- engine version;
- full effective config snapshot and config version;
- full KQXS snapshot, fingerprint and verification status;
- the exact active message set with raw text + canonical payload/version;
- normalized HIOSKT reference totals/categories;
- full exact/display/mismatch comparison result;
- timestamp and deterministic evidence fingerprint.

Consecutive evidence with the same fingerprint is deduplicated so 90-second KQXS polling does not create repeated identical history rows.

## Replay case

`KTS_SETTLEMENT_SHADOW_RUNTIME.getReplayCase(scope)` converts the latest (or a selected event) into `kts-shadow-replay-case-v1`, containing all inputs needed to turn a real mismatch into a deterministic golden regression case later.

The replay object is read-only evidence. It does not modify messages, configs, results, settlements or HIOSKT references.

## UI

In **Báo cáo → Đối chiếu HIOSKT · Shadow**, use **Lịch sử đối chiếu** to see the evidence timeline. Newest entries show KTS vs HIOSKT Thu/Bù, delta, trigger, KQXS verification, engine version and config version.

## Safety

- Existing HIOSKT reference data is never overwritten by recalculation without the shadow guard re-comparing it.
- Blocked settlement scopes cannot create a false comparison event.
- KQXS source conflict remains fail-closed.
- Xiên/Ủi permission gates are unrelated and remain OFF unless explicitly enabled in effective-dated partner config.
