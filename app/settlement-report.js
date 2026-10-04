(function (global) {
  'use strict';

  function num(v) {
    const x = Number(v == null ? 0 : v);
    return Number.isFinite(x) ? x : 0;
  }

  function addCategory(target, row) {
    const code = String(row.code || row.category || 'UNKNOWN');
    if (!target[code]) {
      target[code] = {
        code,
        xac: 0,
        qua_co: 0,
        hit_units: 0,
        payout: 0,
        message_count: 0
      };
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
    const rows = settlement.result_snapshot && Array.isArray(settlement.result_snapshot.rows)
      ? settlement.result_snapshot.rows
      : [];
    return rows;
  }

  function buildDailyPartnerReport(input) {
    const partner = input && input.partner ? input.partner : {};
    const businessDate = String(input && input.business_date || '');
    const settlements = Array.isArray(input && input.settlements) ? input.settlements : [];
    const messagesById = input && input.messages_by_id ? input.messages_by_id : {};

    const byRegion = {};
    const allCategories = {};
    const messageReports = [];
    let totalXac = 0;
    let totalQuaCo = 0;
    let totalPayout = 0;
    let finalNet = 0;
    let refundAmount = 0;

    for (const settlement of settlements) {
      if (businessDate && settlement.business_date !== businessDate) continue;
      if (partner.id && settlement.partner_id !== partner.id) continue;

      const region = String(settlement.region || 'unknown').toLowerCase();
      if (!byRegion[region]) {
        byRegion[region] = {
          region,
          categories: {},
          total_xac: 0,
          total_qua_co: 0,
          total_payout: 0,
          refund_amount: 0,
          final_net: 0,
          messages: []
        };
      }
      const regionReport = byRegion[region];
      const result = settlement.result_snapshot || {};
      const categories = settlementCategories(settlement);

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

      const msg = messagesById[settlement.message_id] || null;
      const messageReport = {
        settlement_id: settlement.id,
        message_id: settlement.message_id || null,
        region,
        raw_text: msg ? String(msg.raw_text || '') : '',
        categories: categories.map(x => Object.assign({}, x)),
        detail_rows: Array.isArray(settlement.detail_rows) ? settlement.detail_rows.map(x => Object.assign({}, x)) : [],
        result: Object.assign({}, result),
        comparison_status: settlement.comparison_status || 'unverified'
      };
      regionReport.messages.push(messageReport);
      messageReports.push(messageReport);
    }

    function finalizeRegion(regionReport) {
      regionReport.categories = Object.values(regionReport.categories)
        .filter(x => x.xac !== 0 || x.qua_co !== 0 || x.hit_units !== 0 || x.payout !== 0)
        .sort((a, b) => a.code.localeCompare(b.code));
      regionReport.direction = regionReport.final_net > 0 ? 'THU' : regionReport.final_net < 0 ? 'BU' : 'HOA';
      return regionReport;
    }

    const regions = Object.values(byRegion).map(finalizeRegion);
    const categories = Object.values(allCategories)
      .filter(x => x.xac !== 0 || x.qua_co !== 0 || x.hit_units !== 0 || x.payout !== 0)
      .sort((a, b) => a.code.localeCompare(b.code));

    return {
      partner: Object.assign({}, partner),
      business_date: businessDate,
      regions,
      categories,
      messages: messageReports,
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

  global.KTS_SETTLEMENT_REPORT = Object.freeze({ buildDailyPartnerReport });
})(typeof window !== 'undefined' ? window : globalThis);
