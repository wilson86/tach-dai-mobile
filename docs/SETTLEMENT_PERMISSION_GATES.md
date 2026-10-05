# Settlement permission gates

These gates mirror the original HIOSKT-TTS customer settings and are part of the money contract, not cosmetic UI toggles.

## Effective-dated flags

Each partner config snapshot carries:

- `mb_xien_234`: whether MB Xiên 2-3-4 is allowed.
- `tinh_ui`: whether An Ủi is calculated.

Both default to `false`. Because configs are effective-dated, changing either flag only affects business dates on/after the selected effective date. Earlier messages/settlements keep their saved config snapshot.

## Enforcement

- MB Xiên 2/3/4 is an explicit bet family. If `mb_xien_234 !== true`, settlement must fail closed with `MB_XIEN_234_NOT_ALLOWED`; it must not silently price the ticket.
- Ủi is derived from an existing ĐĐ ticket. If `tinh_ui !== true`, the base ĐĐ ticket remains valid but no `UI` row, hit units, or Ủi payout may be materialized.
- Enabling the flag does not change the configured Xiên/Ủi rates; rates still come from the partner's effective-dated pricing snapshot.

`app/settlement-runtime.js` is the intended entry point for UI settlement so these gates cannot be bypassed accidentally by the future PWA screen.
