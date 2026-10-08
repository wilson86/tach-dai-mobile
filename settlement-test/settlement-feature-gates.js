(function (global) {
  'use strict';

  const FEATURES = Object.freeze({
    MB_XIEN_234: 'mb_xien_234',
    TINH_UI: 'tinh_ui'
  });
  // Safety authority: Ủi remains locked until the operator explicitly confirms
  // the business rule in a future qualified release. Persisted/imported flags
  // cannot bypass this domain-level gate.
  const UI_CONFIRMED = false;

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
    return UI_CONFIRMED && flag(config, FEATURES.TINH_UI);
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

  // Use identical category and detail filtering in live settlement and
  // golden regression. Invisible/unconfirmed UI money must not survive in
  // a printable message breakdown after its category has been rejected.
  function guardEvaluation(evaluated, config) {
    if (!evaluated || !Array.isArray(evaluated.category_inputs) || !Array.isArray(evaluated.detail_rows)) {
      throw new Error('SETTLEMENT_EVALUATION_INVALID');
    }
    return {
      category_inputs: guardCategoryRows(evaluated.category_inputs, config),
      detail_rows: evaluated.detail_rows
        .filter(row => uiEnabled(config) || String(row && row.code || '').toUpperCase() !== 'UI')
        .map(row => Object.assign({}, row))
    };
  }

  global.KTS_SETTLEMENT_FEATURE_GATES = Object.freeze({
    version: 'feature-gates-v2-guarded-evaluation',
    FEATURES,
    UI_CONFIRMED,
    isMbXienCode,
    assertCategoryAllowed,
    uiEnabled,
    materializeUiRow,
    guardCategoryRows,
    guardEvaluation
  });
})(typeof window !== 'undefined' ? window : globalThis);
