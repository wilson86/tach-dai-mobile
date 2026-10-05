(function (global) {
  'use strict';

  const FIELD_ALIASES = Object.freeze({
    total_xac: ['total_xac', 'xac'],
    total_qua_co: ['total_qua_co', 'qua_co'],
    total_payout: ['total_payout', 'payout', 'tien_trung'],
    refund_amount: ['refund_amount', 'refund', 'hoi'],
    final_net: ['final_net', 'final', 'thu_bu']
  });

  function numeric(value) {
    if (value == null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function pick(obj, aliases) {
    for (const key of aliases) {
      if (obj && Object.prototype.hasOwnProperty.call(obj, key)) {
        const n = numeric(obj[key]);
        if (n != null) return n;
      }
    }
    return null;
  }

  function roundDisplay(value, digits) {
    const factor = 10 ** digits;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    const scaled = Math.abs(n) * factor;
    const rounded = Math.floor(scaled + 0.5 + Number.EPSILON);
    return Math.sign(n) * rounded / factor;
  }

  function compareNumber(localValue, referenceValue, options) {
    const opts = options || {};
    const tolerance = Number(opts.tolerance == null ? 1e-8 : opts.tolerance);
    const digits = Number(opts.display_digits == null ? 1 : opts.display_digits);
    const local = numeric(localValue);
    const reference = numeric(referenceValue);
    if (local == null || reference == null) return { status: 'NOT_COMPARABLE', local, reference, delta: null };
    const delta = local - reference;
    if (Math.abs(delta) <= tolerance) return { status: 'MATCH_EXACT', local, reference, delta };
    if (roundDisplay(local, digits) === roundDisplay(reference, digits)) return { status: 'MATCH_DISPLAY', local, reference, delta };
    return { status: 'MISMATCH', local, reference, delta };
  }

  function rowsByCode(rows) {
    const out = {};
    for (const row of (Array.isArray(rows) ? rows : [])) {
      const code = String(row.code || row.category || '').toUpperCase();
      if (!code) continue;
      if (!out[code]) out[code] = { code, xac: 0, qua_co: 0, hit_units: 0, payout: 0 };
      for (const field of ['xac', 'qua_co', 'hit_units', 'payout']) out[code][field] += numeric(row[field]) || 0;
    }
    return out;
  }

  function compareCategories(localRows, referenceRows, options) {
    const local = rowsByCode(localRows);
    const reference = rowsByCode(referenceRows);
    const codes = [...new Set([...Object.keys(local), ...Object.keys(reference)])].sort();
    return codes.map(code => {
      const a = local[code] || {};
      const b = reference[code] || {};
      const fields = {};
      for (const field of ['xac', 'qua_co', 'hit_units', 'payout']) {
        if (numeric(b[field]) == null) continue;
        fields[field] = compareNumber(a[field] || 0, b[field], options);
      }
      const statuses = Object.values(fields).map(x => x.status);
      const status = statuses.includes('MISMATCH') ? 'MISMATCH' : statuses.includes('MATCH_DISPLAY') ? 'MATCH_DISPLAY' : statuses.length ? 'MATCH_EXACT' : 'NOT_COMPARABLE';
      return { code, status, fields };
    });
  }

  function compareSettlement(localSettlement, referenceSnapshot, options) {
    const local = localSettlement && (localSettlement.settlement_result || localSettlement.result_snapshot || localSettlement) || {};
    const reference = referenceSnapshot && (referenceSnapshot.totals || referenceSnapshot) || {};
    const totals = {};
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      const refValue = pick(reference, aliases);
      if (refValue == null) continue;
      totals[field] = compareNumber(local[field], refValue, options);
    }

    const localRows = localSettlement && Array.isArray(localSettlement.category_rows) ? localSettlement.category_rows : local.rows;
    const referenceRows = referenceSnapshot && (referenceSnapshot.categories || referenceSnapshot.category_rows);
    const categories = Array.isArray(referenceRows) ? compareCategories(localRows, referenceRows, options) : [];
    const statuses = [...Object.values(totals).map(x => x.status), ...categories.map(x => x.status)].filter(x => x !== 'NOT_COMPARABLE');
    let status = 'INCOMPLETE_REFERENCE';
    if (statuses.length) {
      if (statuses.includes('MISMATCH')) status = 'MISMATCH';
      else if (statuses.includes('MATCH_DISPLAY')) status = 'MATCH_DISPLAY_ONLY';
      else status = 'MATCH_EXACT';
    }
    return {
      status,
      totals,
      categories,
      compared_fields: statuses.length,
      exact: status === 'MATCH_EXACT',
      safe_to_promote: status === 'MATCH_EXACT'
    };
  }

  global.KTS_SETTLEMENT_SHADOW = Object.freeze({
    version: 'settlement-shadow-v1',
    roundDisplay,
    compareNumber,
    compareCategories,
    compareSettlement
  });
})(typeof window !== 'undefined' ? window : globalThis);
