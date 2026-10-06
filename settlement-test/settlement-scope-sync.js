(function (global) {
  'use strict';

  function normalizeRegion(value) {
    const region = String(value || '').toLowerCase();
    return ['mn', 'mt', 'mb'].includes(region) ? region : '';
  }

  function normalizeDate(value) {
    const date = String(value || '');
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
  }

  function buildSyncPlan(input) {
    const x = input || {};
    const partnerId = String(x.partner_id || '');
    const businessDate = normalizeDate(x.business_date);
    const region = normalizeRegion(x.region);
    const resultMode = String(x.result_mode || 'realtime') === 'date' ? 'date' : 'realtime';
    return {
      report_partner_id: partnerId,
      report_date: businessDate,
      shadow_region: region,
      // KQXS realtime is an independent live view. Never move it away from
      // today because the operator changed a historical message scope.
      result_scope: resultMode === 'date' && businessDate && region
        ? { business_date: businessDate, region }
        : null
    };
  }

  function install() {
    const doc = global.document;
    if (!doc || doc.documentElement.dataset.ktsSettlementScopeSync === '1') return;
    doc.documentElement.dataset.ktsSettlementScopeSync = '1';

    const partner = doc.getElementById('partnerSelect');
    const reportPartner = doc.getElementById('reportPartner');
    const messageDate = doc.getElementById('messageDate');
    const reportDate = doc.getElementById('reportDate');
    const messageRegion = doc.getElementById('messageRegion');
    const shadowRegion = doc.getElementById('shadowRegion');
    const resultDate = doc.getElementById('resultDate');
    const resultRegion = doc.getElementById('resultRegion');

    function resultMode() {
      const select = doc.getElementById('resultViewMode');
      return select && select.value === 'date' ? 'date' : 'realtime';
    }

    function currentPlan() {
      return buildSyncPlan({
        partner_id: partner && partner.value,
        business_date: messageDate && messageDate.value,
        region: messageRegion && messageRegion.value,
        result_mode: resultMode()
      });
    }

    function apply(options) {
      const o = options || {};
      const plan = currentPlan();
      if (reportPartner && plan.report_partner_id && reportPartner.value !== plan.report_partner_id) {
        reportPartner.value = plan.report_partner_id;
      }
      if (reportDate && plan.report_date && reportDate.value !== plan.report_date) {
        reportDate.value = plan.report_date;
      }
      if (shadowRegion && plan.shadow_region && shadowRegion.value !== plan.shadow_region) {
        shadowRegion.value = plan.shadow_region;
      }
      if (o.include_result && plan.result_scope) {
        if (resultDate && resultDate.value !== plan.result_scope.business_date) resultDate.value = plan.result_scope.business_date;
        if (resultRegion && resultRegion.value !== plan.result_scope.region) resultRegion.value = plan.result_scope.region;
      }
      return plan;
    }

    if (partner) partner.addEventListener('change', () => apply({ include_result: false }));
    if (messageDate) messageDate.addEventListener('change', () => apply({ include_result: true }));
    if (messageRegion) messageRegion.addEventListener('change', () => apply({ include_result: true }));

    // Initial partner/report alignment is safe. KQXS is deliberately untouched
    // unless the operator is in explicit "Theo ngày chọn" mode and then changes
    // the message date/region.
    apply({ include_result: false });
  }

  global.KTS_SETTLEMENT_SCOPE_SYNC = Object.freeze({
    version: 'settlement-scope-sync-v1',
    normalizeRegion,
    normalizeDate,
    buildSyncPlan
  });

  if (global.document && global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})(typeof window !== 'undefined' ? window : globalThis);
