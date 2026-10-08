(function (global) {
  'use strict';

  const META_KEY = 'shadow_regression_cases_v1';
  const FORMAT = 'kts-shadow-regression-case-v1';
  const BUNDLE_FORMAT = 'kts-shadow-regression-bundle-v1';

  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
  function validDate(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')); }
  function validRole(v) { return ['customer', 'owner'].includes(String(v || '').toLowerCase()); }
  function caseId(input) {
    if (input && input.id) return String(input.id);
    const source = input && input.source_event_id ? String(input.source_event_id) : '';
    if (source) return `regression:${source}`;
    const s = input && input.scope || {};
    return `regression:${String(s.partner_id || '')}:${String(s.business_date || '')}:${String(s.region || '').toLowerCase()}`;
  }
  function requiredReference(reference) {
    const totals = reference && reference.totals || {};
    for (const key of ['xac', 'qua_co', 'payout', 'final']) {
      const n = Number(totals[key]);
      if (!Number.isFinite(n)) throw new Error('REGRESSION_REFERENCE_REQUIRED:' + key);
    }
  }
  function normalizeCase(input) {
    if (!input || typeof input !== 'object') throw new Error('REGRESSION_CASE_REQUIRED');
    const scope = input.scope || {};
    const region = String(scope.region || '').toLowerCase();
    if (!scope.partner_id || !validDate(scope.business_date) || !['mn', 'mt', 'mb'].includes(region)) throw new Error('REGRESSION_SCOPE_INVALID');
    const partnerRole = String(input.partner_role || '').toLowerCase();
    if (!validRole(partnerRole)) throw new Error('REGRESSION_PARTNER_ROLE_REQUIRED');
    if (!input.config_snapshot || typeof input.config_snapshot !== 'object') throw new Error('REGRESSION_CONFIG_REQUIRED');
    if (!input.lottery_result_snapshot || typeof input.lottery_result_snapshot !== 'object') throw new Error('REGRESSION_RESULT_REQUIRED');
    if (!Array.isArray(input.messages) || !input.messages.length) throw new Error('REGRESSION_MESSAGES_REQUIRED');
    if (!input.expected_reference || typeof input.expected_reference !== 'object') throw new Error('REGRESSION_REFERENCE_REQUIRED');
    requiredReference(input.expected_reference);
    return {
      format: FORMAT,
      id: caseId(input),
      source_event_id: input.source_event_id == null ? null : String(input.source_event_id),
      scope: {
        scope_id: String(scope.scope_id || `scope:${scope.partner_id}:${scope.business_date}:${region}`),
        partner_id: String(scope.partner_id),
        business_date: String(scope.business_date),
        region
      },
      partner_role: partnerRole,
      captured_at: input.captured_at || null,
      trigger: input.trigger == null ? null : String(input.trigger),
      note: String(input.note || ''),
      engine_version: input.engine_version == null ? null : String(input.engine_version),
      config_snapshot: clone(input.config_snapshot),
      lottery_result_snapshot: clone(input.lottery_result_snapshot),
      messages: clone(input.messages),
      expected_reference: clone(input.expected_reference),
      source_comparison_status: String(input.source_comparison_status || input.expected_comparison_status || 'UNVERIFIED').toUpperCase(),
      pinned_at: input.pinned_at || new Date().toISOString()
    };
  }

  function deps() {
    const engine = global.KTS_SETTLEMENT_ENGINE;
    const evaluator = global.KTS_SETTLEMENT_EVALUATOR;
    const shadow = global.KTS_SETTLEMENT_SHADOW;
    const runtime = global.KTS_SETTLEMENT_RUNTIME;
    if (!engine || !evaluator || !shadow || !runtime || typeof runtime.settleWithConfig !== 'function') throw new Error('REGRESSION_RUNTIME_DEPENDENCY_MISSING');
    return { engine, evaluator, shadow, runtime };
  }

  function ensureFeatureGates(message, config) {
    const legs = message && message.canonical_payload && message.canonical_payload.legs || [];
    if (legs.some(leg => /^MB_XIEN[234]$/.test(String(leg && leg.code || '').toUpperCase())) && config.mb_xien_234 !== true) {
      throw new Error('REGRESSION_FEATURE_GATE_MB_XIEN_CLOSED');
    }
  }

  function replayCase(input) {
    const c = normalizeCase(input);
    const d = deps();
    const categoryInputs = [];
    const detailRows = [];
    const messageBreakdown = [];
    for (const message of c.messages) {
      if (String(message && message.status || '').toLowerCase() === 'cancelled') continue;
      if (message && message.parser_error) throw new Error('REGRESSION_MESSAGE_PARSER_ERROR:' + String(message.id || 'unknown'));
      if (!message || !message.canonical_payload) throw new Error('REGRESSION_MESSAGE_CANONICAL_REQUIRED:' + String(message && message.id || 'unknown'));
      ensureFeatureGates(message, c.config_snapshot);
      const evaluated = d.evaluator.evaluateCanonicalMessage({
        canonical_payload: message.canonical_payload,
        config_snapshot: c.config_snapshot,
        result_snapshot: c.lottery_result_snapshot,
        region: c.scope.region
      });
      const messageRows = evaluated.category_inputs.map(row => d.engine.category(row));
      categoryInputs.push(...evaluated.category_inputs);
      detailRows.push(...evaluated.detail_rows.map(row => Object.assign({ message_id: String(message.id || '') }, row)));
      messageBreakdown.push({
        message_id: String(message.id || ''),
        raw_text: String(message.raw_text || ''),
        category_rows: clone(messageRows),
        detail_rows: clone(evaluated.detail_rows)
      });
    }
    if (!categoryInputs.length) throw new Error('REGRESSION_NO_ACTIVE_CATEGORY_INPUTS');
    // Regression MUST take the identical runtime path as live settlement.
    // Direct engine.settle() silently ignored per-region partner terms and
    // skipped the common feature guard, risking a false golden PASS.
    const settled = d.runtime.settleWithConfig(categoryInputs, {
      partner_role: c.partner_role, config_snapshot: c.config_snapshot, region: c.scope.region
    });
    const settlement = {
      id: c.scope.scope_id,
      partner_id: c.scope.partner_id,
      business_date: c.scope.business_date,
      region: c.scope.region,
      engine_version: d.engine.version,
      config_snapshot: clone(c.config_snapshot),
      lottery_result_snapshot: clone(c.lottery_result_snapshot),
      settlement_result: clone(settled),
      result_snapshot: clone(settled),
      category_rows: clone(settled.rows),
      detail_rows: clone(detailRows),
      message_breakdown: clone(messageBreakdown),
      message_ids: c.messages.filter(m => String(m.status || '').toLowerCase() !== 'cancelled').map(m => String(m.id || '')),
      scope_status: 'complete_unverified'
    };
    const comparison = d.shadow.compareSettlement(settlement, c.expected_reference);
    return {
      case: c,
      settlement,
      comparison,
      pass: comparison.safe_to_promote === true
    };
  }

  async function readMeta() {
    const store = global.KTS_SETTLEMENT_STORE;
    if (!store || !store.STORES || !store.STORES.metadata || typeof store.get !== 'function') throw new Error('REGRESSION_STORE_UNAVAILABLE');
    const row = await store.get(store.STORES.metadata, META_KEY);
    return row && Array.isArray(row.cases) ? row : { key: META_KEY, version: 1, cases: [] };
  }

  function requestPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('REGRESSION_METADATA_WRITE_FAILED'));
    });
  }
  function txPromise(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('REGRESSION_METADATA_TX_FAILED'));
      tx.onabort = () => reject(tx.error || new Error('REGRESSION_METADATA_TX_ABORTED'));
    });
  }
  async function writeMeta(row) {
    const store = global.KTS_SETTLEMENT_STORE;
    if (!store || typeof store.openDb !== 'function' || !store.STORES || !store.STORES.metadata) throw new Error('REGRESSION_STORE_UNAVAILABLE');
    const db = await store.openDb();
    try {
      const tx = db.transaction(store.STORES.metadata, 'readwrite');
      const req = tx.objectStore(store.STORES.metadata).put(clone(row));
      await requestPromise(req);
      await txPromise(tx);
    } finally { db.close(); }
    return row;
  }

  async function listPinnedCases() {
    const row = await readMeta();
    return row.cases.map(normalizeCase).sort((a, b) => String(a.pinned_at).localeCompare(String(b.pinned_at)));
  }

  async function pinCase(input) {
    const c = normalizeCase(input);
    const row = await readMeta();
    const cases = row.cases.filter(existing => caseId(existing) !== c.id);
    cases.push(c);
    await writeMeta({ key: META_KEY, version: 1, updated_at: new Date().toISOString(), cases });
    return c;
  }

  async function removePinnedCase(id) {
    const row = await readMeta();
    const cases = row.cases.filter(existing => caseId(existing) !== String(id));
    await writeMeta({ key: META_KEY, version: 1, updated_at: new Date().toISOString(), cases });
    return cases.length;
  }

  async function caseFromEvidence(event, options) {
    const runtime = global.KTS_SETTLEMENT_SHADOW_RUNTIME;
    const store = global.KTS_SETTLEMENT_STORE;
    if (!runtime || typeof runtime.buildReplayCase !== 'function') throw new Error('REGRESSION_SHADOW_RUNTIME_MISSING');
    const replay = runtime.buildReplayCase(event);
    if (!replay.partner_role && store && store.STORES && store.STORES.partners && typeof store.get === 'function') {
      const partner = await store.get(store.STORES.partners, replay.scope.partner_id).catch(() => null);
      replay.partner_role = partner && partner.role || null;
    }
    replay.note = options && options.note || '';
    replay.source_comparison_status = event && event.comparison_status || replay.expected_comparison_status;
    return normalizeCase(replay);
  }

  async function runPinnedCases() {
    const cases = await listPinnedCases();
    const results = cases.map(c => {
      try { return replayCase(c); }
      catch (error) { return { case: c, pass: false, error: String(error && error.message || error), comparison: null, settlement: null }; }
    });
    return {
      total: results.length,
      passed: results.filter(x => x.pass).length,
      failed: results.filter(x => !x.pass).length,
      pass: results.length > 0 && results.every(x => x.pass),
      results
    };
  }

  function exportBundle(cases) {
    const normalized = (Array.isArray(cases) ? cases : []).map(normalizeCase);
    return {
      format: BUNDLE_FORMAT,
      version: 1,
      exported_at: new Date().toISOString(),
      cases: normalized
    };
  }

  global.KTS_SETTLEMENT_REGRESSION_CASES = Object.freeze({
    version: 'settlement-regression-cases-v2-runtime-parity',
    META_KEY,
    FORMAT,
    BUNDLE_FORMAT,
    normalizeCase,
    replayCase,
    caseFromEvidence,
    listPinnedCases,
    pinCase,
    removePinnedCase,
    runPinnedCases,
    exportBundle
  });
})(typeof window !== 'undefined' ? window : globalThis);
