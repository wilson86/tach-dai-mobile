(function (global) {
  'use strict';

  const STATUS = Object.freeze({
    EXACT: 'MATCH_EXACT',
    DISPLAY: 'MATCH_DISPLAY_ONLY',
    MISMATCH: 'MISMATCH',
    BLOCKED: 'BLOCKED',
    PROVISIONAL: 'PROVISIONAL',
    UNVERIFIED: 'UNVERIFIED'
  });

  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
  function validDate(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')); }

  function comparisonStatus(settlement) {
    if (!settlement || typeof settlement !== 'object') return STATUS.UNVERIFIED;
    const scope = String(settlement.scope_status || '').toLowerCase();
    if (scope === 'blocked') return STATUS.BLOCKED;
    if (scope === 'provisional') return STATUS.PROVISIONAL;

    const direct = String(settlement.comparison_status || '').toUpperCase();
    const nested = String(
      settlement.reference_app_snapshot &&
      settlement.reference_app_snapshot.comparison &&
      settlement.reference_app_snapshot.comparison.status || ''
    ).toUpperCase();
    const status = direct || nested;
    if (status === STATUS.EXACT) return STATUS.EXACT;
    if (status === STATUS.DISPLAY) return STATUS.DISPLAY;
    if (status === STATUS.MISMATCH) return STATUS.MISMATCH;
    return STATUS.UNVERIFIED;
  }

  function scopeKey(s) {
    return [String(s.partner_id || ''), String(s.business_date || ''), String(s.region || '').toLowerCase()].join(':');
  }

  function inRange(date, fromDate, toDate) {
    if (!validDate(date)) return false;
    if (fromDate && date < fromDate) return false;
    if (toDate && date > toDate) return false;
    return true;
  }

  function normalizeOptions(options) {
    const o = options || {};
    const fromDate = o.from_date ? String(o.from_date).slice(0, 10) : '';
    const toDate = o.to_date ? String(o.to_date).slice(0, 10) : '';
    if (fromDate && !validDate(fromDate)) throw new Error('INVALID_OBSERVATION_FROM_DATE');
    if (toDate && !validDate(toDate)) throw new Error('INVALID_OBSERVATION_TO_DATE');
    if (fromDate && toDate && fromDate > toDate) throw new Error('INVALID_OBSERVATION_DATE_RANGE');
    const requiredDays = Number(o.required_observation_days == null || o.required_observation_days === '' ? 0 : o.required_observation_days);
    if (!Number.isInteger(requiredDays) || requiredDays < 0 || requiredDays > 3650) throw new Error('INVALID_REQUIRED_OBSERVATION_DAYS');
    const regions = Array.isArray(o.regions) ? o.regions.map(x => String(x).toLowerCase()).filter(Boolean) : [];
    return {
      from_date: fromDate,
      to_date: toDate,
      partner_id: o.partner_id ? String(o.partner_id) : '',
      regions,
      required_observation_days: requiredDays
    };
  }

  function buildObservation(settlements, options) {
    const o = normalizeOptions(options);
    const rows = (Array.isArray(settlements) ? settlements : [])
      .filter(s => s && s.partner_id && validDate(s.business_date) && s.region)
      .filter(s => inRange(String(s.business_date), o.from_date, o.to_date))
      .filter(s => !o.partner_id || String(s.partner_id) === o.partner_id)
      .filter(s => !o.regions.length || o.regions.includes(String(s.region).toLowerCase()))
      .map(s => ({
        id: s.id || scopeKey(s),
        partner_id: String(s.partner_id),
        business_date: String(s.business_date),
        region: String(s.region).toLowerCase(),
        scope_status: String(s.scope_status || ''),
        comparison_status: comparisonStatus(s),
        final_net: Number(s.settlement_result && s.settlement_result.final_net != null ? s.settlement_result.final_net : 0)
      }))
      .sort((a, b) => a.business_date.localeCompare(b.business_date) || a.partner_id.localeCompare(b.partner_id) || a.region.localeCompare(b.region));

    const counts = {
      total: rows.length,
      exact: 0,
      display_only: 0,
      mismatch: 0,
      blocked: 0,
      provisional: 0,
      unverified: 0
    };
    for (const row of rows) {
      if (row.comparison_status === STATUS.EXACT) counts.exact += 1;
      else if (row.comparison_status === STATUS.DISPLAY) counts.display_only += 1;
      else if (row.comparison_status === STATUS.MISMATCH) counts.mismatch += 1;
      else if (row.comparison_status === STATUS.BLOCKED) counts.blocked += 1;
      else if (row.comparison_status === STATUS.PROVISIONAL) counts.provisional += 1;
      else counts.unverified += 1;
    }

    const byDateMap = new Map();
    for (const row of rows) {
      if (!byDateMap.has(row.business_date)) byDateMap.set(row.business_date, []);
      byDateMap.get(row.business_date).push(row);
    }
    const dates = [...byDateMap.entries()].map(([businessDate, dateRows]) => {
      const exact = dateRows.every(r => r.comparison_status === STATUS.EXACT);
      const hasMismatch = dateRows.some(r => [STATUS.DISPLAY, STATUS.MISMATCH].includes(r.comparison_status));
      const hasBlocked = dateRows.some(r => [STATUS.BLOCKED, STATUS.PROVISIONAL, STATUS.UNVERIFIED].includes(r.comparison_status));
      return {
        business_date: businessDate,
        scopes: dateRows.length,
        exact,
        status: exact ? STATUS.EXACT : hasMismatch ? STATUS.MISMATCH : hasBlocked ? STATUS.UNVERIFIED : STATUS.UNVERIFIED
      };
    });

    const exactDays = dates.filter(x => x.exact).length;
    const allExact = counts.total > 0 && counts.exact === counts.total;
    const durationConfigured = o.required_observation_days > 0;
    const durationMet = durationConfigured && exactDays >= o.required_observation_days;
    const blockers = [];
    if (!counts.total) blockers.push('NO_SHADOW_SCOPES');
    if (counts.mismatch) blockers.push(`MISMATCH:${counts.mismatch}`);
    if (counts.display_only) blockers.push(`DISPLAY_ONLY:${counts.display_only}`);
    if (counts.blocked) blockers.push(`BLOCKED:${counts.blocked}`);
    if (counts.provisional) blockers.push(`PROVISIONAL:${counts.provisional}`);
    if (counts.unverified) blockers.push(`UNVERIFIED:${counts.unverified}`);
    if (!durationConfigured) blockers.push('OBSERVATION_DURATION_NOT_CONFIGURED');
    else if (!durationMet) blockers.push(`OBSERVATION_DAYS:${exactDays}/${o.required_observation_days}`);

    return {
      version: 'settlement-observation-v1',
      options: clone(o),
      counts,
      exact_days: exactDays,
      observed_days: dates.length,
      all_scopes_exact: allExact,
      zero_money_mismatch: counts.mismatch === 0 && counts.display_only === 0,
      duration_gate_configured: durationConfigured,
      duration_gate_met: durationMet,
      promotion_ready: allExact && durationMet,
      blockers,
      dates,
      scopes: rows
    };
  }

  global.KTS_SETTLEMENT_OBSERVATION = Object.freeze({
    version: 'settlement-observation-v1',
    STATUS,
    comparisonStatus,
    buildObservation
  });
})(typeof window !== 'undefined' ? window : globalThis);
