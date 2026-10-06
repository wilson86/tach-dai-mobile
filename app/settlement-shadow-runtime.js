(function (global) {
  'use strict';

  function deps() {
    const store = global.KTS_SETTLEMENT_STORE;
    const shadow = global.KTS_SETTLEMENT_SHADOW;
    if (!store || !shadow) throw new Error('SETTLEMENT_SHADOW_RUNTIME_DEPENDENCY_MISSING');
    return { store, shadow };
  }

  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function scopeId(partnerId, businessDate, region) {
    return `scope:${partnerId}:${businessDate}:${String(region || '').toLowerCase()}`;
  }

  function normalizeReference(input) {
    const ref = input && typeof input === 'object' ? clone(input) : {};
    const totals = ref.totals && typeof ref.totals === 'object' ? ref.totals : {};
    const normalized = { totals: {}, categories: [] };
    for (const key of ['xac', 'qua_co', 'payout', 'hoi', 'final']) {
      const value = totals[key] != null ? totals[key] : ref[key];
      if (value == null || value === '') continue;
      const n = Number(value);
      if (!Number.isFinite(n)) throw new Error('HIOSKT_REFERENCE_INVALID:' + key);
      normalized.totals[key] = n;
    }
    if (Array.isArray(ref.categories)) {
      normalized.categories = ref.categories.map(row => {
        if (!row || !row.code) throw new Error('HIOSKT_CATEGORY_CODE_REQUIRED');
        const out = { code: String(row.code).toUpperCase() };
        for (const field of ['xac', 'qua_co', 'hit_units', 'payout']) {
          if (row[field] == null || row[field] === '') continue;
          const n = Number(row[field]);
          if (!Number.isFinite(n)) throw new Error('HIOSKT_CATEGORY_INVALID:' + field);
          out[field] = n;
        }
        return out;
      });
    }
    normalized.captured_at = ref.captured_at || new Date().toISOString();
    normalized.source = String(ref.source || 'HIOSKT_MANUAL');
    normalized.note = String(ref.note || '');
    return normalized;
  }

  function localEvidence(settlement) {
    const result = settlement && (settlement.settlement_result || settlement.result_snapshot) || null;
    const lottery = settlement && settlement.lottery_result_snapshot || null;
    const config = settlement && settlement.config_snapshot || null;
    return {
      settlement_result: clone(result),
      category_rows: clone(settlement && settlement.category_rows || []),
      message_ids: clone(settlement && settlement.message_ids || []),
      engine_version: String(settlement && settlement.engine_version || ''),
      config_version: config && config.version != null ? Number(config.version) : null,
      config_effective_from_date: config && config.effective_from_date ? String(config.effective_from_date) : null,
      result_fingerprint: lottery && lottery.fingerprint ? String(lottery.fingerprint) : null,
      result_verification_status: lottery && lottery.verification_status ? String(lottery.verification_status) : null,
      scope_status: String(settlement && settlement.scope_status || '')
    };
  }

  async function saveEvidence(store, settlement, reference, comparison, input) {
    if (!store || typeof store.saveShadowEvent !== 'function') return null;
    return store.saveShadowEvent({
      scope_id: settlement.id,
      partner_id: settlement.partner_id,
      business_date: settlement.business_date,
      region: settlement.region,
      trigger: String(input && input.trigger || 'MANUAL_COMPARE').toUpperCase(),
      reason: input && input.reason != null ? String(input.reason) : null,
      local_snapshot: localEvidence(settlement),
      reference_snapshot: clone(reference),
      comparison: clone(comparison),
      comparison_status: comparison.status
    });
  }

  async function compareAndSave(input) {
    const d = deps();
    const id = scopeId(input.partner_id, input.business_date, input.region);
    const settlement = await d.store.get(d.store.STORES.settlements, id);
    if (!settlement) throw new Error('SETTLEMENT_SCOPE_NOT_FOUND');
    if (settlement.scope_status === 'blocked') throw new Error('SETTLEMENT_SCOPE_BLOCKED');
    const reference = normalizeReference(input.reference_snapshot || {});
    const comparison = d.shadow.compareSettlement(settlement, reference, input.options || {});
    const savedReference = Object.assign({}, reference, { comparison: clone(comparison) });
    const saved = await d.store.saveSettlement(Object.assign({}, settlement, {
      reference_app_snapshot: savedReference,
      comparison_status: comparison.status,
      created_at: settlement.created_at
    }));
    const evidence = await saveEvidence(d.store, saved, reference, comparison, input || {});
    return { settlement: saved, reference: savedReference, comparison, evidence };
  }

  async function getComparison(input) {
    const d = deps();
    const settlement = await d.store.get(d.store.STORES.settlements, scopeId(input.partner_id, input.business_date, input.region));
    if (!settlement) return null;
    const reference = settlement.reference_app_snapshot || null;
    return {
      settlement,
      reference,
      comparison: reference && reference.comparison ? reference.comparison : null
    };
  }

  async function getDiagnostics(input) {
    const d = deps();
    const loaded = await getComparison(input);
    if (!loaded || !loaded.comparison) return null;
    const diagnostics = d.shadow.buildMismatchDiagnostics(loaded.settlement, loaded.comparison);
    const messages = d.store.STORES.messages && typeof d.store.getAll === 'function'
      ? await d.store.getAll(d.store.STORES.messages)
      : [];
    const messageMap = Object.fromEntries((messages || []).map(m => [String(m.id), m]));
    const enriched = clone(diagnostics);
    for (const issue of enriched.category_issues || []) {
      issue.messages = (issue.message_ids || []).map(id => {
        const m = messageMap[String(id)] || {};
        return {
          id: String(id),
          raw_text: String(m.raw_text || ''),
          status: String(m.status || '')
        };
      });
    }
    return Object.assign({}, loaded, { diagnostics: enriched });
  }

  async function getHistory(input) {
    const d = deps();
    if (typeof d.store.listShadowEvents === 'function') {
      return d.store.listShadowEvents({
        partner_id: input.partner_id,
        business_date: input.business_date,
        region: input.region
      });
    }
    if (!d.store.STORES.shadowEvents || typeof d.store.getAll !== 'function') return [];
    const id = scopeId(input.partner_id, input.business_date, input.region);
    const all = await d.store.getAll(d.store.STORES.shadowEvents);
    return (all || []).filter(row => String(row.scope_id || '') === id)
      .sort((a, b) => String(a.observed_at || '').localeCompare(String(b.observed_at || '')));
  }

  global.KTS_SETTLEMENT_SHADOW_RUNTIME = Object.freeze({
    version: 'settlement-shadow-runtime-v3-evidence-history',
    scopeId,
    normalizeReference,
    localEvidence,
    compareAndSave,
    getComparison,
    getDiagnostics,
    getHistory
  });
})(typeof window !== 'undefined' ? window : globalThis);