(function (global) {
  'use strict';

  const MB_XAC_UNITS = Object.freeze({
    '2CB': 27,
    '2CD': 5,
    '2CB8': 8,
    'DAT': 54,
    '3CB': 23,
    '3CB7': 7,
    '4C': 20
  });

  const MB_PROVEN_SELECTORS = Object.freeze({
    '2CB': Object.freeze(['G7:*', 'G6:*', 'G5:*', 'G4:*', 'G3:*', 'G2:*', 'G1:*', 'DB:*']),
    '3CB': Object.freeze(['G6:*', 'G5:*', 'G4:*', 'G3:*', 'G2:*', 'G1:*', 'DB:*']),
    '4C': Object.freeze(['G5:*', 'G4:*', 'G3:*', 'G2:*', 'G1:*', 'DB:*'])
  });

  function n(v, name) {
    const x = Number(v);
    if (!Number.isFinite(x)) throw new Error((name || 'value') + '_INVALID');
    return x;
  }

  function choose2(count) {
    const c = n(count, 'count');
    if (!Number.isInteger(c) || c < 0) throw new Error('INVALID_COUNT');
    return c * (c - 1) / 2;
  }

  function mbXacUnits(code, options) {
    const c = String(code || '').toUpperCase();
    const stake = n(options && options.stake == null ? 1 : options.stake, 'stake');
    const numberCount = n(options && options.number_count == null ? 1 : options.number_count, 'number_count');
    if (stake < 0 || !Number.isInteger(numberCount) || numberCount < 0) throw new Error('INVALID_MB_XAC_INPUT');

    if (c === 'DAT') return choose2(numberCount) * MB_XAC_UNITS.DAT * stake;
    const unit = MB_XAC_UNITS[c];
    if (unit == null) throw new Error('UNVERIFIED_MB_XAC_CATEGORY:' + c);
    return unit * numberCount * stake;
  }

  function mbSelectors(code) {
    const c = String(code || '').toUpperCase();
    const selectors = MB_PROVEN_SELECTORS[c];
    if (!selectors) throw new Error('UNVERIFIED_MB_SELECTOR_CATEGORY:' + c);
    return selectors.slice();
  }

  global.KTS_SETTLEMENT_MB_RULES = Object.freeze({
    version: 'mb-oracle-2026-09-22-v1',
    MB_XAC_UNITS,
    MB_PROVEN_SELECTORS,
    mbXacUnits,
    mbSelectors
  });
})(typeof window !== 'undefined' ? window : globalThis);
