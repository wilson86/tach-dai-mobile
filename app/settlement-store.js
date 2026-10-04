(function (global) {
  'use strict';

  const DB_NAME = 'kts_settlement_v0';
  const DB_VERSION = 2;
  const STORES = Object.freeze({
    partners: 'partners',
    configs: 'configs',
    messages: 'messages',
    settlements: 'settlements',
    results: 'results',
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
        if (!db.objectStoreNames.contains(STORES.partners)) {
          partners = db.createObjectStore(STORES.partners, { keyPath: 'id' });
        } else partners = tx.objectStore(STORES.partners);
        ensureIndex(partners, 'by_name', 'name');
        ensureIndex(partners, 'by_role', 'role');

        let configs;
        if (!db.objectStoreNames.contains(STORES.configs)) {
          configs = db.createObjectStore(STORES.configs, { keyPath: 'id' });
        } else configs = tx.objectStore(STORES.configs);
        ensureIndex(configs, 'by_partner', 'partner_id');
        ensureIndex(configs, 'by_partner_version', ['partner_id', 'version'], { unique: true });
        ensureIndex(configs, 'by_partner_effective', ['partner_id', 'effective_from_date'], { unique: false });

        let messages;
        if (!db.objectStoreNames.contains(STORES.messages)) {
          messages = db.createObjectStore(STORES.messages, { keyPath: 'id' });
        } else messages = tx.objectStore(STORES.messages);
        ensureIndex(messages, 'by_partner_date', ['partner_id', 'business_date']);
        ensureIndex(messages, 'by_date', 'business_date');

        let settlements;
        if (!db.objectStoreNames.contains(STORES.settlements)) {
          settlements = db.createObjectStore(STORES.settlements, { keyPath: 'id' });
        } else settlements = tx.objectStore(STORES.settlements);
        ensureIndex(settlements, 'by_partner_date', ['partner_id', 'business_date']);
        ensureIndex(settlements, 'by_message', 'message_id');

        let results;
        if (!db.objectStoreNames.contains(STORES.results)) {
          results = db.createObjectStore(STORES.results, { keyPath: 'id' });
        } else results = tx.objectStore(STORES.results);
        ensureIndex(results, 'by_date_region', ['business_date', 'region']);

        if (!db.objectStoreNames.contains(STORES.metadata)) {
          db.createObjectStore(STORES.metadata, { keyPath: 'key' });
        }
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
      business_date: input.business_date,
      region: input.region || null,
      engine_version: input.engine_version || 'settlement-v0',
      config_snapshot: clone(input.config_snapshot || null),
      result_snapshot: clone(input.result_snapshot || null),
      detail_rows: clone(input.detail_rows || []),
      category_rows: clone(input.category_rows || []),
      reference_app_snapshot: clone(input.reference_app_snapshot || null),
      comparison_status: input.comparison_status || 'unverified',
      created_at: input.created_at || now,
      updated_at: now
    };
    await put(STORES.settlements, v);
    return v;
  }

  async function exportAll() {
    const payload = { format: 'kts-settlement-export', version: 2, exported_at: nowIso(), stores: {} };
    for (const name of Object.values(STORES)) payload.stores[name] = await getAll(name);
    return payload;
  }

  async function importAll(payload, options) {
    const replace = Boolean(options && options.replace);
    if (!payload || payload.format !== 'kts-settlement-export' || ![1, 2].includes(payload.version)) throw new Error('INVALID_KTS_EXPORT');
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
    saveMessage, saveSettlement,
    get, getAll, remove, exportAll, importAll,
    normalizePartner, normalizeConfig
  });
})(typeof window !== 'undefined' ? window : globalThis);
