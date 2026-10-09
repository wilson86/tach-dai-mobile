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

  // Canonical KQXS completeness must be independently enforced by the durable
  // store as well as by result-service. Backups/other callers may bypass the
  // network normalizer, so metadata such as complete=true is never sufficient.
  const RESULT_PRIZE_COUNTS = Object.freeze({
    mn: Object.freeze({ G8:1,G7:1,G6:3,G5:1,G4:7,G3:2,G2:1,G1:1,DB:1 }),
    mt: Object.freeze({ G8:1,G7:1,G6:3,G5:1,G4:7,G3:2,G2:1,G1:1,DB:1 }),
    mb: Object.freeze({ G7:4,G6:3,G5:6,G4:4,G3:6,G2:2,G1:1,DB:1 })
  });

  function resultStationComplete(region, station) {
    const expected = RESULT_PRIZE_COUNTS[String(region || '').toLowerCase()];
    if (!expected || (station && station.complete === false)) return false;
    const raw = station && station.prizes || {};
    const normalized = {};
    for (const [key, values] of Object.entries(raw)) {
      normalized[String(key).toUpperCase()] = (Array.isArray(values) ? values : [values])
        .filter(value => value != null && String(value).trim() !== '');
    }
    return Object.entries(expected).every(([prize,count]) => (normalized[prize] || []).length === count);
  }

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
    const legacyTotal = String(input.total_percent == null ? '100' : input.total_percent);
    const legacyRefund = String(input.refund_percent == null ? '0' : input.refund_percent);
    const legacyDat = input.dat_hit_mode || 'ky_ruoi';
    const legacyDax = input.dax_hit_mode || 'multi_pair';
    const srcTerms = input.region_terms || {};
    const term = (region, field, fallback) => srcTerms[region] && srcTerms[region][field] != null ? srcTerms[region][field] : fallback;
    const mode = value => {
      const v = String(value || '');
      if (!['one_time','ky_ruoi','multi_pair'].includes(v)) throw new Error('INVALID_HIT_MODE:' + v);
      return v;
    };
    const regionTerms = {
      mn: {
        total_percent: String(term('mn','total_percent',legacyTotal)),
        refund_percent: String(term('mn','refund_percent',legacyRefund)),
        dat_hit_mode: mode(term('mn','dat_hit_mode',legacyDat)),
        dax_hit_mode: mode(term('mn','dax_hit_mode',legacyDax))
      },
      mt: {
        total_percent: String(term('mt','total_percent',legacyTotal)),
        refund_percent: String(term('mt','refund_percent',legacyRefund)),
        dat_hit_mode: mode(term('mt','dat_hit_mode',legacyDat)),
        dax_hit_mode: mode(term('mt','dax_hit_mode',legacyDax))
      },
      mb: {
        total_percent: String(term('mb','total_percent',legacyTotal)),
        refund_percent: String(term('mb','refund_percent',legacyRefund)),
        dat_hit_mode: 'multi_pair'
      }
    };
    return {
      id: input.id || `${input.partner_id}:v${version}`,
      partner_id: input.partner_id,
      version,
      effective_from_date: effectiveDate,
      region_pricing: clone(input.region_pricing || {}),
      region_terms: clone(regionTerms),
      dat_hit_mode: legacyDat,
      dax_hit_mode: legacyDax,
      mb_xien_234: Boolean(input.mb_xien_234),
      tinh_ui: Boolean(input.tinh_ui),
      total_percent: legacyTotal,
      refund_percent: legacyRefund,
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
    const requestedStatus = String(input.status || (input.complete ? 'complete' : 'partial')).toLowerCase();
    if (!['partial', 'complete', 'error', 'stale'].includes(requestedStatus)) throw new Error('INVALID_RESULT_STATUS');
    let verificationStatus = String(input.verification_status || (input.verified ? 'verified' : 'unverified')).toLowerCase();
    if (!['unverified', 'verified', 'conflict'].includes(verificationStatus)) verificationStatus = 'unverified';
    const requestedComplete = Boolean(input.complete);
    const fetchedAt = input.fetched_at || nowIso();
    const stations = clone(input.stations || []);
    const expectedStationCodes = Array.isArray(input.expected_station_codes)
      ? input.expected_station_codes.map(x => String(x || '').trim().toLowerCase()).filter(Boolean)
      : [];
    if (new Set(expectedStationCodes).size !== expectedStationCodes.length) throw new Error('RESULT_EXPECTED_STATIONS_DUPLICATE');
    const verificationSources = Array.isArray(input.verification_sources) ? input.verification_sources.map(String) : [];
    const verificationReason = input.verification_reason == null ? null : String(input.verification_reason);
    const verificationConflicts = Array.isArray(input.verification_conflicts) ? input.verification_conflicts.map(String) : [];
    const distinctVerificationSources = new Set(verificationSources.map(x => String(x || '').trim()).filter(Boolean));
    const actualStationCodes = stations.map(row => String(row && row.code || '').trim().toLowerCase()).filter(Boolean);
    if (new Set(actualStationCodes).size !== actualStationCodes.length) throw new Error('RESULT_STATION_DUPLICATE');
    const stationCoverageComplete =
      expectedStationCodes.length > 0 &&
      actualStationCodes.length === expectedStationCodes.length &&
      expectedStationCodes.every(code => actualStationCodes.includes(code));
    const prizeDataComplete = stations.length > 0 && stations.every(station => resultStationComplete(region, station));
    const complete =
      requestedComplete &&
      stationCoverageComplete &&
      prizeDataComplete &&
      requestedStatus !== 'error' &&
      requestedStatus !== 'stale';
    const status = requestedStatus === 'error' || requestedStatus === 'stale'
      ? requestedStatus
      : (complete ? 'complete' : 'partial');
    if (verificationConflicts.length > 0) {
      verificationStatus = 'conflict';
    } else {
      if (!complete && verificationStatus === 'verified') verificationStatus = 'unverified';
      if (verificationStatus === 'verified' && (distinctVerificationSources.size < 2 || !stationCoverageComplete)) verificationStatus = 'unverified';
    }
    const coverageComplete = input.coverage_complete == null ? stationCoverageComplete : Boolean(input.coverage_complete) && stationCoverageComplete;
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
    // Fingerprint is store-owned integrity metadata. Never trust a caller-supplied
    // fingerprint, otherwise changed KQXS could be persisted with changed=false and
    // skip downstream recalculation/audit. Import compatibility is validated separately.
    const fingerprint = stableStringify(core);
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

  function legacyResultFingerprint(input) {
    const businessDate = String(input && input.business_date || '').slice(0, 10);
    const region = String(input && input.region || '').toLowerCase();
    const status = String(input && input.status || (input && input.complete ? 'complete' : 'partial')).toLowerCase();
    let verificationStatus = String(input && input.verification_status || (input && input.verified ? 'verified' : 'unverified')).toLowerCase();
    if (!['unverified','verified','conflict'].includes(verificationStatus)) verificationStatus = 'unverified';
    const complete = Boolean(input && input.complete);
    if (!complete && verificationStatus === 'verified') verificationStatus = 'unverified';
    const expectedStationCodes = Array.isArray(input && input.expected_station_codes)
      ? input.expected_station_codes.map(x => String(x || '').trim().toLowerCase()).filter(Boolean)
      : [];
    const core = {
      business_date: businessDate,
      region,
      status,
      complete,
      coverage_complete: input && input.coverage_complete == null ? null : Boolean(input && input.coverage_complete),
      verification_status: verificationStatus,
      verification_sources: Array.isArray(input && input.verification_sources) ? input.verification_sources.map(String) : [],
      verification_reason: input && input.verification_reason == null ? null : String(input.verification_reason),
      verification_conflicts: Array.isArray(input && input.verification_conflicts) ? input.verification_conflicts.map(String) : [],
      expected_station_codes: expectedStationCodes,
      stations: clone(input && input.stations || [])
    };
    return stableStringify(core);
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

  // Metadata updates from two same-origin tabs must never use a detached
  // read -> put sequence. The caller mutator is synchronous and executes
  // while the metadata readwrite transaction remains active.
  async function mutateMetadataAtomically(key,mutator) {
    if(typeof key!=='string'||!key.trim()||typeof mutator!=='function')
      throw new Error('METADATA_ATOMIC_ARGUMENTS_REQUIRED');
    const db=await openDb();
    let failure=null,result=null;
    try {
      const tx=db.transaction(STORES.metadata,'readwrite');
      const bucket=tx.objectStore(STORES.metadata);
      const req=bucket.get(key);
      req.onsuccess=()=>{
        try {
          const previous=req.result==null?null:clone(req.result);
          const updated=mutator(previous);
          if(updated&&typeof updated.then==='function')
            throw new Error('METADATA_ATOMIC_MUTATOR_MUST_BE_SYNC');
          if(!updated||typeof updated!=='object'||Array.isArray(updated)||
             updated.key!==key)
            throw new Error('METADATA_ATOMIC_RESULT_INVALID');
          result=clone(updated);
          bucket.put(clone(result));
        } catch(error) {
          failure=error;
          tx.abort();
        }
      };
      try{await txDone(tx);}catch(error){throw failure||error;}
      if(!result)throw new Error('METADATA_ATOMIC_COMMIT_MISSING');
      return result;
    }finally{db.close();}
  }


  // Make linked metadata edits (candidate state + golden pin) a single
  // all-or-nothing IndexedDB transaction across multiple browser tabs.
  // All IndexedDB requests are scheduled from active request callbacks;
  // the mutator must be synchronous to avoid transaction auto-close.
  async function mutateMetadataRowsAtomically(keys,mutator) {
    if(!Array.isArray(keys)||!keys.length||new Set(keys).size!==keys.length||
      keys.some(key=>typeof key!=='string'||!key.trim())||
      typeof mutator!=='function')
      throw new Error('METADATA_ROWS_ATOMIC_ARGUMENTS_REQUIRED');
    const db=await openDb();
    let failure=null,outcome=null,completed=false;
    try {
      const tx=db.transaction(STORES.metadata,'readwrite');
      const bucket=tx.objectStore(STORES.metadata);
      const rows=Object.create(null);
      let pending=keys.length;
      for(const key of keys){
        const request=bucket.get(key);
        request.onsuccess=()=>{
          try {
            rows[key]=request.result==null?null:clone(request.result);
            if(--pending!==0)return;
            const edited=mutator(rows);
            if(edited&&typeof edited.then==='function')
              throw new Error('METADATA_ROWS_ATOMIC_MUTATOR_MUST_BE_SYNC');
            if(!edited||typeof edited!=='object'||!edited.rows||
               typeof edited.rows!=='object')
              throw new Error('METADATA_ROWS_ATOMIC_RESULT_INVALID');
            for(const name of keys){
              if(!Object.prototype.hasOwnProperty.call(edited.rows,name))
                throw new Error('METADATA_ROWS_ATOMIC_ROW_MISSING:'+name);
              const value=edited.rows[name];
              if(!value||typeof value!=='object'||Array.isArray(value)||value.key!==name)
                throw new Error('METADATA_ROWS_ATOMIC_ROW_INVALID:'+name);
            }
            for(const name of keys)bucket.put(clone(edited.rows[name]));
            outcome=clone(edited.result);
            completed=true;
          } catch(error){failure=error;tx.abort();}
        };
      }
      try{await txDone(tx);}catch(error){throw failure||error;}
      if(!completed)throw new Error('METADATA_ROWS_ATOMIC_COMMIT_MISSING');
      return outcome;
    }finally{db.close();}
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

  function nextConfigVersionFromRows(rows) {
    return (Array.isArray(rows) ? rows : []).reduce((m, x) => Math.max(m, Number(x && x.version) || 0), 0) + 1;
  }

  async function nextConfigVersion(partnerId) {
    const rows = await listConfigsForPartner(partnerId);
    return nextConfigVersionFromRows(rows);
  }

  async function saveConfig(input) {
    const base = Object.assign({}, input);
    if (!base.partner_id) throw new Error('CONFIG_PARTNER_REQUIRED');
    const autoVersion = base.version == null;
    const db = await openDb();
    return new Promise((resolve, reject) => {
      let value = null;
      let failure = null;
      const tx = db.transaction(STORES.configs, 'readwrite');
      const store = tx.objectStore(STORES.configs);
      const rowsReq = store.index('by_partner').getAll(String(base.partner_id));

      rowsReq.onerror = () => {
        failure = rowsReq.error || new Error('CONFIG_VERSION_READ_FAILED');
        try { tx.abort(); } catch (_) {}
      };
      rowsReq.onsuccess = () => {
        try {
          const copy = Object.assign({}, base);
          if (autoVersion) copy.version = nextConfigVersionFromRows(rowsReq.result || []);
          value = normalizeConfig(copy);
          if (autoVersion) store.add(value);
          else store.put(value);
        } catch (error) {
          failure = error;
          try { tx.abort(); } catch (_) {}
        }
      };
      tx.oncomplete = () => { db.close(); resolve(value); };
      tx.onerror = () => { const err = failure || tx.error || new Error('CONFIG_SAVE_FAILED'); db.close(); reject(err); };
      tx.onabort = () => { const err = failure || tx.error || new Error('CONFIG_SAVE_ABORTED'); db.close(); reject(err); };
    });
  }

  function resolveConfigFromRows(rows, partnerId, businessDate) {
    if (!partnerId) throw new Error('CONFIG_PARTNER_REQUIRED');
    if (!validDateOnly(businessDate)) throw new Error('INVALID_BUSINESS_DATE');
    const eligible = (Array.isArray(rows) ? rows : [])
      .filter(x => String(x && x.partner_id || '') === String(partnerId))
      .map(x => x && x.effective_from_date ? x : Object.assign({}, x, { effective_from_date: String(x && x.effective_from || '').slice(0, 10) }))
      .filter(x => validDateOnly(x.effective_from_date) && x.effective_from_date <= businessDate)
      .sort((a, b) => a.effective_from_date.localeCompare(b.effective_from_date) || Number(a.version || 0) - Number(b.version || 0));
    if (!eligible.length) throw new Error('NO_CONFIG_FOR_BUSINESS_DATE');
    return clone(eligible[eligible.length - 1]);
  }

  async function resolveConfigForDate(partnerId, businessDate) {
    const rows = await listConfigsForPartner(partnerId);
    return resolveConfigFromRows(rows, partnerId, businessDate);
  }

  function assertConfigPartner(configSnapshot, partnerId) {
    if (!configSnapshot) return true;
    if (String(configSnapshot.partner_id || '') !== String(partnerId || '')) throw new Error('CONFIG_PARTNER_MISMATCH');
    return true;
  }

  async function saveMessage(input) {
    if (!input.partner_id) throw new Error('MESSAGE_PARTNER_REQUIRED');
    if (!validDateOnly(input.business_date)) throw new Error('MESSAGE_DATE_REQUIRED');
    const now = nowIso();
    const configSnapshot = input.config_snapshot || await resolveConfigForDate(input.partner_id, input.business_date);
    assertConfigPartner(configSnapshot, input.partner_id);
    if (input.canonical_payload && input.canonical_payload.region &&
        String(input.canonical_payload.region).toLowerCase() !== String(input.region || '').toLowerCase()) {
      throw new Error('MESSAGE_CANONICAL_SCOPE_MISMATCH');
    }
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

  function normalizeSettlement(input) {
    if (!input.partner_id || !validDateOnly(input.business_date)) throw new Error('SETTLEMENT_SCOPE_REQUIRED');
    assertConfigPartner(input.config_snapshot || null, input.partner_id);
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
    return v;
  }

  async function saveSettlement(input) {
    const v=normalizeSettlement(input);
    await put(STORES.settlements,v);
    return v;
  }

  // Atomic compare-and-set: ensures stale HIOSKT shadow updates from another
  // tab cannot overwrite a newer settlement/recalculation. Both validation
  // of expected snapshot and the write run in one serialized IDB transaction.
  async function saveSettlementIfUnchanged(input,expectedSnapshot) {
    const v=normalizeSettlement(input);
    if(!expectedSnapshot || String(expectedSnapshot.id||'')!==String(v.id))
      throw new Error('SETTLEMENT_CAS_EXPECTED_SCOPE_REQUIRED');
    const db=await openDb();
    try {
      const tx=db.transaction(STORES.settlements,'readwrite');
      const bucket=tx.objectStore(STORES.settlements);
      let outcome=null;
      const req=bucket.get(v.id);
      req.onsuccess=()=>{
        const previous=req.result||null;
        if(!previous||stableStringify(previous)!==stableStringify(expectedSnapshot)){
          outcome={saved:null,superseded:true};
          return;
        }
        bucket.put(clone(v));
        outcome={saved:v,superseded:false};
      };
      await txDone(tx);
      if(!outcome)throw new Error('SETTLEMENT_CAS_FAILED');
      return outcome;
    } finally {db.close();}
  }

  // Monetary settlement + message statuses must commit only when every
  // input observed by the evaluator still matches in ONE IndexedDB transaction.
  // This closes the cross-tab gap between pipeline's read/recheck and write.
  // Reads and writes span the SAME five object stores; no async awaits occur
  // inside onsuccess handlers, preserving transaction activity.
  async function saveSettlementIfScopeUnchanged(input, expected) {
    const v=normalizeSettlement(input);
    const scope=`scope:${v.partner_id}:${v.business_date}:${String(v.region||'').toLowerCase()}`;
    const monetary=['complete_unverified','provisional'].includes(v.scope_status);
    if (v.id!==scope || !['mn','mt','mb'].includes(String(v.region||'')) ||
        !(monetary || ['blocked','empty'].includes(v.scope_status)))
      throw new Error('SETTLEMENT_ATOMIC_SCOPE_INVALID');
    if (!expected || !Array.isArray(expected.messages) ||
        !Object.prototype.hasOwnProperty.call(expected,'config') ||
        !Object.prototype.hasOwnProperty.call(expected,'result') ||
        !Object.prototype.hasOwnProperty.call(expected,'partner') ||
        !Object.prototype.hasOwnProperty.call(expected,'settlement') ||
        (monetary && (!expected.config || !expected.result || !expected.partner)))
      throw new Error('SETTLEMENT_ATOMIC_EVIDENCE_REQUIRED');
    const db=await openDb();
    try {
      const tx=db.transaction(
        [STORES.messages,STORES.configs,STORES.results,STORES.partners,STORES.settlements],
        'readwrite');
      const messages=tx.objectStore(STORES.messages);
      const settlementBucket=tx.objectStore(STORES.settlements);
      const requests=[
        messages.index('by_partner_date').getAll([v.partner_id,v.business_date]),
        tx.objectStore(STORES.configs).index('by_partner').getAll(v.partner_id),
        tx.objectStore(STORES.results).get(`${v.business_date}:${v.region}`),
        tx.objectStore(STORES.partners).get(v.partner_id),
        settlementBucket.get(v.id)
      ];
      const rows=new Array(requests.length);
      let completed=0,outcome=null;
      requests.forEach((request,index)=>{
        request.onsuccess=()=>{
          rows[index]=request.result;
          completed++;
          if(completed!==requests.length)return;
          const liveMessages=(rows[0]||[])
            .filter(x=>String(x.region||'').toLowerCase()===v.region &&
              String(x.status||'').toLowerCase()!=='cancelled')
            .sort((a,b)=>String(a.id).localeCompare(String(b.id)));
          const seenMessages=expected.messages.slice()
            .sort((a,b)=>String(a.id).localeCompare(String(b.id)));
          let liveConfig=null;
          try {
            liveConfig=resolveConfigFromRows(rows[1]||[],v.partner_id,v.business_date);
          } catch (_) { /* Missing/invalid config cannot authorize money. */ }
          const same=(a,b)=>stableStringify(a==null?null:a)===
            stableStringify(b==null?null:b);
          if(!same(liveMessages,seenMessages) ||
              !same(liveConfig,expected.config) ||
              !same(rows[2],expected.result) ||
              !same(rows[3],expected.partner) ||
              !same(rows[4],expected.settlement)) {
            outcome={saved:null,superseded:true};
            return;
          }
          // Keep each message's settled status and monetary result in the
          // same atomic transaction; never mutate a newer edited bet afterward.
          // EMPTY/BLOCKED must never rewrite message statuses; their scope
          // record still requires atomic input and prior-settlement validation.
          if(!monetary) {
            settlementBucket.put(clone(v));
            outcome={saved:v,superseded:false};
            return;
          }
          // Verify every message's config BEFORE issuing any writes.
          const messageConfigs=liveMessages.map(message=>
            message.config_snapshot||liveConfig);
          if(messageConfigs.some(c=>c &&
              String(c.partner_id||'')!==String(v.partner_id))) {
            outcome={saved:null,superseded:true};
            return;
          }
          const status=v.scope_status==='complete_unverified'
            ? 'settled_unverified':'settled_provisional';
          const timestamp=nowIso();
          liveMessages.forEach((message,index)=>{
            messages.put(Object.assign({},message,{
              status,config_snapshot:clone(messageConfigs[index]),updated_at:timestamp
            }));
          });
          settlementBucket.put(clone(v));
          outcome={saved:v,superseded:false};
        };
      });
      await txDone(tx);
      if(!outcome)throw new Error('SETTLEMENT_ATOMIC_COMMIT_FAILED');
      return outcome;
    } finally {db.close();}
  }

  function resultSnapshotIsOlder(candidate, previous) {
    if (!candidate || !previous) return false;
    const candidateMs = Date.parse(String(candidate.fetched_at || ''));
    const previousMs = Date.parse(String(previous.fetched_at || ''));
    return Number.isFinite(candidateMs) && Number.isFinite(previousMs) && candidateMs < previousMs;
  }

  async function saveResultSnapshot(input) {
    const v = normalizeResultSnapshot(input);
    const db = await openDb();
    let outcome = null;
    try {
      // Read freshness + write snapshot + append audit event atomically.
      // IndexedDB serializes overlapping readwrite transactions, so a slower
      // stale request cannot overwrite a newer KQXS snapshot from another UI path/tab.
      const tx = db.transaction([STORES.results, STORES.resultEvents], 'readwrite');
      const resultStore = tx.objectStore(STORES.results);
      const eventStore = tx.objectStore(STORES.resultEvents);
      const req = resultStore.get(v.id);
      req.onsuccess = () => {
        const previous = req.result || null;
        if (previous && resultSnapshotIsOlder(v, previous)) {
          outcome = { snapshot: clone(previous), changed: false, previous: clone(previous), stale_ignored: true };
          return;
        }
        const changed = !previous || previous.fingerprint !== v.fingerprint;
        resultStore.put(clone(v));
        if (changed) {
          eventStore.put(Object.assign({}, clone(v), {
            id: makeId('result_event'),
            result_id: v.id,
            observed_at: nowIso()
          }));
        }
        outcome = { snapshot: clone(v), changed, previous: previous ? clone(previous) : null, stale_ignored: false };
      };
      await txDone(tx);
      if (!outcome) throw new Error('RESULT_SAVE_FAILED');
      return outcome;
    } finally { db.close(); }
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
    const db = await openDb();
    try {
      // The last-event check and append MUST share one readwrite transaction.
      // IndexedDB serializes overlapping scope journal writers across tabs:
      // separate listShadowEvents() / put() transactions could both pass the
      // duplicate test and silently append the same financial evidence twice.
      const tx = db.transaction(STORES.shadowEvents, 'readwrite');
      const bucket = tx.objectStore(STORES.shadowEvents);
      const request = bucket.index('by_scope_id').getAll(event.scope_id);
      let outcome = null;
      request.onsuccess = () => {
        const rows = (request.result || []).slice().sort((a, b) =>
          String(a.observed_at || '').localeCompare(String(b.observed_at || '')) ||
          String(a.id || '').localeCompare(String(b.id || '')));
        const previous = rows.length ? rows[rows.length - 1] : null;
        if (previous && previous.evidence_fingerprint === event.evidence_fingerprint) {
          outcome = { event: clone(previous), changed: false, previous: clone(previous) };
          return;
        }
        // add, not put: duplicate caller-supplied event IDs must abort rather
        // than overwriting a prior audit receipt, even across browsing tabs.
        bucket.add(clone(event));
        outcome = { event, changed: true, previous: previous ? clone(previous) : null };
      };
      await txDone(tx);
      if (!outcome) throw new Error('SHADOW_EVENT_ATOMIC_APPEND_FAILED');
      return outcome;
    } finally { db.close(); }
  }

  async function exportAll() {
    // All store snapshots must come from the SAME IndexedDB transaction.
    // Independent getAll() calls can interleave with another tab's commits
    // and export a mismatched message/config/settlement/evidence backup.
    const db=await openDb();
    try {
      const names=Object.values(STORES);
      const payload={format:'kts-settlement-export',version:5,
        exported_at:nowIso(),stores:{}};
      const tx=db.transaction(names,'readonly');
      for(const name of names){
        const request=tx.objectStore(name).getAll();
        request.onsuccess=()=>{payload.stores[name]=clone(request.result||[]);};
      }
      await txDone(tx);
      if(names.some(name=>!Object.prototype.hasOwnProperty.call(payload.stores,name)))
        throw new Error('EXPORT_ATOMIC_SNAPSHOT_INCOMPLETE');
      return payload;
    }finally{db.close();}
  }

  function validateImportPayload(payload, existingByStore, options) {
    const replace = Boolean(options && options.replace);
    if (!payload || payload.format !== 'kts-settlement-export' || ![1, 2, 3, 4, 5].includes(payload.version)) throw new Error('INVALID_KTS_EXPORT');
    if (!payload.stores || typeof payload.stores !== 'object' || Array.isArray(payload.stores)) throw new Error('INVALID_KTS_EXPORT_STORES');

    const existing = existingByStore || {};
    const incoming = {};
    const keyForStore = name => name === STORES.metadata ? 'key' : 'id';
    for (const name of Object.values(STORES)) {
      const rows = payload.stores[name] == null ? [] : payload.stores[name];
      if (!Array.isArray(rows)) throw new Error('INVALID_KTS_EXPORT_STORE:' + name);
      const seen = new Set();
      incoming[name] = rows.map(row => {
        if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('INVALID_KTS_EXPORT_ROW:' + name);
        const keyField = keyForStore(name);
        const key = String(row[keyField] == null ? '' : row[keyField]);
        if (!key) throw new Error('INVALID_KTS_EXPORT_KEY:' + name);
        if (seen.has(key)) throw new Error('DUPLICATE_KTS_EXPORT_KEY:' + name + ':' + key);
        seen.add(key);
        return row;
      });
    }

    // Imported financial evidence is NOT ordinary mergeable metadata. The
    // old merge path silently skipped same-key rows, including a different
    // operator-confirmed HIOSKT oracle or a different READY history.
    const protectedKeys=[
      'qualification_history_v1',
      'shadow_regression_cases_v1',
      'shadow_regression_candidates_v1'
    ];
    const priorMeta=new Map((replace?[]:(existing[STORES.metadata]||[]))
      .map(row=>[String(row&&row.key||''),row]));
    const importedMeta=new Map(incoming[STORES.metadata]
      .map(row=>[String(row.key),row]));
    for(const key of protectedKeys){
      const row=importedMeta.get(key);
      if(!row)continue;
      const prior=priorMeta.get(key);
      if(prior&&stableStringify(prior)!==stableStringify(row))
        throw new Error('IMPORT_PROTECTED_EVIDENCE_COLLISION:'+key);
      if(row.version!==1)
        throw new Error('IMPORT_PROTECTED_EVIDENCE_VERSION_INVALID:'+key);
      if(key==='qualification_history_v1'){
        const history=global.KTS_SETTLEMENT_QUALIFICATION_HISTORY;
        if(!history||typeof history.validateJournalRow!=='function'||
           typeof history.validateHistoryEvents!=='function')
          throw new Error('IMPORT_EVIDENCE_VALIDATOR_UNAVAILABLE:'+key);
        const shape=history.validateJournalRow(row);
        const events=shape.valid?history.validateHistoryEvents(row.events):shape;
        if(!events.valid)
          throw new Error('IMPORT_QUALIFICATION_EVIDENCE_INVALID:'+events.reason);
        continue;
      }
      const golden=global.KTS_SETTLEMENT_REGRESSION_CASES;
      if(!golden||typeof golden.normalizeCase!=='function')
        throw new Error('IMPORT_EVIDENCE_VALIDATOR_UNAVAILABLE:'+key);
      if(key==='shadow_regression_cases_v1'){
        if(!Array.isArray(row.cases))throw new Error('IMPORT_GOLDEN_NOT_ARRAY');
        const ids=new Set(),events=new Set();
        for(const source of row.cases){
          const checked=golden.normalizeCase(source);
          if(ids.has(checked.id))throw new Error('IMPORT_GOLDEN_DUPLICATE_ID');
          ids.add(checked.id);
          if(checked.source_event_id){
            if(events.has(checked.source_event_id))
              throw new Error('IMPORT_GOLDEN_DUPLICATE_SOURCE');
            events.add(checked.source_event_id);
          }
        }
      }else{
        const candidates=global.KTS_SETTLEMENT_REGRESSION_CANDIDATES;
        if(!candidates||typeof candidates.normalizeCandidate!=='function')
          throw new Error('IMPORT_EVIDENCE_VALIDATOR_UNAVAILABLE:'+key);
        if(!Array.isArray(row.candidates))
          throw new Error('IMPORT_CANDIDATES_NOT_ARRAY');
        const ids=new Set(),events=new Set();
        for(const source of row.candidates){
          const c=candidates.normalizeCandidate(source);
          if(c.id!=='candidate:'+c.source_event_id)
            throw new Error('IMPORT_CANDIDATE_SOURCE_ID_MISMATCH');
          if(c.case.source_event_id!=null&&
             String(c.case.source_event_id)!==c.source_event_id)
            throw new Error('IMPORT_CANDIDATE_CASE_SOURCE_MISMATCH');
          golden.normalizeCase(c.case);
          if(ids.has(c.id)||events.has(c.source_event_id))
            throw new Error('IMPORT_CANDIDATE_DUPLICATE_SOURCE');
          ids.add(c.id);events.add(c.source_event_id);
          const date=value=>typeof value==='string'&&
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)&&
            Number.isFinite(Date.parse(value));
          if(c.state==='promoted'&&
             (!date(c.promoted_at)||!c.confirmation_note.trim()||c.dismissed_at!=null))
            throw new Error('IMPORT_CANDIDATE_PROMOTION_RECEIPT_MISSING');
          if(c.state==='dismissed'&&
             (!date(c.dismissed_at)||!c.dismiss_reason.trim()||c.promoted_at!=null))
            throw new Error('IMPORT_CANDIDATE_DISMISS_RECEIPT_MISSING');
        }
      }
    }
    // Cross-check the *effective* metadata after merging; a promoted
    // candidate may never be restored without its exact confirmed golden.
    const candidateRow=importedMeta.get('shadow_regression_candidates_v1')||
      priorMeta.get('shadow_regression_candidates_v1');
    const goldenRow=importedMeta.get('shadow_regression_cases_v1')||
      priorMeta.get('shadow_regression_cases_v1');
    if(candidateRow&&(importedMeta.has('shadow_regression_candidates_v1')||
       importedMeta.has('shadow_regression_cases_v1'))){
      const golden=global.KTS_SETTLEMENT_REGRESSION_CASES;
      if(!golden||typeof golden.normalizeCase!=='function')
        throw new Error('IMPORT_EVIDENCE_VALIDATOR_UNAVAILABLE:golden');
      const cases=goldenRow&&Array.isArray(goldenRow.cases)?goldenRow.cases:[];
      const claimed=new Set();
      for(const source of candidateRow.candidates||[]){
        if(String(source&&source.state||'').toLowerCase()!=='promoted')continue;
        const c=golden.normalizeCase(source.case);
        const actual=cases.filter(g=>g&&g.id===c.id);
        if(actual.length!==1||stableStringify(actual[0])!==stableStringify(c))
          throw new Error('IMPORT_PROMOTED_GOLDEN_LINK_INVALID');
        if(claimed.has(c.id))throw new Error('IMPORT_GOLDEN_CLAIM_DUPLICATE');
        claimed.add(c.id);
      }
    }

    const incomingPartners = incoming[STORES.partners];
    const existingPartners = replace ? [] : (existing[STORES.partners] || []);
    const partnerIds = new Set([...existingPartners, ...incomingPartners].map(row => String(row && row.id || '')).filter(Boolean));
    const existingPartnerMap = new Map(existingPartners.map(row => [String(row && row.id || ''), row]));
    for (const row of incomingPartners) {
      if (!String(row.id || '')) throw new Error('IMPORT_PARTNER_ID_REQUIRED');
      const normalized = normalizePartner(row);
      const prior = existingPartnerMap.get(String(row.id));
      if (prior && String(prior.role || '').toLowerCase() !== String(normalized.role || '').toLowerCase()) {
        throw new Error('IMPORT_PARTNER_ROLE_COLLISION:' + String(row.id));
      }
    }

    const requirePartner = (row, storeName) => {
      const partnerId = String(row && row.partner_id || '');
      if (!partnerId || !partnerIds.has(partnerId)) throw new Error('IMPORT_UNKNOWN_PARTNER:' + storeName + ':' + partnerId);
      return partnerId;
    };
    const validRegion = value => ['mn','mt','mb'].includes(String(value || '').toLowerCase());
    const existingMap = name => new Map((replace ? [] : (existing[name] || [])).map(row => [String(row && row[keyForStore(name)] || ''), row]));

    for (const row of incoming[STORES.configs]) {
      const partnerId = requirePartner(row, STORES.configs);
      const normalized = normalizeConfig(row);
      if (String(row.id) !== partnerId + ':v' + String(normalized.version)) throw new Error('IMPORT_CONFIG_ID_SCOPE_MISMATCH:' + String(row.id));
      const prior = existingMap(STORES.configs).get(String(row.id));
      if (prior && String(prior.partner_id || '') !== partnerId) throw new Error('IMPORT_ID_SCOPE_COLLISION:' + STORES.configs + ':' + String(row.id));
      if (prior) {
        const priorNormalized = normalizeConfig(prior);
        const configCore = value => ({
          partner_id:value.partner_id, version:value.version, effective_from_date:value.effective_from_date,
          region_pricing:value.region_pricing, region_terms:value.region_terms,
          mb_xien_234:value.mb_xien_234, tinh_ui:value.tinh_ui,
          commission_type:value.commission_type
        });
        if (stableStringify(configCore(priorNormalized)) !== stableStringify(configCore(normalized))) {
          throw new Error('IMPORT_CONFIG_CONTENT_COLLISION:' + String(row.id));
        }
      }
    }

    const combinedMessages = new Map();
    for (const row of (replace ? [] : (existing[STORES.messages] || []))) combinedMessages.set(String(row.id || ''), row);
    for (const row of incoming[STORES.messages]) {
      const partnerId = requirePartner(row, STORES.messages);
      if (!validDateOnly(String(row.business_date || ''))) throw new Error('IMPORT_MESSAGE_DATE_INVALID:' + String(row.id));
      if (!validRegion(row.region)) throw new Error('IMPORT_MESSAGE_REGION_INVALID:' + String(row.id));
      assertConfigPartner(row.config_snapshot || null, partnerId);
      if (row.canonical_payload && row.canonical_payload.region &&
          String(row.canonical_payload.region).toLowerCase() !== String(row.region).toLowerCase()) {
        throw new Error('MESSAGE_CANONICAL_SCOPE_MISMATCH');
      }
      const prior = existingMap(STORES.messages).get(String(row.id));
      if (prior && String(prior.partner_id || '') !== partnerId) throw new Error('IMPORT_ID_SCOPE_COLLISION:' + STORES.messages + ':' + String(row.id));
      if (prior) {
        const messageCore = value => ({
          partner_id:String(value.partner_id || ''),
          business_date:String(value.business_date || ''),
          region:String(value.region || '').toLowerCase(),
          raw_text:String(value.raw_text || ''),
          canonical_payload:value.canonical_payload || null,
          canonical_version:value.canonical_version == null ? null : String(value.canonical_version),
          parser_error:value.parser_error == null ? null : String(value.parser_error)
        });
        if (stableStringify(messageCore(prior)) !== stableStringify(messageCore(row))) {
          throw new Error('IMPORT_MESSAGE_CONTENT_COLLISION:' + String(row.id));
        }
      }
      combinedMessages.set(String(row.id), prior || row);
    }

    for (const row of incoming[STORES.settlements]) {
      const partnerId = requirePartner(row, STORES.settlements);
      if (!validDateOnly(String(row.business_date || '')) || !validRegion(row.region)) throw new Error('IMPORT_SETTLEMENT_SCOPE_INVALID:' + String(row.id));
      const expectedScopeId = `scope:${partnerId}:${String(row.business_date)}:${String(row.region).toLowerCase()}`;
      if (String(row.id || '') !== expectedScopeId) throw new Error('IMPORT_SETTLEMENT_ID_SCOPE_MISMATCH:' + String(row.id));
      assertConfigPartner(row.config_snapshot || null, partnerId);
      const prior = existingMap(STORES.settlements).get(String(row.id));
      if (prior && String(prior.partner_id || '') !== partnerId) throw new Error('IMPORT_ID_SCOPE_COLLISION:' + STORES.settlements + ':' + String(row.id));
      const messageIds = Array.isArray(row.message_ids) ? row.message_ids.map(String) : (row.message_id ? [String(row.message_id)] : []);
      if (new Set(messageIds).size !== messageIds.length) throw new Error('IMPORT_SETTLEMENT_MESSAGE_DUPLICATE:' + String(row.id));
      for (const messageId of messageIds) {
        const message = combinedMessages.get(String(messageId));
        if (!message) throw new Error('IMPORT_SETTLEMENT_MESSAGE_MISSING:' + String(row.id) + ':' + String(messageId));
        if (String(message.status || '').toLowerCase() === 'cancelled') throw new Error('IMPORT_SETTLEMENT_REFERENCES_CANCELLED_MESSAGE:' + String(row.id) + ':' + String(messageId));
        if (String(message.partner_id || '') !== partnerId ||
            String(message.business_date || '') !== String(row.business_date || '') ||
            String(message.region || '').toLowerCase() !== String(row.region || '').toLowerCase()) {
          throw new Error('IMPORT_SETTLEMENT_MESSAGE_SCOPE_MISMATCH:' + String(row.id) + ':' + String(messageId));
        }
      }
      const activeScopeMessageIds = [...combinedMessages.values()]
        .filter(message =>
          String(message.partner_id || '') === partnerId &&
          String(message.business_date || '') === String(row.business_date || '') &&
          String(message.region || '').toLowerCase() === String(row.region || '').toLowerCase() &&
          String(message.status || '').toLowerCase() !== 'cancelled')
        .map(message => String(message.id))
        .sort();
      const settlementMessageIds = messageIds.slice().sort();
      const scopeStatus = String(row.scope_status || '').toLowerCase();
      if (scopeStatus === 'empty' && activeScopeMessageIds.length) {
        throw new Error('IMPORT_EMPTY_SETTLEMENT_HAS_ACTIVE_MESSAGES:' + String(row.id));
      }
      if (scopeStatus !== 'empty' && !activeScopeMessageIds.length) {
        throw new Error('IMPORT_STALE_SETTLEMENT_WITHOUT_ACTIVE_MESSAGES:' + String(row.id));
      }
      if (stableStringify(activeScopeMessageIds) !== stableStringify(settlementMessageIds)) {
        throw new Error('IMPORT_SETTLEMENT_ACTIVE_MESSAGE_SET_MISMATCH:' + String(row.id));
      }
      if (scopeStatus === 'empty') {
        const totals = row.result_snapshot || row.settlement_result || {};
        for (const field of ['total_xac','total_qua_co','total_payout','refund_amount','final_net']) {
          if (Number(totals[field] || 0) !== 0) throw new Error('IMPORT_EMPTY_SETTLEMENT_NONZERO:' + String(row.id) + ':' + field);
        }
      }
    }

    const combinedResults = new Map();
    for (const row of (replace ? [] : (existing[STORES.results] || []))) combinedResults.set(String(row.id || ''), row);
    for (const row of incoming[STORES.results]) {
      const normalized = normalizeResultSnapshot(row);
      const recomputed = normalizeResultSnapshot(Object.assign({}, row, { fingerprint: null }));
      const expectedResultId = `${normalized.business_date}:${normalized.region}`;
      if (String(row.id || '') !== expectedResultId) throw new Error('IMPORT_RESULT_ID_SCOPE_MISMATCH:' + String(row.id));
      if (row.fingerprint != null) {
        const supplied = String(row.fingerprint);
        const legacy = legacyResultFingerprint(row);
        if (supplied !== String(recomputed.fingerprint) && supplied !== legacy) {
          throw new Error('IMPORT_RESULT_FINGERPRINT_MISMATCH:' + String(row.id));
        }
      }
      combinedResults.set(String(row.id), row);
    }
    for (const row of incoming[STORES.resultEvents]) {
      if (!validDateOnly(String(row.business_date || '')) || !validRegion(row.region)) throw new Error('IMPORT_RESULT_EVENT_SCOPE_INVALID:' + String(row.id));
      const expectedResultId = `${String(row.business_date)}:${String(row.region).toLowerCase()}`;
      if (row.result_id != null && String(row.result_id) !== expectedResultId) throw new Error('IMPORT_RESULT_EVENT_ID_SCOPE_MISMATCH:' + String(row.id));
      if (row.result_id != null && !combinedResults.has(String(row.result_id))) throw new Error('IMPORT_RESULT_EVENT_RESULT_MISSING:' + String(row.id));
      const recomputed = normalizeResultSnapshot(Object.assign({}, row, { id: expectedResultId, fingerprint: null }));
      if (row.fingerprint != null) {
        const supplied = String(row.fingerprint);
        const legacy = legacyResultFingerprint(row);
        if (supplied !== String(recomputed.fingerprint) && supplied !== legacy) {
          throw new Error('IMPORT_RESULT_EVENT_FINGERPRINT_MISMATCH:' + String(row.id));
        }
      }
    }
    for (const row of incoming[STORES.shadowEvents]) {
      const partnerId = requirePartner(row, STORES.shadowEvents);
      const normalized = normalizeShadowEvent(row);
      const recomputedShadow = normalizeShadowEvent(Object.assign({}, row, { evidence_fingerprint: null }));
      if (String(normalized.partner_id) !== partnerId) throw new Error('IMPORT_SHADOW_PARTNER_MISMATCH:' + String(row.id));
      const expectedScopeId = `scope:${partnerId}:${normalized.business_date}:${normalized.region}`;
      if (String(normalized.scope_id || '') !== expectedScopeId) throw new Error('IMPORT_SHADOW_SCOPE_ID_MISMATCH:' + String(row.id));
      if (row.evidence_fingerprint != null && String(row.evidence_fingerprint) !== String(recomputedShadow.evidence_fingerprint)) {
        throw new Error('IMPORT_SHADOW_FINGERPRINT_MISMATCH:' + String(row.id));
      }
      const prior = existingMap(STORES.shadowEvents).get(String(row.id));
      if (prior && String(prior.partner_id || '') !== partnerId) throw new Error('IMPORT_ID_SCOPE_COLLISION:' + STORES.shadowEvents + ':' + String(row.id));
    }

    const counts = {};
    const inserted_counts = {};
    const skipped_existing_counts = {};
    for (const name of Object.values(STORES)) {
      counts[name] = incoming[name].length;
      const existingKeys = new Set((replace ? [] : (existing[name] || [])).map(row => String(row && row[keyForStore(name)] || '')));
      skipped_existing_counts[name] = incoming[name].filter(row => existingKeys.has(String(row[keyForStore(name)]))).length;
      inserted_counts[name] = counts[name] - skipped_existing_counts[name];
    }
    return { valid: true, replace, counts, inserted_counts, skipped_existing_counts };
  }

  async function importAll(payload, options) {
    const replace = Boolean(options && options.replace);
    const existing = {};
    for (const name of Object.values(STORES)) existing[name] = replace ? [] : await getAll(name);
    const validation = validateImportPayload(payload, existing, { replace });
    // replace:true is not a license to erase a confirmed HIOSKT golden,
    // operator decision, or immutable qualification journal. This is an API
    // boundary even though the regular UI only requests merge (replace:false).
    const protectedKeys=[
      'qualification_history_v1',
      'shadow_regression_cases_v1',
      'shadow_regression_candidates_v1'
    ];
    const evidenceSnapshot=replace?await getAll(STORES.metadata):
      existing[STORES.metadata]||[];
    if(replace){
      const persisted=new Map(evidenceSnapshot.map(row=>[String(row&&row.key||''),row]));
      const incoming=new Map(((payload.stores&&payload.stores[STORES.metadata])||[])
        .map(row=>[String(row&&row.key||''),row]));
      for(const key of protectedKeys){
        const old=persisted.get(key);
        if(old&&(!incoming.has(key)||
           stableStringify(old)!==stableStringify(incoming.get(key))))
          throw new Error('IMPORT_REPLACE_PROTECTED_EVIDENCE_DENIED:'+key);
      }
    }

    const db = await openDb();
    try {
      const names = Object.values(STORES);
      const tx = db.transaction(names, 'readwrite');
      const keyForStore = name => name === STORES.metadata ? 'key' : 'id';
      // Cross-tab protection must be checked INSIDE the write transaction.
      // The earlier preflight alone cannot prove that an operator's HIOSKT
      // candidate, pinned golden or READY journal remained unchanged while
      // another browser tab was writing to the same IndexedDB database.
      let evidenceRace=null;
      // The same cross-tab CAS also protects a replace import; an earlier
      // snapshot may have changed while any ordinary store was being read.
      {
        const readSnapshot=new Map(evidenceSnapshot
          .map(row=>[String(row&&row.key||''),row]));
        const metadata=tx.objectStore(STORES.metadata);
        for(const key of protectedKeys){
          const req=metadata.get(key);
          req.onsuccess=()=>{
            try{
              const previous=readSnapshot.get(key)||null;
              const current=req.result||null;
              if(stableStringify(current)!==stableStringify(previous))
                throw new Error('IMPORT_PROTECTED_EVIDENCE_CHANGED_DURING_IMPORT:'+key);
            }catch(error){
              evidenceRace=error;
              try{tx.abort();}catch(_){/* already aborted */ }
            }
          };
        }
      }
      for (const name of names) {
        const store = tx.objectStore(name);
        if (replace) {
          store.clear();
          for (const row of ((payload.stores && payload.stores[name]) || [])) {
            const value = name === STORES.results ? normalizeResultSnapshot(row) : clone(row);
            store.put(value);
          }
          continue;
        }
        const existingKeys = new Set((existing[name] || []).map(row => String(row && row[keyForStore(name)] || '')));
        for (const row of ((payload.stores && payload.stores[name]) || [])) {
          const key = String(row && row[keyForStore(name)] || '');
          if (existingKeys.has(key)) continue;
          // add(), not put(): if another tab inserts the same key after validation,
          // abort rather than overwrite newer local data.
          const value = name === STORES.results ? normalizeResultSnapshot(row) : clone(row);
          store.add(value);
        }
      }
      try {await txDone(tx);}catch(error){throw evidenceRace||error;}
    } finally { db.close(); }
    return validation;
  }

  global.KTS_SETTLEMENT_STORE = Object.freeze({
    DB_NAME, DB_VERSION, STORES, openDb, mutateMetadataAtomically, mutateMetadataRowsAtomically,
    savePartner, saveConfig, listConfigsForPartner, resolveConfigForDate,
    saveMessage, saveSettlement, saveSettlementIfUnchanged, saveSettlementIfScopeUnchanged, saveResultSnapshot, saveShadowEvent, listShadowEvents,
    get, getAll, remove, exportAll, importAll,
    normalizePartner, normalizeConfig, normalizeResultSnapshot, normalizeShadowEvent, assertConfigPartner, resolveConfigFromRows, nextConfigVersionFromRows, validateImportPayload, resultSnapshotIsOlder, stableStringify
  });
})(typeof window !== 'undefined' ? window : globalThis);