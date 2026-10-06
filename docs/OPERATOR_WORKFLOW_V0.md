# KTS Settlement PWA - Operator workflow v0

Status: shadow-development only. This document describes the phone workflow on `feature/settlement-pwa-v0`; it is not a production release instruction.

## KQXS display modes

The KQXS pane has two independent display modes:

- **Thời gian thật**: date is fixed to local today. The selected region is polled every 90 seconds. A current-day result needs repeated complete snapshots before the realtime poller stops. A complete single-source snapshot is still `ĐÃ ĐỦ KQ · CHỜ ĐỐI CHIẾU`, not automatically verified.
- **Theo ngày chọn**: date is editable. The PWA first shows any stored snapshot for that date/region, and `Tải ngày đã chọn` performs one provider request. Historical browsing does not create an unnecessary 90-second poll loop.

Changing the selected date/region never deletes a stored snapshot. Provider corrections create append-only `result_events`. The KQXS audit panel exposes those versions so a money change can be traced to a changed lottery result rather than silently overwriting the prior evidence.

A background KQXS scope required by accepted settlement messages must not be stopped merely because the operator stops the visible realtime view.

## Saved message workflow

The Tin pane keeps the original accepted text and shows a scoped history for the selected counterparty/date/region.

Message states include parser error, waiting for KQXS, provisional, complete-unverified, blocked, and cancelled. `Nạp lại` copies the original text back into the input box and creates a new message only after the operator presses `Lưu + tính`; it does not edit the historical message.

### Reversible cancel

`Hủy tin` is a soft cancel, not a delete:

- original message remains in IndexedDB for audit;
- cancelled messages are excluded from settlement scope calculations;
- the affected partner/date/region is recalculated immediately;
- cancelling the last active message overwrites the prior scope settlement with an explicit zero/empty scope so stale money cannot remain;
- KQXS-triggered future recalculation continues to ignore cancelled messages;
- `Khôi phục` re-enables the message and recalculates the same scope.

This operation changes money and therefore requires an explicit operator click/confirmation. There is no automatic cancel heuristic.

## Feature permissions

MB Xiên 2-3-4 and Tính Ủi remain permission-gated per effective-dated partner configuration. Both are off by default. Research or internet descriptions do not bypass these gates.

## Release gate

All of the above remains shadow-only. Promotion still requires the agreed observation period with zero unexplained exact-money differences against HIOSKT-TTS. Display-only rounding agreement is not sufficient for promotion.
