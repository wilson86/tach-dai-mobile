# KQXS view modes

The settlement PWA supports two independent KQXS display modes.

## Thời gian thật

- `resultDate` is locked to the phone's current local date.
- The selected region (MN / MT / MB) is refreshed every 90 seconds.
- Current-day complete results require the existing repeated-complete confirmation rule before background polling stops.
- Result snapshots are persisted and settlement scopes are recalculated automatically.
- Leaving or stopping the visible realtime view does not stop a background KQXS job when there are settlement messages that still depend on that date/region.

## Theo ngày chọn

- `resultDate` becomes editable.
- Changing date or region immediately shows any matching snapshot already stored in IndexedDB.
- `Tải ngày đã chọn` performs one provider fetch only; it does not create a repeating historical poll loop.
- The fetched snapshot is saved to the same audited KQXS stores and relevant settlement scopes are recalculated.

## Safety

`partial` results remain `TẠM TÍNH`. A complete but unverified snapshot is shown as `ĐÃ ĐỦ KQ · CHỜ ĐỐI CHIẾU`; only independently verified data may show `ĐÃ XÁC MINH`.
