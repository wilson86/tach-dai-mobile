(function (global) {
  'use strict';

  const DB_NAME = 'kts_settlement_v0';
  const DB_VERSION = 1;
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

  function openDb() {
    if (!global.indexedDB) return Promise.reject(new Error('INDEXEDDB_UNAVAILABLE'));
    return new Promise((resolve, reject) => {
      const req = global.indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error || new Error('IDB_OPEN_FAILED'));
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORES.partners)) {
          const s = db.createObjectStore(STORES.partners, { keyPath: 'id' });
          s.createIndex('by_name', 'name', { unique: false });
          s.createIndex('by_role', 'role', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORES.configs)) {
          const s = db.createObjectStore(STORES.configs, { keyPath: 'id' });
          s.createIndex('by_partner', 'partner_id', { unique: false });
          s.createIndex('by_partner_version', ['partner_id', 'version'], { unique: true });
        }
        if (!db.objectStoreNames.contains(STORES.messages)) {
          const s = db.createObjectStore(STORES.messages, { keyPath: 'id' });
          s.createIndex('by_partner_date', ['partner_id', 'business_date'], { unique: false });
          s.createIndex('by_date', 'business_date', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORES.settlements)) {
          const s = db.createObjectStore(STORES.settlements, { keyPath: 'id' });
          s.createIndex('by_partner_date', ['partner_id', 'business_date'], { unique: false });
          s.createIndex('by_message', 'message_id', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORES.results)) {
          const s = db.createObjectStore(STORES.results, { keyPath: 'id' });
          s.createIndex('by_date_region', ['business_date', 'region'], { unique: false });
        }
        if (!db.objectStoreNames.contains(STORES.metadata)) {
          db.createObjectStore(STORES.metadata, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
    });
  }

  function nowIso() { return new Date().toISOString(); }
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
    const now = nowIso();
    return {
      id: input.id || `${input.partner_id}:v${version}`,
      partner_id: input.partner_id, version,
      effective_from: input.effective_from || now,
      region_pricing: clone(input.region_pricing || {}),
      dat_hit_mode: input.dat_hit_mode || 'ky_ruoi',
      dax_hit_mode: input.dax_hit_mode || 'multi_pair',
      mb_xien_234: Boolean(input.mb_xien_234),
      tinh_ui: Boolean(input.tinh_ui),
      total_percent: String(input.total_percent == null ? '100' : input.total_percent),
      refund_percent: String(input.refund_percent == null ? '0' : input.refund_percent),
      commission_type: input.commission_type || 'ratio',
      created_at: input.created_at || now, updated_at: now
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

  async function savePartner(input) { const v = normalizePartner(input); await put(STORES.partners, v); return v; }
  async function saveConfig(input) { const v = normalizeConfig(input); await put(STORES.configs, v); return v; }

  async function saveMessage(input) {
    if (!input.partner_id) throw new Error('MESSAGE_PARTNER_REQUIRED');
    if (!input.business_date) throw new Error('MESSAGE_DATE_REQUIRED');
    const now = nowIso();
    const v = {
      id: input.id || makeId('msg'), partner_id: input.partner_id,
      business_date: input.business_date, region: input.region || null,
      raw_text: String(input.raw_text || ''),
      canonical_payload: clone(input.canonical_payload || null),
      config_snapshot: clone(input.config_snapshot || null),
      status: input.status || 'draft',
      created_at: input.created_at || now, updated_at: now
    };
    await put(STORES.messages, v); return v;
  }

  async function saveSettlement(input) {
    if (!input.partner_id || !input.business_date) throw new Error('SETTLEMENT_SCOPE_REQUIRED');
    const now = nowIso();
    const v = {
      id: input.id || makeId('settlement'), partner_id: input.partner_id,
      message_id: input.message_id || null, business_date: input.business_date,
      region: input.region || null, engine_version: input.engine_version || 'settlement-v0',
      config_snapshot: clone(input.config_snapshot || null),
      result_snapshot: clone(input.result_snapshot || null),
      reference_app_snapshot: clone(input.reference_app_snapshot || null),
      comparison_status: input.comparison_status || 'unverified',
      created_at: input.created_at || now, updated_at: now
    };
    await put(STORES.settlements, v); return v;
  }

  async function exportAll() {
    const payload = { format: 'kts-settlement-export', version: 1, exported_at: nowIso(), stores: {} };
    for (const name of Object.values(STORES)) payload.stores[name] = await getAll(name);
    return payload;
  }

  async function importAll(payload, options) {
    const replace = Boolean(options && options.replace);
    if (!payload || payload.format !== 'kts-settlement-export' || payload.version !== 1) throw new Error('INVALID_KTS_EXPORT');
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
    DB_NAME, DB_VERSION, STORES, openDb, savePartner, saveConfig, saveMessage,
    saveSettlement, get, getAll, remove, exportAll, importAll,
    normalizePartner, normalizeConfig
  });
})(typeof window !== 'undefined' ? window : globalThis);
