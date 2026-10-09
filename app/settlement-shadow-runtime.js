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

  function strictMoney(value, label) {
    if (typeof value !== 'string' && typeof value !== 'number') throw new Error(label);
    const s = String(value).trim();
    if (!/^[+-]?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?$/.test(s) || !Number.isFinite(Number(s)))
      throw new Error(label);
    // Preserve decimal text instead of truncating 64-bit precision when
    // importing reference amounts from HIOSKT into shadow exact comparison.
    return typeof value === 'string' ? s : value;
  }

  function normalizeReference(input) {
    const ref = input && typeof input === 'object' ? clone(input) : {};
    if (Object.prototype.hasOwnProperty.call(ref,'totals') &&
        (!ref.totals || typeof ref.totals!=='object' || Array.isArray(ref.totals)))
      throw new Error('HIOSKT_TOTALS_INVALID');
    const totals = ref.totals || {};
    if (Object.prototype.hasOwnProperty.call(ref,'categories') && !Array.isArray(ref.categories))
      throw new Error('HIOSKT_CATEGORIES_INVALID');
    const normalized = { totals: {}, categories: [] };
    const canon=global.KTS_SETTLEMENT_SHADOW && global.KTS_SETTLEMENT_SHADOW.decimalCanonical;
    // Equal numbers may be written 0, 0.00 or 0e0; never compare their
    // decimal evidence by IEEE-754 Number or raw string formatting.
    const equalMoney=(left,right)=>typeof canon==='function'
      ? canon(left)===canon(right) : String(left).trim()===String(right).trim();
    const groups={
      xac:['total_xac','xac'],
      qua_co:['total_qua_co','qua_co'],
      payout:['total_payout','payout','tien_trung'],
      hoi:['refund_amount','refund','hoi'],
      final:['final_net','final','thu_bu']
    };
    // Preserve ALL known names found in nested totals or top-level input:
    // otherwise an imported conflicting alias can vanish before comparison.
    for (const [group,aliases] of Object.entries(groups)) {
      let previous=null;
      for (const key of aliases) {
        for (const source of [totals,ref]) {
          if (!Object.prototype.hasOwnProperty.call(source,key)) continue;
          const raw=source[key];
          if (raw==null || raw==='') continue;
          const amount=strictMoney(raw,'HIOSKT_REFERENCE_INVALID:'+key);
          if (previous!==null && !equalMoney(previous,amount))
            throw new Error('HIOSKT_TOTAL_ALIAS_CONFLICT:'+group);
          if (!Object.prototype.hasOwnProperty.call(normalized.totals,key))
            normalized.totals[key]=amount;
          previous=amount;
        }
      }
    }

    // Preserve explicit oracle exact proof instead of silently stripping it.
    // The comparison must see disagreement between displayed and exact money.
    if (Object.prototype.hasOwnProperty.call(totals,'exact')) {
      if (!totals.exact || typeof totals.exact!=='object' || Array.isArray(totals.exact))
        throw new Error('HIOSKT_TOTAL_EXACT_INVALID');
      const aliases={xac:'total_xac',total_xac:'total_xac',
        qua_co:'total_qua_co',total_qua_co:'total_qua_co',
        payout:'total_payout',total_payout:'total_payout',tien_trung:'total_payout',
        hoi:'refund_amount',refund:'refund_amount',refund_amount:'refund_amount',
        final:'final_net',final_net:'final_net',thu_bu:'final_net'};
      normalized.totals.exact={};
      for (const [name,value] of Object.entries(totals.exact)) {
        const field=aliases[name];
        if (!field) throw new Error('HIOSKT_TOTAL_EXACT_UNKNOWN:'+name);
        const amount=strictMoney(value,'HIOSKT_TOTAL_EXACT_INVALID:'+name);
        if (Object.prototype.hasOwnProperty.call(normalized.totals.exact,field) &&
            !equalMoney(normalized.totals.exact[field],amount))
          throw new Error('HIOSKT_TOTAL_EXACT_ALIAS_CONFLICT:'+field);
        normalized.totals.exact[field]=amount;
      }
    }
    if (Array.isArray(ref.categories)) {
      normalized.categories = ref.categories.map(row => {
        if (!row || !row.code) throw new Error('HIOSKT_CATEGORY_CODE_REQUIRED');
        const out = { code: String(row.code).toUpperCase() };
        for (const field of ['xac', 'qua_co', 'hit_units', 'payout']) {
          if (row[field] == null || row[field] === '') continue;
          out[field] = strictMoney(row[field],'HIOSKT_CATEGORY_INVALID:' + field);
        }
        if (Object.prototype.hasOwnProperty.call(row,'exact')) {
          if (!row.exact || typeof row.exact!=='object' || Array.isArray(row.exact))
            throw new Error('HIOSKT_CATEGORY_EXACT_INVALID');
          out.exact={};
          for (const [name,value] of Object.entries(row.exact)) {
            if (!['xac','qua_co','hit_units','payout'].includes(name))
              throw new Error('HIOSKT_CATEGORY_EXACT_UNKNOWN:'+name);
            out.exact[name]=strictMoney(value,'HIOSKT_CATEGORY_EXACT_INVALID:'+name);
          }
        }
        return out;
      });
    }
    normalized.captured_at = ref.captured_at || new Date().toISOString();
    normalized.source = String(ref.source || 'HIOSKT_MANUAL');
    normalized.note = String(ref.note || '');
    return normalized;
  }

  function localEvidence(settlement, messages, partnerRole) {
    const result = settlement && (settlement.settlement_result || settlement.result_snapshot) || null;
    const lottery = settlement && settlement.lottery_result_snapshot || null;
    const config = settlement && settlement.config_snapshot || null;
    return {
      settlement_result: clone(result),
      category_rows: clone(settlement && settlement.category_rows || []),
      message_ids: clone(settlement && settlement.message_ids || []),
      messages: clone(messages || []),
      partner_role: partnerRole == null ? null : String(partnerRole),
      engine_version: String(settlement && settlement.engine_version || ''),
      config_version: config && config.version != null ? Number(config.version) : null,
      config_effective_from_date: config && config.effective_from_date ? String(config.effective_from_date) : null,
      config_snapshot: clone(config),
      result_fingerprint: lottery && lottery.fingerprint ? String(lottery.fingerprint) : null,
      result_verification_status: lottery && lottery.verification_status ? String(lottery.verification_status) : null,
      lottery_result_snapshot: clone(lottery),
      scope_status: String(settlement && settlement.scope_status || '')
    };
  }

  async function loadMessageEvidence(store, settlement) {
    if (!store || !store.STORES || !store.STORES.messages || typeof store.get !== 'function') return [];
    const ids = Array.isArray(settlement && settlement.message_ids)
      ? settlement.message_ids.map(String)
      : settlement && settlement.message_id ? [String(settlement.message_id)] : [];
    const rows = await Promise.all(ids.map(id => store.get(store.STORES.messages, id).catch(() => null)));
    return rows.filter(Boolean).map(message => ({
      id: String(message.id || ''),
      raw_text: String(message.raw_text || ''),
      region: String(message.region || ''),
      status: String(message.status || ''),
      canonical_version: message.canonical_version == null ? null : String(message.canonical_version),
      canonical_payload: clone(message.canonical_payload || null),
      parser_error: message.parser_error == null ? null : String(message.parser_error)
    }));
  }

  async function loadPartnerRole(store, settlement) {
    if (!store || !store.STORES || !store.STORES.partners || typeof store.get !== 'function') return null;
    const partnerId = settlement && settlement.partner_id;
    if (!partnerId) return null;
    const partner = await store.get(store.STORES.partners, partnerId).catch(() => null);
    const role = String(partner && partner.role || '').toLowerCase();
    return ['customer', 'owner'].includes(role) ? role : null;
  }

  async function saveEvidence(store, settlement, reference, comparison, input) {
    if (!store || typeof store.saveShadowEvent !== 'function') return null;
    const [messages, partnerRole] = await Promise.all([
      loadMessageEvidence(store, settlement),
      loadPartnerRole(store, settlement)
    ]);
    return store.saveShadowEvent({
      scope_id: settlement.id,
      partner_id: settlement.partner_id,
      business_date: settlement.business_date,
      region: settlement.region,
      trigger: String(input && input.trigger || 'MANUAL_COMPARE').toUpperCase(),
      reason: input && input.reason != null ? String(input.reason) : null,
      local_snapshot: localEvidence(settlement, messages, partnerRole),
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
    if(typeof d.store.saveSettlementIfUnchanged!=='function')
      throw new Error('SHADOW_ATOMIC_SETTLEMENT_STORE_REQUIRED');
    const committed=await d.store.saveSettlementIfUnchanged(Object.assign({},settlement,{
      reference_app_snapshot:savedReference,
      comparison_status:comparison.status,
      created_at:settlement.created_at
    }),settlement);
    if(!committed || committed.superseded || !committed.saved)
      throw new Error('SHADOW_SCOPE_CHANGED_DURING_COMPARISON');
    const saved=committed.saved;
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

  function buildReplayCase(event) {
    if (!event || !event.scope_id) throw new Error('SHADOW_EVIDENCE_REQUIRED');
    const local = event.local_snapshot || {};
    return {
      format: 'kts-shadow-replay-case-v1',
      source_event_id: event.id == null ? null : String(event.id),
      scope: {
        scope_id: String(event.scope_id),
        partner_id: String(event.partner_id || ''),
        business_date: String(event.business_date || ''),
        region: String(event.region || '').toLowerCase()
      },
      partner_role: local.partner_role == null ? null : String(local.partner_role),
      captured_at: event.observed_at || null,
      trigger: event.trigger || null,
      engine_version: local.engine_version || null,
      config_snapshot: clone(local.config_snapshot || null),
      lottery_result_snapshot: clone(local.lottery_result_snapshot || null),
      messages: clone(local.messages || []),
      expected_reference: clone(event.reference_snapshot || null),
      expected_comparison_status: String(event.comparison_status || event.comparison && event.comparison.status || 'UNVERIFIED'),
      expected_comparison: clone(event.comparison || null),
      observed_settlement_result: clone(local.settlement_result || null),
      observed_category_rows: clone(local.category_rows || [])
    };
  }

  async function getReplayCase(input) {
    const d = deps();
    const history = await getHistory(input);
    if (!history.length) throw new Error('SHADOW_EVIDENCE_NOT_FOUND');
    const target = input && input.event_id
      ? history.find(row => String(row.id) === String(input.event_id))
      : history[history.length - 1];
    if (!target) throw new Error('SHADOW_EVIDENCE_NOT_FOUND');
    const replay = buildReplayCase(target);
    if (!replay.partner_role) replay.partner_role = await loadPartnerRole(d.store, { partner_id: replay.scope.partner_id });
    return replay;
  }

  global.KTS_SETTLEMENT_SHADOW_RUNTIME = Object.freeze({
    version: 'settlement-shadow-runtime-v10-preserve-total-aliases',
    scopeId,
    normalizeReference,
    localEvidence,
    loadMessageEvidence,
    loadPartnerRole,
    compareAndSave,
    getComparison,
    getDiagnostics,
    getHistory,
    buildReplayCase,
    getReplayCase
  });
})(typeof window !== 'undefined' ? window : globalThis);
