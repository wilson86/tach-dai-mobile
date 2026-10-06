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

  // Money/accounting arithmetic is decimal-exact. Public numeric fields are kept
  // for existing UI compatibility; exact decimal strings travel beside them.
  function decNormalize(d) {
    let i = BigInt(d.i), s = Number(d.s || 0);
    if (!Number.isInteger(s) || s < 0) throw new Error('DECIMAL_SCALE_INVALID');
    if (i === 0n) return { i: 0n, s: 0 };
    while (s > 0 && i % 10n === 0n) { i /= 10n; s -= 1; }
    return { i, s };
  }
  function dec(v, name) {
    if (v && typeof v === 'object' && typeof v.i === 'bigint' && Number.isInteger(v.s)) return decNormalize(v);
    if (typeof v === 'number' && !Number.isFinite(v)) throw new Error((name || 'value') + '_INVALID');
    const text = String(v == null ? '' : v).trim();
    const m = text.match(/^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/);
    if (!m) throw new Error((name || 'value') + '_INVALID');
    const sign = m[1] === '-' ? -1n : 1n;
    const frac = m[3] || '';
    const exp = m[4] == null ? 0 : Number(m[4]);
    if (!Number.isInteger(exp) || Math.abs(exp) > 1000) throw new Error((name || 'value') + '_INVALID');
    let digits = (m[2] + frac).replace(/^0+(?=\d)/, '') || '0';
    let scale = frac.length - exp;
    if (scale < 0) { digits += '0'.repeat(-scale); scale = 0; }
    return decNormalize({ i: sign * BigInt(digits), s: scale });
  }
  function decPow10(power) { return 10n ** BigInt(power); }
  function decAlign(a, b) {
    a = dec(a); b = dec(b);
    const s = Math.max(a.s, b.s);
    return {
      a: a.i * decPow10(s - a.s),
      b: b.i * decPow10(s - b.s),
      s
    };
  }
  function decAdd(a, b) { const x = decAlign(a, b); return decNormalize({ i: x.a + x.b, s: x.s }); }
  function decSub(a, b) { const x = decAlign(a, b); return decNormalize({ i: x.a - x.b, s: x.s }); }
  function decMul(a, b) { a = dec(a); b = dec(b); return decNormalize({ i: a.i * b.i, s: a.s + b.s }); }
  function decDiv100(a) { a = dec(a); return decNormalize({ i: a.i, s: a.s + 2 }); }
  function decAbs(a) { a = dec(a); return { i: a.i < 0n ? -a.i : a.i, s: a.s }; }
  function decCmp(a, b) { const x = decAlign(a, b); return x.a < x.b ? -1 : x.a > x.b ? 1 : 0; }
  function decString(a) {
    a = dec(a);
    const neg = a.i < 0n;
    let digits = (neg ? -a.i : a.i).toString();
    if (a.s === 0) return (neg ? '-' : '') + digits;
    if (digits.length <= a.s) digits = '0'.repeat(a.s - digits.length + 1) + digits;
    const cut = digits.length - a.s;
    return (neg ? '-' : '') + digits.slice(0, cut) + '.' + digits.slice(cut);
  }
  function decNumber(a) { return Number(decString(a)); }
  function decimalCanonical(v) { return decString(dec(v)); }
  function decSum(values) { return (values || []).reduce((sum, value) => decAdd(sum, value), dec(0)); }

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

  function datHitUnits(hitsA, hitsB, mode) { return pairHitUnits(hitsA, hitsB, mode); }
  function daxPairHitUnits(hitsA, hitsB, mode) { return pairHitUnits(hitsA, hitsB, mode); }
  function daxHitUnits(pairHits, mode) {
    if (!Array.isArray(pairHits)) throw new Error('DAX_PAIR_HITS_REQUIRED');
    return pairHits.reduce((sum, pair) => {
      if (!Array.isArray(pair) || pair.length !== 2) throw new Error('INVALID_DAX_PAIR_HITS');
      return sum + daxPairHitUnits(pair[0], pair[1], mode);
    }, 0);
  }

  function commissionQuaCoDecimal(xac, value, type) {
    const x = dec(xac, 'xac');
    const v = dec(value, 'commission_value');
    const t = String(type || COMMISSION_TYPES.RATIO).toLowerCase();
    if (x.i < 0n || v.i < 0n) throw new Error('INVALID_COMMISSION_VALUES');
    if (t === COMMISSION_TYPES.RATIO) {
      if (decCmp(v, 1) > 0) throw new Error('INVALID_COMMISSION_RATIO');
      return decMul(x, v);
    }
    if (t === COMMISSION_TYPES.AMOUNT) return decDiv100(decMul(x, v));
    if (t === COMMISSION_TYPES.DIRECT) return decMul(x, v);
    throw new Error('INVALID_COMMISSION_TYPE:' + type);
  }
  function commissionQuaCo(xac, value, type) { return decNumber(commissionQuaCoDecimal(xac, value, type)); }

  function category(input) {
    const xacD = dec(input.xac, 'xac');
    const commissionType = String(input.commission_type || COMMISSION_TYPES.RATIO).toLowerCase();
    const commissionD = dec(input.commission_value == null ? input.commission_ratio : input.commission_value, 'commission_value');
    const hitD = dec(input.hit_units, 'hit_units');
    const winD = dec(input.win_rate, 'win_rate');
    if ([xacD, commissionD, hitD, winD].some(v => v.i < 0n)) throw new Error('INVALID_CATEGORY_VALUES');
    const quaD = commissionQuaCoDecimal(xacD, commissionD, commissionType);
    const payoutD = decMul(hitD, winD);
    const exact = Object.freeze({
      xac: decString(xacD),
      commission_value: decString(commissionD),
      hit_units: decString(hitD),
      win_rate: decString(winD),
      qua_co: decString(quaD),
      payout: decString(payoutD)
    });
    return {
      code: String(input.code || ''),
      xac: decNumber(xacD),
      commission_type: commissionType,
      commission_value: decNumber(commissionD),
      commission_ratio: commissionType === COMMISSION_TYPES.RATIO ? decNumber(commissionD) : null,
      hit_units: decNumber(hitD),
      win_rate: decNumber(winD),
      qua_co: decNumber(quaD),
      payout: decNumber(payoutD),
      exact
    };
  }

  function settle(inputs, options) {
    const rows = (inputs || []).map(category);
    const partnerRole = role(options && options.partner_role);
    const totalPercentD = dec(options && options.total_percent == null ? 100 : options.total_percent, 'total_percent');
    const refundPercentD = dec(options && options.refund_percent == null ? 0 : options.refund_percent, 'refund_percent');
    if (totalPercentD.i < 0n || decCmp(totalPercentD, 100) > 0 || refundPercentD.i < 0n || decCmp(refundPercentD, 100) > 0) throw new Error('INVALID_PERCENT');

    const totalXacD = decSum(rows.map(r => r.exact.xac));
    const totalQuaCoD = decSum(rows.map(r => r.exact.qua_co));
    const totalPayoutD = decSum(rows.map(r => r.exact.payout));
    const grossD = partnerRole === 'customer' ? decSub(totalQuaCoD, totalPayoutD) : decSub(totalPayoutD, totalQuaCoD);
    const proportionalD = decDiv100(decMul(grossD, totalPercentD));
    const refundEligible = (partnerRole === 'customer' && proportionalD.i > 0n) || (partnerRole === 'owner' && proportionalD.i < 0n);
    const refundD = refundEligible ? decDiv100(decMul(decAbs(proportionalD), refundPercentD)) : dec(0);
    const finalD = proportionalD.i > 0n ? decSub(proportionalD, refundD) : proportionalD.i < 0n ? decAdd(proportionalD, refundD) : dec(0);
    const exact = Object.freeze({
      total_xac: decString(totalXacD),
      total_qua_co: decString(totalQuaCoD),
      total_payout: decString(totalPayoutD),
      gross_net: decString(grossD),
      total_percent: decString(totalPercentD),
      refund_percent: decString(refundPercentD),
      refund_amount: decString(refundD),
      final_net: decString(finalD)
    });

    return {
      rows,
      total_xac: decNumber(totalXacD),
      total_qua_co: decNumber(totalQuaCoD),
      total_payout: decNumber(totalPayoutD),
      gross_net: decNumber(grossD),
      total_percent: decNumber(totalPercentD),
      refund_percent: decNumber(refundPercentD),
      refund_amount: decNumber(refundD),
      final_net: decNumber(finalD),
      direction: finalD.i > 0n ? 'THU' : finalD.i < 0n ? 'BU' : 'HOA',
      exact
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
      xac: decNumber(decMul(dec(stake, 'stake'), dec(cfg.xac_per_ticket))),
      commission_type: COMMISSION_TYPES.DIRECT,
      commission_value: commissionValue,
      hit_units: hitUnits,
      win_rate: winRate
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
    version: 'settlement-v2-exact-decimal-accounting',
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
    display1,
    decimalCanonical
  });
})(typeof window !== 'undefined' ? window : globalThis);
