(function (global) {
  'use strict';

  const DB_NAME = 'kts_settlement_v0';
  const DB_VERSION = 5;
  const STORES = Object.freeze({
    partners: 'partners',
    configs: 'configs',
    messages: 'messages',
    settlements: 'settlements',
    results: 'results',
    resultEvents: 'result_events',
    shadowEvents: 'shadow_events',
    metadata: 'metadata'
  });

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IDB_REQUEST_FAILED'));
    });
  }

  function txDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IDB_TX_FAILED'));
      tx.onabort = () => reject(tx.error || new Error('IDB_TX_ABORTED'));
    });
  }

  function ensureIndex(store, name, keyPath, options) {
    if (!store.indexNames.contains(name)) store.createIndex(name, keyPath, options || { unique: false });
  }

  function openDb() {
    if (!global.indexedDB) return Promise.reject(new Error('INDEXEDDB_UNAVAILABLE'));
    return new Promise((resolve, reject) => {
      const req = global.indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error || new Error('IDB_OPEN_FAILED'));
      req.onupgradeneeded = () => {
        const db = req.result;
        const tx = req.transaction;

        let partners;
        if (!db.objectStoreNames.contains(STORES.partners)) partners = db.createObjectStore(STORES.partners, { keyPath: 'id' });
        else partners = tx.objectStore(STORES.partners);
        ensureIndex(partners, 'by_name', 'name');
        ensureIndex(partners, 'by_role', 'role');

        let configs;
        if (!db.objectStoreNames.contains(STORES.configs)) configs = db.createObjectStore(STORES.configs, { keyPath: 'id' });
        else configs = tx.objectStore(STORES.configs);
        ensureIndex(configs, 'by_partner', 'partner_id');
        ensureIndex(configs, 'by_partner_version', ['partner_id', 'version'], { unique: true });
        ensureIndex(configs, 'by_partner_effective', ['partner_id', 'effective_from_date'], { unique: false });

        let messages;
        if (!db.objectStoreNames.contains(STORES.messages)) messages = db.createObjectStore(STORES.messages, { keyPath: 'id' });
        else messages = tx.objectStore(STORES.messages);
        ensureIndex(messages, 'by_partner_date', ['partner_id', 'business_date']);
        ensureIndex(messages, 'by_date', 'business_date');

        let settlements;
        if (!db.objectStoreNames.contains(STORES.settlements)) settlements = db.createObjectStore(STORES.settlements, { keyPath: 'id' });
        else settlements = tx.objectStore(STORES.settlements);
        ensureIndex(settlements, 'by_partner_date', ['partner_id', 'business_date']);
        ensureIndex(settlements, 'by_message', 'message_id');

        let results;
        if (!db.objectStoreNames.contains(STORES.results)) results = db.createObjectStore(STORES.results, { keyPath: 'id' });
        else results = tx.objectStore(STORES.results);
        ensureIndex(results, 'by_date_region', ['business_date', 'region']);

        let resultEvents;
        if (!db.objectStoreNames.contains(STORES.resultEvents)) resultEvents = db.createObjectStore(STORES.resultEvents, { keyPath: 'id' });
        else resultEvents = tx.objectStore(STORES.resultEvents);
        ensureIndex(resultEvents, 'by_date_region', ['business_date', 'region']);
        ensureIndex(resultEvents, 'by_result_id', 'result_id');

        let shadowEvents;
        if (!db.objectStoreNames.contains(STORES.shadowEvents)) shadowEvents = db.createObjectStore(STORES.shadowEvents, { keyPath: 'id' });
        else shadowEvents = tx.objectStore(STORES.shadowEvents);
        ensureIndex(shadowEvents, 'by_scope', ['partner_id', 'business_date', 'region']);
        ensureIndex(shadowEvents, 'by_scope_id', 'scope_id');
        ensureIndex(shadowEvents, 'by_observed_at', 'observed_at');

        if (!db.objectStoreNames.contains(STORES.metadata)) db.createObjectStore(STORES.metadata, { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
    });
  }

  function nowIso() { return new Date().toISOString(); }
  function todayLocalDate() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function validDateOnly(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')); }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function makeId(prefix) {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') return prefix + '_' + global.crypto.randomUUID();
    return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
  }

  function stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
  }

  function normalizePartner(input) {
    const role = String(input.role || '').toLowerCase();
    if (!['customer', 'owner'].includes(role)) throw new Error('INVALID_PARTNER_ROLE');
    const name = String(input.name || '').trim();
    if (!name) throw new Error('PARTNER_NAME_REQUIRED');
    const now = nowIso();
    return {
      id: input.id || makeId('partner'), name,
      phone: String(input.phone || '').trim(), role,
      active: input.active !== false,
      created_at: input.created_at || now, updated_at: now
    };
  }

  function normalizeConfig(input) {
    if (!input.partner_id) throw new Error('CONFIG_PARTNER_REQUIRED');
    const version = Number(input.version || 1);
    if (!Number.isInteger(version) || version < 1) throw new Error('INVALID_CONFIG_VERSION');
    const effectiveDate = String(input.effective_from_date || input.effective_from || todayLocalDate()).slice(0, 10);
    if (!validDateOnly(effectiveDate)) throw new Error('INVALID_EFFECTIVE_FROM_DATE');
    const now = nowIso();
    return {
      id: input.id || `${input.partner_id}:v${version}`,
      partner_id: input.partner_id,
      version,
      effective_from_date: effectiveDate,
      region_pricing: clone(input.region_pricing || {}),
      dat_hit_mode: input.dat_hit_mode || 'ky_ruoi',
      dax_hit_mode: input.dax_hit_mode || 'multi_pair',
      mb_xien_234: Boolean(input.mb_xien_234),
      tinh_ui: Boolean(input.tinh_ui),
      total_percent: String(input.total_percent == null ? '100' : input.total_percent),
      refund_percent: String(input.refund_percent == null ? '0' : input.refund_percent),
      commission_type: input.commission_type || 'ratio',
      created_at: input.created_at || now,
      updated_at: now
    };
  }

  function normalizeResultSnapshot(input) {
    const businessDate = String(input.business_date || '').slice(0, 10);
    const region = String(input.region || '').toLowerCase();
    if (!validDateOnly(businessDate)) throw new Error('RESULT_DATE_REQUIRED');
    if (!['mn', 'mt', 'mb'].includes(region)) throw new Error('RESULT_REGION_REQUIRED');
    const status = String(input.status || (input.complete ? 'complete' : 'partial')).toLowerCase();
    if (!['partial', 'complete', 'error', 'stale'].includes(status)) throw new Error('INVALID_RESULT_STATUS');
    let verificationStatus = String(input.verification_status || (input.verified ? 'verified' : 'unverified')).toLowerCase();
    if (!['unverified', 'verified', 'conflict'].includes(verificationStatus)) verificationStatus = 'unverified';
    const complete = Boolean(input.complete);
    if (!complete && verificationStatus === 'verified') verificationStatus = 'unverified';
    const fetchedAt = input.fetched_at || nowIso();
    const stations = clone(input.stations || []);
    const expectedStationCodes = Array.isArray(input.expected_station_codes)
      ? input.expected_station_codes.map(x => String(x || '').trim().toLowerCase()).filter(Boolean)
      : [];
    if (new Set(expectedStationCodes).size !== expectedStationCodes.length) throw new Error('RESULT_EXPECTED_STATIONS_DUPLICATE');
    const verificationSources = Array.isArray(input.verification_sources) ? input.verification_sources.map(String) : [];
    const verificationReason = input.verification_reason == null ? null : String(input.verification_reason);
    const verificationConflicts = Array.isArray(input.verification_conflicts) ? input.verification_conflicts.map(String) : [];
    const coverageComplete = input.coverage_complete == null ? null : Boolean(input.coverage_complete);
    const core = {
      business_date: businessDate,
      region,
      status,
      complete,
      coverage_complete: coverageComplete,
      verification_status: verificationStatus,
      verification_sources: verificationSources,
      verification_reason: verificationReason,
      verification_conflicts: verificationConflicts,
      expected_station_codes: expectedStationCodes,
      stations
    };
    const fingerprint = input.fingerprint || stableStringify(core);
    return {
      id: input.id || `${businessDate}:${region}`,
      business_date: businessDate,
      region,
      source: String(input.source || 'unknown'),
      fetched_at: fetchedAt,
      status,
      complete,
      coverage_complete: coverageComplete,
      verified: complete && verificationStatus === 'verified',
      verification_status: verificationStatus,
      verification_sources: verificationSources,
      verification_reason: verificationReason,
      verification_conflicts: verificationConflicts,
      expected_station_codes: expectedStationCodes,
      stations,
      fingerprint,
      provider_revision: input.provider_revision == null ? null : String(input.provider_revision)
    };
  }

  function normalizeShadowEvent(input) {
    const partnerId = String(input && input.partner_id || '');
    const businessDate = String(input && input.business_date || '').slice(0, 10);
    const region = String(input && input.region || '').toLowerCase();
    if (!partnerId || !validDateOnly(businessDate)) throw new Error('SHADOW_EVENT_SCOPE_REQUIRED');
    if (!['mn', 'mt', 'mb'].includes(region)) throw new Error('SHADOW_EVENT_REGION_REQUIRED');
    const scopeId = String(input.scope_id || `scope:${partnerId}:${businessDate}:${region}`);
    const evidenceCore = {
      scope_id: scopeId,
      trigger: String(input.trigger || 'UNKNOWN'),
      local_snapshot: clone(input.local_snapshot || null),
      reference_snapshot: clone(input.reference_snapshot || null),
      comparison: clone(input.comparison || null)
    };
    return {
      id: input.id || makeId('shadow_event'),
      scope_id: scopeId,
      partner_id: partnerId,
      business_date: businessDate,
      region,
      trigger: evidenceCore.trigger,
      reason: input.reason == null ? null : String(input.reason),
      local_snapshot: evidenceCore.local_snapshot,
      reference_snapshot: evidenceCore.reference_snapshot,
      comparison: evidenceCore.comparison,
      comparison_status: String(input.comparison_status || (evidenceCore.comparison && evidenceCore.comparison.status) || 'UNVERIFIED').toUpperCase(),
      evidence_fingerprint: input.evidence_fingerprint || stableStringify(evidenceCore),
      observed_at: input.observed_at || nowIso()
    };
  }

  async function put(storeName, value) {
    const db = await openDb();
    try {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(clone(value));
      await txDone(tx);
      return value;
    } finally { db.close(); }
  }

  async function get(storeName, key) {
    const db = await openDb();
    try {
      const tx = db.transaction(storeName, 'readonly');
      return await requestToPromise(tx.objectStore(storeName).get(key));
    } finally { db.close(); }
  }

  async function getAll(storeName) {
    const db = await openDb();
    try {
      const tx = db.transaction(storeName, 'readonly');
      return await requestToPromise(tx.objectStore(storeName).getAll());
    } finally { db.close(); }
  }

  async function remove(storeName, key) {
    const db = await openDb();
    try {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      await txDone(tx);
    } finally { db.close(); }
  }

  async function savePartner(input) {
    const v = normalizePartner(input);
    await put(STORES.partners, v);
    return v;
  }

  async function listConfigsForPartner(partnerId) {
    const all = await getAll(STORES.configs);
    return all
      .filter(x => x.partner_id === partnerId)
      .map(x => x.effective_from_date ? x : Object.assign({}, x, { effective_from_date: String(x.effective_from || '').slice(0, 10) }))
      .sort((a, b) => a.effective_from_date.localeCompare(b.effective_from_date) || Number(a.version) - Number(b.version));
  }

  async function nextConfigVersion(partnerId) {
    const rows = await listConfigsForPartner(partnerId);
    return rows.reduce((m, x) => Math.max(m, Number(x.version) || 0), 0) + 1;
  }

  async function saveConfig(input) {
    const copy = Object.assign({}, input);
    if (copy.version == null) copy.version = await nextConfigVersion(copy.partner_id);
    const v = normalizeConfig(copy);
    await put(STORES.configs, v);
    return v;
  }

  async function resolveConfigForDate(partnerId, businessDate) {
    if (!partnerId) throw new Error('CONFIG_PARTNER_REQUIRED');
    if (!validDateOnly(businessDate)) throw new Error('INVALID_BUSINESS_DATE');
    const rows = await listConfigsForPartner(partnerId);
    const eligible = rows.filter(x => x.effective_from_date <= businessDate);
    if (!eligible.length) throw new Error('NO_CONFIG_FOR_BUSINESS_DATE');
    return clone(eligible[eligible.length - 1]);
  }

  async function saveMessage(input) {
    if (!input.partner_id) throw new Error('MESSAGE_PARTNER_REQUIRED');
    if (!validDateOnly(input.business_date)) throw new Error('MESSAGE_DATE_REQUIRED');
    const now = nowIso();
    const configSnapshot = input.config_snapshot || await resolveConfigForDate(input.partner_id, input.business_date);
    const v = {
      id: input.id || makeId('msg'),
      partner_id: input.partner_id,
      business_date: input.business_date,
      region: input.region || null,
      raw_text: String(input.raw_text || ''),
      canonical_payload: clone(input.canonical_payload || null),
      canonical_version: input.canonical_version == null ? null : String(input.canonical_version),
      parser_error: input.parser_error == null ? null : String(input.parser_error),
      config_snapshot: clone(configSnapshot),
      status: input.status || 'draft',
      created_at: input.created_at || now,
      updated_at: now
    };
    await put(STORES.messages, v);
    return v;
  }

  async function saveSettlement(input) {
    if (!input.partner_id || !validDateOnly(input.business_date)) throw new Error('SETTLEMENT_SCOPE_REQUIRED');
    const now = nowIso();
    const v = {
      id: input.id || makeId('settlement'),
      partner_id: input.partner_id,
      message_id: input.message_id || null,
      message_ids: clone(input.message_ids || (input.message_id ? [input.message_id] : [])),
      business_date: input.business_date,
      region: input.region || null,
      engine_version: input.engine_version || 'settlement-v1-verified-rules',
      config_snapshot: clone(input.config_snapshot || null),
      lottery_result_snapshot: clone(input.lottery_result_snapshot || null),
      result_snapshot: clone(input.result_snapshot || input.settlement_result || null),
      settlement_result: clone(input.settlement_result || input.result_snapshot || null),
      detail_rows: clone(input.detail_rows || []),
      category_rows: clone(input.category_rows || []),
      message_breakdown: clone(input.message_breakdown || []),
      scope_status: input.scope_status || 'unverified',
      blocked_reasons: clone(input.blocked_reasons || []),
      reference_app_snapshot: clone(input.reference_app_snapshot || null),
      comparison_status: input.comparison_status || 'unverified',
      created_at: input.created_at || now,
      updated_at: now
    };
    await put(STORES.settlements, v);
    return v;
  }

  async function saveResultSnapshot(input) {
    const v = normalizeResultSnapshot(input);
    const previous = await get(STORES.results, v.id);
    const changed = !previous || previous.fingerprint !== v.fingerprint;
    await put(STORES.results, v);
    if (changed) {
      const event = Object.assign({}, clone(v), {
        id: makeId('result_event'),
        result_id: v.id,
        observed_at: nowIso()
      });
      await put(STORES.resultEvents, event);
    }
    return { snapshot: v, changed, previous: previous || null };
  }

  async function listShadowEvents(input) {
    const all = await getAll(STORES.shadowEvents);
    const partnerId = input && input.partner_id ? String(input.partner_id) : '';
    const businessDate = input && input.business_date ? String(input.business_date).slice(0, 10) : '';
    const region = input && input.region ? String(input.region).toLowerCase() : '';
    const scope = input && input.scope_id ? String(input.scope_id) : '';
    return all.filter(row => {
      if (scope && String(row.scope_id) !== scope) return false;
      if (partnerId && String(row.partner_id) !== partnerId) return false;
      if (businessDate && String(row.business_date) !== businessDate) return false;
      if (region && String(row.region).toLowerCase() !== region) return false;
      return true;
    }).sort((a, b) => String(a.observed_at || '').localeCompare(String(b.observed_at || '')) || String(a.id || '').localeCompare(String(b.id || '')));
  }

  async function saveShadowEvent(input) {
    const event = normalizeShadowEvent(input || {});
    const existing = await listShadowEvents({ scope_id: event.scope_id });
    const previous = existing.length ? existing[existing.length - 1] : null;
    if (previous && previous.evidence_fingerprint === event.evidence_fingerprint) {
      return { event: clone(previous), changed: false, previous: clone(previous) };
    }
    await put(STORES.shadowEvents, event);
    return { event, changed: true, previous: previous ? clone(previous) : null };
  }

  async function exportAll() {
    const payload = { format: 'kts-settlement-export', version: 5, exported_at: nowIso(), stores: {} };
    for (const name of Object.values(STORES)) payload.stores[name] = await getAll(name);
    return payload;
  }

  async function importAll(payload, options) {
    const replace = Boolean(options && options.replace);
    if (!payload || payload.format !== 'kts-settlement-export' || ![1, 2, 3, 4, 5].includes(payload.version)) throw new Error('INVALID_KTS_EXPORT');
    const db = await openDb();
    try {
      const names = Object.values(STORES);
      const tx = db.transaction(names, 'readwrite');
      for (const name of names) {
        const store = tx.objectStore(name);
        if (replace) store.clear();
        for (const row of ((payload.stores && payload.stores[name]) || [])) store.put(clone(row));
      }
      await txDone(tx);
    } finally { db.close(); }
  }

  global.KTS_SETTLEMENT_STORE = Object.freeze({
    DB_NAME, DB_VERSION, STORES, openDb,
    savePartner, saveConfig, listConfigsForPartner, resolveConfigForDate,
    saveMessage, saveSettlement, saveResultSnapshot, saveShadowEvent, listShadowEvents,
    get, getAll, remove, exportAll, importAll,
    normalizePartner, normalizeConfig, normalizeResultSnapshot, normalizeShadowEvent, stableStringify
  });
})(typeof window !== 'undefined' ? window : globalThis);