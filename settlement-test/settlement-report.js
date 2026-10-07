(function (global) {
  'use strict';

  function num(v) {
    const x = Number(v == null ? 0 : v);
    return Number.isFinite(x) ? x : 0;
  }

  const CATEGORY_LABELS = Object.freeze({
    '2CB':'2C lô','2CD':'2C ĐĐ','2CB7':'2C 7 lô','2CB8':'2C 8 lô',
    'DAT':'Đá thẳng','DAX':'Đá xiên','3CB':'3C lô','3CB7':'3C 7 lô','3CDD':'3C ĐĐ / XC','4C':'4C',
    'MB_XIEN2':'Xiên 2','MB_XIEN3':'Xiên 3','MB_XIEN4':'Xiên 4','UI':'Ủi'
  });

  function categoryLabel(code) { return CATEGORY_LABELS[String(code || '').toUpperCase()] || String(code || 'UNKNOWN'); }

  function addCategory(target, row) {
    const code = String(row.code || row.category || 'UNKNOWN').toUpperCase();
    if (!target[code]) {
      target[code] = { code, label: categoryLabel(code), xac: 0, qua_co: 0, hit_units: 0, payout: 0, message_count: 0 };
    }
    const out = target[code];
    out.xac += num(row.xac);
    out.qua_co += num(row.qua_co);
    out.hit_units += num(row.hit_units);
    out.payout += num(row.payout);
    out.message_count += 1;
  }

  function settlementCategories(settlement) {
    const explicit = Array.isArray(settlement.category_rows) ? settlement.category_rows : [];
    if (explicit.length) return explicit;
    const result = settlement.settlement_result || settlement.result_snapshot || {};
    return Array.isArray(result.rows) ? result.rows : [];
  }

  function messageIds(settlement) {
    if (Array.isArray(settlement.message_ids) && settlement.message_ids.length) return settlement.message_ids.slice();
    return settlement.message_id ? [settlement.message_id] : [];
  }

  function messageBreakdown(settlement, id) {
    const rows = Array.isArray(settlement.message_breakdown) ? settlement.message_breakdown : [];
    const found = rows.find(x => x.message_id === id);
    return found && Array.isArray(found.category_rows) ? found.category_rows.map(x => Object.assign({}, x)) : [];
  }

  function kqxsVerificationStatus(settlement) {
    const snapshot = settlement && settlement.lottery_result_snapshot || null;
    if (!snapshot) return 'unverified';
    const status = String(snapshot.verification_status || '').toLowerCase();
    if (status === 'conflict') return 'conflict';
    const sources = Array.isArray(snapshot.verification_sources)
      ? new Set(snapshot.verification_sources.map(x => String(x || '').trim()).filter(Boolean))
      : new Set();
    const conflicts = Array.isArray(snapshot.verification_conflicts) ? snapshot.verification_conflicts : [];
    const expected = Array.isArray(snapshot.expected_station_codes)
      ? snapshot.expected_station_codes.map(x => String(x || '').trim().toLowerCase()).filter(Boolean)
      : [];
    const actual = Array.isArray(snapshot.stations)
      ? snapshot.stations.map(row => String(row && row.code || '').trim().toLowerCase()).filter(Boolean)
      : [];
    const coverageValid =
      expected.length > 0 &&
      new Set(expected).size === expected.length &&
      new Set(actual).size === actual.length &&
      actual.length === expected.length &&
      expected.every(code => actual.includes(code));
    const claimedVerified = snapshot.verified === true || status === 'verified';
    if (claimedVerified && snapshot.complete === true && sources.size >= 2 && conflicts.length === 0 && coverageValid) return 'verified';
    return 'unverified';
  }

  function shadowStatusFromSettlements(settlements) {
    const statuses = (settlements || []).map(s => String(s.comparison_status || 'unverified').toUpperCase());
    if (!statuses.length) return 'NO_DATA';
    if (statuses.some(x => x === 'BLOCKED')) return 'BLOCKED';
    if (statuses.some(x => x === 'MISMATCH')) return 'MISMATCH';
    if (statuses.some(x => x === 'MATCH_DISPLAY_ONLY')) return 'MATCH_DISPLAY_ONLY';
    if (statuses.some(x => x === 'INCOMPLETE_REFERENCE')) return 'INCOMPLETE_REFERENCE';
    if (statuses.every(x => x === 'MATCH_EXACT')) return 'MATCH_EXACT';
    return 'UNVERIFIED';
  }

  function zeroTotals() {
    return { xac: 0, qua_co: 0, payout: 0, refund_amount: 0, final_net: 0, direction: 'HOA' };
  }

  function addTotals(target, source) {
    target.xac += num(source && source.xac);
    target.qua_co += num(source && source.qua_co);
    target.payout += num(source && source.payout);
    target.refund_amount += num(source && source.refund_amount);
    target.final_net += num(source && source.final_net);
    target.direction = target.final_net > 0 ? 'THU' : target.final_net < 0 ? 'BU' : 'HOA';
    return target;
  }

  function buildDailyPartnerReport(input) {
    const partner = input && input.partner ? input.partner : {};
    const businessDate = String(input && input.business_date || '');
    const settlements = Array.isArray(input && input.settlements) ? input.settlements : [];
    const messagesById = input && input.messages_by_id ? input.messages_by_id : {};

    const byRegion = {};
    const allCategories = {};
    const messageReports = [];
    const blockedScopes = [];
    const partnerSettlements = [];
    let totalXac = 0;
    let totalQuaCo = 0;
    let totalPayout = 0;
    let finalNet = 0;
    let refundAmount = 0;

    for (const settlement of settlements) {
      if (businessDate && settlement.business_date !== businessDate) continue;
      if (partner.id && settlement.partner_id !== partner.id) continue;
      const settlementScopeStatus = String(settlement.scope_status || '').toLowerCase();
      // An empty scope means every message in that scope was cancelled/removed from calculation.
      // Keep the durable settlement for audit, but do not let it create a ghost partner/region
      // in money reports or end-of-day close gates.
      if (settlementScopeStatus === 'empty') continue;
      partnerSettlements.push(settlement);

      const region = String(settlement.region || 'unknown').toLowerCase();
      if (!byRegion[region]) {
        byRegion[region] = {
          region, categories: {}, total_xac: 0, total_qua_co: 0, total_payout: 0,
          refund_amount: 0, final_net: 0, messages: [], scope_statuses: [], kqxs_statuses: [], settlements: []
        };
      }
      const regionReport = byRegion[region];
      regionReport.settlements.push(settlement);
      const result = settlement.settlement_result || settlement.result_snapshot || {};
      const categories = settlementCategories(settlement);
      const scopeStatus = settlement.scope_status || settlement.comparison_status || 'unverified';
      regionReport.scope_statuses.push(scopeStatus);
      regionReport.kqxs_statuses.push(kqxsVerificationStatus(settlement));

      if (scopeStatus === 'blocked' || settlement.comparison_status === 'blocked') {
        blockedScopes.push({
          settlement_id: settlement.id,
          region,
          reasons: Array.isArray(settlement.blocked_reasons) ? settlement.blocked_reasons.slice() : [],
          message_ids: messageIds(settlement)
        });
      }

      for (const row of categories) {
        addCategory(regionReport.categories, row);
        addCategory(allCategories, row);
      }

      regionReport.total_xac += num(result.total_xac);
      regionReport.total_qua_co += num(result.total_qua_co);
      regionReport.total_payout += num(result.total_payout);
      regionReport.refund_amount += num(result.refund_amount);
      regionReport.final_net += num(result.final_net);

      totalXac += num(result.total_xac);
      totalQuaCo += num(result.total_qua_co);
      totalPayout += num(result.total_payout);
      refundAmount += num(result.refund_amount);
      finalNet += num(result.final_net);

      const ids = messageIds(settlement);
      const detailRows = Array.isArray(settlement.detail_rows) ? settlement.detail_rows : [];
      for (const id of ids) {
        const msg = messagesById[id] || null;
        const messageReport = {
          settlement_id: settlement.id,
          message_id: id,
          region,
          raw_text: msg ? String(msg.raw_text || '') : '',
          message_status: msg ? String(msg.status || '') : '',
          categories: messageBreakdown(settlement, id),
          detail_rows: detailRows.filter(x => !x.message_id || x.message_id === id).map(x => Object.assign({}, x)),
          result: Object.assign({}, result),
          scope_status: scopeStatus,
          comparison_status: settlement.comparison_status || 'unverified'
        };
        regionReport.messages.push(messageReport);
        messageReports.push(messageReport);
      }
    }

    function finalizeRegion(regionReport) {
      regionReport.categories = Object.values(regionReport.categories)
        .filter(x => x.xac !== 0 || x.qua_co !== 0 || x.hit_units !== 0 || x.payout !== 0)
        .sort((a, b) => a.code.localeCompare(b.code));
      regionReport.direction = regionReport.final_net > 0 ? 'THU' : regionReport.final_net < 0 ? 'BU' : 'HOA';
      regionReport.blocked = regionReport.scope_statuses.includes('blocked');
      regionReport.provisional = regionReport.scope_statuses.includes('provisional');
      regionReport.shadow_status = shadowStatusFromSettlements(regionReport.settlements);
      regionReport.kqxs_conflict = regionReport.kqxs_statuses.includes('conflict');
      regionReport.kqxs_verified = regionReport.kqxs_statuses.length > 0 && regionReport.kqxs_statuses.every(x => x === 'verified');
      regionReport.kqxs_verification_status = regionReport.kqxs_conflict ? 'conflict' : regionReport.kqxs_verified ? 'verified' : 'unverified';
      delete regionReport.kqxs_statuses;
      delete regionReport.settlements;
      return regionReport;
    }

    const regions = Object.values(byRegion).map(finalizeRegion).sort((a,b) => ['mn','mt','mb'].indexOf(a.region) - ['mn','mt','mb'].indexOf(b.region));
    const categories = Object.values(allCategories)
      .filter(x => x.xac !== 0 || x.qua_co !== 0 || x.hit_units !== 0 || x.payout !== 0)
      .sort((a, b) => a.code.localeCompare(b.code));

    return {
      partner: Object.assign({}, partner),
      business_date: businessDate,
      regions,
      categories,
      messages: messageReports,
      blocked_scopes: blockedScopes,
      provisional: regions.some(x => x.provisional),
      blocked: blockedScopes.length > 0,
      shadow_status: shadowStatusFromSettlements(partnerSettlements),
      kqxs_conflict: regions.some(x => x.kqxs_conflict),
      kqxs_verified: regions.length > 0 && regions.every(x => x.kqxs_verified),
      totals: {
        xac: totalXac,
        qua_co: totalQuaCo,
        payout: totalPayout,
        refund_amount: refundAmount,
        final_net: finalNet,
        direction: finalNet > 0 ? 'THU' : finalNet < 0 ? 'BU' : 'HOA'
      }
    };
  }

  function buildDailyOperationsReport(input) {
    const businessDate = String(input && input.business_date || '');
    const partners = Array.isArray(input && input.partners) ? input.partners : [];
    const settlements = Array.isArray(input && input.settlements) ? input.settlements : [];
    const messages = Array.isArray(input && input.messages) ? input.messages : [];
    const messagesById = input && input.messages_by_id ? input.messages_by_id : Object.fromEntries(messages.map(m => [m.id, m]));
    const partnerMap = Object.fromEntries(partners.map(p => [p.id, p]));
    const ids = new Set();
    settlements.filter(s => !businessDate || s.business_date === businessDate).forEach(s => ids.add(s.partner_id));
    messages.filter(m => !businessDate || m.business_date === businessDate).forEach(m => ids.add(m.partner_id));

    const rows = [];
    const totals = zeroTotals();
    const exactTotals = zeroTotals();
    const counts = { partners: 0, exact: 0, unverified: 0, mismatch: 0, display_only: 0, blocked: 0, provisional: 0 };

    for (const id of ids) {
      const partner = partnerMap[id] || { id, name: id, role: 'unknown' };
      const report = buildDailyPartnerReport({ partner, business_date: businessDate, settlements, messages_by_id: messagesById });
      if (!report.messages.length && !report.regions.length) continue;
      rows.push(report);
      counts.partners += 1;
      addTotals(totals, report.totals);
      if (report.blocked) counts.blocked += 1;
      if (report.provisional) counts.provisional += 1;
      if (report.shadow_status === 'MATCH_EXACT' && !report.blocked && !report.provisional) {
        counts.exact += 1;
        addTotals(exactTotals, report.totals);
      } else if (report.shadow_status === 'MISMATCH') counts.mismatch += 1;
      else if (report.shadow_status === 'MATCH_DISPLAY_ONLY') counts.display_only += 1;
      else counts.unverified += 1;
    }

    rows.sort((a,b) => String(a.partner.name || '').localeCompare(String(b.partner.name || ''), 'vi'));
    let status = 'EMPTY';
    if (rows.length) {
      if (counts.blocked) status = 'BLOCKED';
      else if (counts.mismatch) status = 'MISMATCH';
      else if (counts.provisional) status = 'PROVISIONAL';
      else if (counts.display_only) status = 'MATCH_DISPLAY_ONLY';
      else if (counts.exact === rows.length) status = 'MATCH_EXACT';
      else status = 'UNVERIFIED';
    }

    return { business_date: businessDate, status, counts, partners: rows, totals, exact_totals: exactTotals };
  }

  global.KTS_SETTLEMENT_REPORT = Object.freeze({
    version: 'settlement-report-v3-kqxs-gate',
    CATEGORY_LABELS,
    categoryLabel,
    kqxsVerificationStatus,
    shadowStatusFromSettlements,
    buildDailyPartnerReport,
    buildDailyOperationsReport
  });
})(typeof window !== 'undefined' ? window : globalThis);
