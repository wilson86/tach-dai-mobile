(function (global) {
  'use strict';

  function n(v, name) {
    const x = Number(v);
    if (!Number.isFinite(x)) throw new Error((name || 'value') + '_INVALID');
    return x;
  }

  // Research-backed fallback only. HIOSKT-TTS remains the accounting oracle.
  // Public Vietnamese court records describe "an ủi" as a separate payout for
  // đầu/đuôi rather than a new stake. Therefore Ủi adds payout only.
  function uiPayoutRow(hitUnits, winRate) {
    const hits = n(hitUnits, 'ui_hit_units');
    const rate = n(winRate, 'ui_win_rate');
    if (hits < 0 || rate < 0) throw new Error('INVALID_UI_PAYOUT');
    return {
      code: 'UI',
      xac: 0,
      commission_type: 'ratio',
      commission_value: 0,
      hit_units: hits,
      win_rate: rate
    };
  }

  // Research/default presentation policy: halfExpand (ties away from zero),
  // which matches Intl.NumberFormat's default rounding mode and Python
  // Decimal ROUND_HALF_UP used by the shadow engine. Exact money stays unrounded.
  function display1HalfExpand(value) {
    const x = n(value, 'display_value');
    const magnitude = Math.abs(x);
    const roundedMagnitude = Math.floor(magnitude * 10 + 0.5 + 1e-12) / 10;
    const rounded = x < 0 ? -roundedMagnitude : roundedMagnitude;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }

  global.KTS_SETTLEMENT_RESEARCH_DEFAULTS = Object.freeze({
    version: 'research-defaults-v1',
    uiPayoutRow,
    display1HalfExpand
  });
})(typeof window !== 'undefined' ? window : globalThis);
