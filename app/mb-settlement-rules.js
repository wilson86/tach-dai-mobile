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

  const MB_SELECTORS = Object.freeze({
    '2CB': Object.freeze(['G7:*', 'G6:*', 'G5:*', 'G4:*', 'G3:*', 'G2:*', 'G1:*', 'DB:*']),
    '2CD_DAU': Object.freeze(['G7:*']),
    '2CD_DUOI': Object.freeze(['DB:0']),
    '2CD': Object.freeze(['G7:*', 'DB:0']),
    '2CB8': Object.freeze(['G6:*', 'G7:*', 'DB:0']),
    'DAT': Object.freeze(['G7:*', 'G6:*', 'G5:*', 'G4:*', 'G3:*', 'G2:*', 'G1:*', 'DB:*']),
    '3CB': Object.freeze(['G6:*', 'G5:*', 'G4:*', 'G3:*', 'G2:*', 'G1:*', 'DB:*']),
    '3CB7': Object.freeze(['G6:*', 'G5:3', 'G5:4', 'G5:5', 'DB:0']),
    '3CXC_DAU': Object.freeze(['G6:*']),
    '3CXC_DUOI': Object.freeze(['DB:0']),
    '4C': Object.freeze(['G5:*', 'G4:*', 'G3:*', 'G2:*', 'G1:*', 'DB:*'])
  });

  const MB_POSITION_XAC_UNITS = Object.freeze({
    '3CXC:dau': 3,
    '3CXC:duoi': 1
  });

  function number(v, name) {
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error((name || 'value') + '_INVALID');
    return n;
  }

  function choose2(count) {
    const c = number(count, 'count');
    if (!Number.isInteger(c) || c < 0) throw new Error('INVALID_COUNT');
    return c * (c - 1) / 2;
  }

  function mbXacUnits(code, options) {
    const c = String(code || '').trim().toUpperCase();
    const numberCount = options && options.number_count == null ? 1 : number(options.number_count, 'number_count');
    const stake = options && options.stake == null ? 1 : number(options.stake, 'stake');
    if (!Number.isInteger(numberCount) || numberCount < 0 || stake < 0) throw new Error('INVALID_MB_XAC_INPUT');

    if (c === 'DAT') return choose2(numberCount) * MB_XAC_UNITS.DAT * stake;

    if (c === '3CXC') {
      const position = String(options && options.position || '').trim().toLowerCase();
      const unit = MB_POSITION_XAC_UNITS[c + ':' + position];
      if (unit == null) throw new Error('UNVERIFIED_MB_3CXC_POSITION');
      return unit * numberCount * stake;
    }

    const unit = MB_XAC_UNITS[c];
    if (unit == null) throw new Error('UNVERIFIED_MB_XAC_CATEGORY:' + c);
    return unit * numberCount * stake;
  }

  function mbSelectors(code, options) {
    let c = String(code || '').trim().toUpperCase();
    const position = options && options.position;
    if (c === '3CXC') c += '_' + String(position || '').trim().toUpperCase();
    else if (c === '2CD' && position) c += '_' + String(position).trim().toUpperCase();

    const selectors = MB_SELECTORS[c];
    if (!selectors) throw new Error('UNVERIFIED_MB_SELECTOR_CATEGORY:' + c);
    return selectors.slice();
  }

  global.KTS_MB_SETTLEMENT_RULES = Object.freeze({
    version: 'mb-rules-2026-09-25-oracle',
    MB_XAC_UNITS,
    MB_SELECTORS,
    MB_POSITION_XAC_UNITS,
    mbXacUnits,
    mbSelectors
  });
})(typeof window !== 'undefined' ? window : globalThis);
