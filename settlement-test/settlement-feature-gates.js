(function (global) {
  'use strict';

  const FEATURES = Object.freeze({
    MB_XIEN_234: 'mb_xien_234',
    TINH_UI: 'tinh_ui'
  });

  function flag(config, name) {
    return Boolean(config && config[name] === true);
  }

  function isMbXienCode(code) {
    const c = String(code || '').trim().toUpperCase();
    return c === 'MB_XIEN2' || c === 'MB_XIEN3' || c === 'MB_XIEN4';
  }

  function assertCategoryAllowed(code, config) {
    if (isMbXienCode(code) && !flag(config, FEATURES.MB_XIEN_234)) {
      throw new Error('MB_XIEN_234_NOT_ALLOWED');
    }
    return true;
  }

  function uiEnabled(config) {
    return flag(config, FEATURES.TINH_UI);
  }

  function materializeUiRow(row, config) {
    if (!uiEnabled(config)) return null;
    if (!row) return null;
    return Object.assign({}, row);
  }

  function guardCategoryRows(rows, config) {
    const out = [];
    for (const row of (rows || [])) {
      const code = String(row && row.code || '').toUpperCase();
      if (code === 'UI') {
        const ui = materializeUiRow(row, config);
        if (ui) out.push(ui);
        continue;
      }
      assertCategoryAllowed(code, config);
      out.push(Object.assign({}, row));
    }
    return out;
  }

  global.KTS_SETTLEMENT_FEATURE_GATES = Object.freeze({
    version: 'feature-gates-v1',
    FEATURES,
    isMbXienCode,
    assertCategoryAllowed,
    uiEnabled,
    materializeUiRow,
    guardCategoryRows
  });
})(typeof window !== 'undefined' ? window : globalThis);
