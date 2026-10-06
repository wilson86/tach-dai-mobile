(function (global) {
  'use strict';

  function deps() {
    const engine = global.KTS_SETTLEMENT_ENGINE;
    const gates = global.KTS_SETTLEMENT_FEATURE_GATES;
    const research = global.KTS_SETTLEMENT_RESEARCH_DEFAULTS;
    if (!engine) throw new Error('SETTLEMENT_ENGINE_NOT_LOADED');
    if (!gates) throw new Error('SETTLEMENT_FEATURE_GATES_NOT_LOADED');
    return { engine, gates, research };
  }

  function settleWithConfig(categoryRows, options) {
    const d = deps();
    const config = options && options.config_snapshot ? options.config_snapshot : {};
    const guarded = d.gates.guardCategoryRows(categoryRows || [], config);
    return d.engine.settle(guarded, {
      partner_role: options && options.partner_role,
      total_percent: config.total_percent == null ? 100 : config.total_percent,
      refund_percent: config.refund_percent == null ? 0 : config.refund_percent
    });
  }

  function mbXienCategoryWithConfig(size, stake, hitUnits, commissionValue, winRate, config) {
    const d = deps();
    const code = 'MB_XIEN' + String(size);
    d.gates.assertCategoryAllowed(code, config || {});
    return d.engine.mbXienCategory(size, stake, hitUnits, commissionValue, winRate);
  }

  function uiPayoutRowWithConfig(hitUnits, winRate, config) {
    const d = deps();
    if (!d.gates.uiEnabled(config || {})) return null;
    if (!d.research || typeof d.research.uiPayoutRow !== 'function') {
      throw new Error('SETTLEMENT_UI_PAYOUT_HELPER_NOT_LOADED');
    }
    return d.research.uiPayoutRow(hitUnits, winRate);
  }

  global.KTS_SETTLEMENT_RUNTIME = Object.freeze({
    version: 'settlement-runtime-v1',
    settleWithConfig,
    mbXienCategoryWithConfig,
    uiPayoutRowWithConfig
  });
})(typeof window !== 'undefined' ? window : globalThis);
