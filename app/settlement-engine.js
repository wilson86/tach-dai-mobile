(function (global) {
  'use strict';

  const ZERO = 0;

  function n(v, name) {
    const x = Number(v);
    if (!Number.isFinite(x)) throw new Error((name || 'value') + '_INVALID');
    return x;
  }

  function role(v) {
    const r = String(v || '').toLowerCase();
    if (r !== 'customer' && r !== 'owner') throw new Error('INVALID_PARTNER_ROLE');
    return r;
  }

  function datHitUnits(hitsA, hitsB, mode) {
    hitsA = n(hitsA, 'hits_a');
    hitsB = n(hitsB, 'hits_b');
    if (hitsA < 0 || hitsB < 0) throw new Error('NEGATIVE_HITS');
    if (hitsA === 0 || hitsB === 0) return 0;
    if (mode === 'ky_ruoi') return (hitsA + hitsB) / 2;
    throw new Error('UNVERIFIED_DAT_MODE:' + mode);
  }

  function category(input) {
    const xac = n(input.xac, 'xac');
    const ratio = n(input.commission_ratio, 'commission_ratio');
    const hitUnits = n(input.hit_units, 'hit_units');
    const winRate = n(input.win_rate, 'win_rate');
    if (xac < 0 || ratio < 0 || ratio > 1 || hitUnits < 0 || winRate < 0) throw new Error('INVALID_CATEGORY_VALUES');
    return {
      code: String(input.code || ''), xac,
      commission_ratio: ratio,
      hit_units: hitUnits,
      win_rate: winRate,
      qua_co: xac * ratio,
      payout: hitUnits * winRate
    };
  }

  function settle(inputs, options) {
    const rows = (inputs || []).map(category);
    const partnerRole = role(options && options.partner_role);
    const totalPercent = n(options && options.total_percent == null ? 100 : options.total_percent, 'total_percent');
    const refundPercent = n(options && options.refund_percent == null ? 0 : options.refund_percent, 'refund_percent');
    if (totalPercent < 0 || totalPercent > 100 || refundPercent < 0 || refundPercent > 100) throw new Error('INVALID_PERCENT');

    const totalXac = rows.reduce((s, r) => s + r.xac, 0);
    const totalQuaCo = rows.reduce((s, r) => s + r.qua_co, 0);
    const totalPayout = rows.reduce((s, r) => s + r.payout, 0);
    const gross = partnerRole === 'customer' ? totalQuaCo - totalPayout : totalPayout - totalQuaCo;
    const proportional = gross * totalPercent / 100;
    const refundEligible = (partnerRole === 'customer' && proportional > 0) || (partnerRole === 'owner' && proportional < 0);
    const refundAmount = refundEligible ? Math.abs(proportional) * refundPercent / 100 : 0;
    const finalNet = proportional > 0 ? proportional - refundAmount : proportional < 0 ? proportional + refundAmount : 0;

    return {
      rows,
      total_xac: totalXac,
      total_qua_co: totalQuaCo,
      total_payout: totalPayout,
      gross_net: gross,
      total_percent: totalPercent,
      refund_percent: refundPercent,
      refund_amount: refundAmount,
      final_net: finalNet,
      direction: finalNet > ZERO ? 'THU' : finalNet < ZERO ? 'BU' : 'HOA'
    };
  }

  function display1(value) {
    const rounded = Math.round((Number(value) + Number.EPSILON) * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }

  global.KTS_SETTLEMENT_ENGINE = Object.freeze({
    version: 'settlement-v0',
    datHitUnits,
    category,
    settle,
    display1
  });
})(typeof window !== 'undefined' ? window : globalThis);
