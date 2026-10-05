(function (global) {
  'use strict';

  const ZERO = 0;
  const HUNDRED = 100;

  const HIT_MODES = Object.freeze({
    ONE_TIME: 'one_time',
    KY_RUOI: 'ky_ruoi',
    MULTI_PAIR: 'multi_pair'
  });

  const COMMISSION_TYPES = Object.freeze({
    RATIO: 'ratio',
    AMOUNT: 'amount',
    DIRECT: 'direct'
  });

  const MN_MT_XAC_UNITS = Object.freeze({
    '2CB': 18,
    '2CD': 2,
    '2CB7': 7,
    'DAT': 36,
    'DAX': 72,
    '3CB': 17,
    '3CB7': 7,
    '3CXC': 2,
    '4C': 16
  });

  const MB_XIEN = Object.freeze({
    2: Object.freeze({ code: 'MB_XIEN2', xac_per_ticket: 1 }),
    3: Object.freeze({ code: 'MB_XIEN3', xac_per_ticket: 1 }),
    4: Object.freeze({ code: 'MB_XIEN4', xac_per_ticket: 1 })
  });

  const MN_MT_SELECTORS = Object.freeze({
    '2CB': Object.freeze(['G8:*', 'G7:*', 'G6:*', 'G5:*', 'G4:*', 'G3:*', 'G2:*', 'G1:*', 'DB:*']),
    '2CD': Object.freeze(['G8:0', 'DB:0']),
    '2CB7': Object.freeze(['G8:0', 'G7:0', 'G6:0', 'G6:1', 'G6:2', 'G5:0', 'DB:0']),
    '3CB': Object.freeze(['G7:*', 'G6:*', 'G5:*', 'G4:*', 'G3:*', 'G2:*', 'G1:*', 'DB:*']),
    '3CB7': Object.freeze(['G7:0', 'G6:0', 'G6:1', 'G6:2', 'G5:0', 'G4:0', 'DB:0']),
    '3CXC': Object.freeze(['G7:0', 'DB:0']),
    '4C': Object.freeze(['G6:*', 'G5:*', 'G4:*', 'G3:*', 'G2:*', 'G1:*', 'DB:*'])
  });

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

  function normalizeMode(mode) {
    const m = String(mode || '').toLowerCase();
    if (!Object.values(HIT_MODES).includes(m)) throw new Error('INVALID_HIT_MODE:' + mode);
    return m;
  }

  function pairHitUnits(hitsA, hitsB, mode) {
    hitsA = n(hitsA, 'hits_a');
    hitsB = n(hitsB, 'hits_b');
    if (hitsA < 0 || hitsB < 0) throw new Error('NEGATIVE_HITS');
    if (hitsA === 0 || hitsB === 0) return 0;

    switch (normalizeMode(mode)) {
      case HIT_MODES.ONE_TIME:
        return 1;
      case HIT_MODES.MULTI_PAIR:
        return Math.min(hitsA, hitsB);
      case HIT_MODES.KY_RUOI:
        return (hitsA + hitsB) / 2;
      default:
        throw new Error('INVALID_HIT_MODE:' + mode);
    }
  }

  function datHitUnits(hitsA, hitsB, mode) {
    return pairHitUnits(hitsA, hitsB, mode);
  }

  function daxPairHitUnits(hitsA, hitsB, mode) {
    return pairHitUnits(hitsA, hitsB, mode);
  }

  function daxHitUnits(pairHits, mode) {
    if (!Array.isArray(pairHits)) throw new Error('DAX_PAIR_HITS_REQUIRED');
    return pairHits.reduce((sum, pair) => {
      if (!Array.isArray(pair) || pair.length !== 2) throw new Error('INVALID_DAX_PAIR_HITS');
      return sum + daxPairHitUnits(pair[0], pair[1], mode);
    }, 0);
  }

  function commissionQuaCo(xac, value, type) {
    const x = n(xac, 'xac');
    const v = n(value, 'commission_value');
    const t = String(type || COMMISSION_TYPES.RATIO).toLowerCase();
    if (x < 0 || v < 0) throw new Error('INVALID_COMMISSION_VALUES');

    if (t === COMMISSION_TYPES.RATIO) {
      if (v > 1) throw new Error('INVALID_COMMISSION_RATIO');
      return x * v;
    }
    if (t === COMMISSION_TYPES.AMOUNT) return x * v / HUNDRED;
    if (t === COMMISSION_TYPES.DIRECT) return x * v;
    throw new Error('INVALID_COMMISSION_TYPE:' + type);
  }

  function category(input) {
    const xac = n(input.xac, 'xac');
    const commissionType = String(input.commission_type || COMMISSION_TYPES.RATIO).toLowerCase();
    const commissionValue = n(
      input.commission_value == null ? input.commission_ratio : input.commission_value,
      'commission_value'
    );
    const hitUnits = n(input.hit_units, 'hit_units');
    const winRate = n(input.win_rate, 'win_rate');
    if (xac < 0 || commissionValue < 0 || hitUnits < 0 || winRate < 0) throw new Error('INVALID_CATEGORY_VALUES');

    return {
      code: String(input.code || ''),
      xac,
      commission_type: commissionType,
      commission_value: commissionValue,
      commission_ratio: commissionType === COMMISSION_TYPES.RATIO ? commissionValue : null,
      hit_units: hitUnits,
      win_rate: winRate,
      qua_co: commissionQuaCo(xac, commissionValue, commissionType),
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
    const proportional = gross * totalPercent / HUNDRED;
    const refundEligible = (partnerRole === 'customer' && proportional > 0) || (partnerRole === 'owner' && proportional < 0);
    const refundAmount = refundEligible ? Math.abs(proportional) * refundPercent / HUNDRED : 0;
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

  function choose2(count) {
    const c = n(count, 'count');
    if (!Number.isInteger(c) || c < 0) throw new Error('INVALID_COUNT');
    return c * (c - 1) / 2;
  }

  function mnMtXacUnits(code, options) {
    const c = String(code || '').toUpperCase();
    const stake = n(options && options.stake == null ? 1 : options.stake, 'stake');
    if (stake < 0) throw new Error('INVALID_STAKE');

    if (c === 'DAT') {
      const numberCount = n(options && options.number_count, 'number_count');
      return choose2(numberCount) * MN_MT_XAC_UNITS.DAT * stake;
    }
    if (c === 'DAX') {
      const numberCount = n(options && options.number_count, 'number_count');
      const stationCount = n(options && options.station_count, 'station_count');
      return choose2(numberCount) * choose2(stationCount) * MN_MT_XAC_UNITS.DAX * stake;
    }

    const unit = MN_MT_XAC_UNITS[c];
    if (unit == null) throw new Error('UNVERIFIED_MN_MT_XAC_CATEGORY:' + c);
    const numberCount = n(options && options.number_count == null ? 1 : options.number_count, 'number_count');
    if (!Number.isInteger(numberCount) || numberCount < 0) throw new Error('INVALID_NUMBER_COUNT');
    return unit * numberCount * stake;
  }

  function mnMtSelectors(code) {
    const c = String(code || '').toUpperCase();
    const selectors = MN_MT_SELECTORS[c];
    if (!selectors) throw new Error('UNVERIFIED_MN_MT_SELECTOR_CATEGORY:' + c);
    return selectors.slice();
  }

  function mbXienCategory(size, stake, hitUnits, commissionValue, winRate) {
    const s = Number(size);
    const cfg = MB_XIEN[s];
    if (!cfg) throw new Error('INVALID_MB_XIEN_SIZE');
    return category({
      code: cfg.code,
      xac: n(stake, 'stake') * cfg.xac_per_ticket,
      commission_type: COMMISSION_TYPES.DIRECT,
      commission_value: n(commissionValue, 'commission_value'),
      hit_units: n(hitUnits, 'hit_units'),
      win_rate: n(winRate, 'win_rate')
    });
  }

  function isUiNeighbor(candidate, winning) {
    const a = n(candidate, 'candidate');
    const b = n(winning, 'winning');
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || a > 99 || b < 0 || b > 99) throw new Error('INVALID_UI_NUMBER');
    return Math.abs(a - b) === 1;
  }

  function display1(value) {
    const rounded = Math.round((Number(value) + Number.EPSILON) * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }

  global.KTS_SETTLEMENT_ENGINE = Object.freeze({
    version: 'settlement-v1-verified-rules',
    HIT_MODES,
    COMMISSION_TYPES,
    MN_MT_XAC_UNITS,
    MN_MT_SELECTORS,
    MB_XIEN,
    pairHitUnits,
    datHitUnits,
    daxPairHitUnits,
    daxHitUnits,
    commissionQuaCo,
    category,
    settle,
    choose2,
    mnMtXacUnits,
    mnMtSelectors,
    mbXienCategory,
    isUiNeighbor,
    display1
  });
})(typeof window !== 'undefined' ? window : globalThis);
