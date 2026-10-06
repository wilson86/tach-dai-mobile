(function (global) {
  'use strict';

  const MB_CANONICAL_SELECTORS = Object.freeze({
    TAMLO: Object.freeze({ category: 'MB_2C8', position: null }),
    DAT: Object.freeze({ category: 'MB_2CDA', position: null }),
    BAYLO: Object.freeze({ category: 'MB_3C7', position: null }),
    XCDAU: Object.freeze({ category: 'MB_3CDD', position: 'dau' }),
    XCDUOI: Object.freeze({ category: 'MB_3CDD', position: 'duoi' })
  });

  function canonicalMbSettlementCategory(selector) {
    const key = String(selector || '').trim().toUpperCase();
    const found = MB_CANONICAL_SELECTORS[key];
    if (!found) throw new Error('UNVERIFIED_MB_SETTLEMENT_SELECTOR:' + key);
    return { category: found.category, position: found.position };
  }

  global.KTS_SETTLEMENT_CATEGORY_MAP = Object.freeze({
    MB_CANONICAL_SELECTORS,
    canonicalMbSettlementCategory
  });
})(typeof window !== 'undefined' ? window : globalThis);
