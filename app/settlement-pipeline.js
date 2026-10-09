(function (global) {
  'use strict';

  function deps() {
    const store = global.KTS_SETTLEMENT_STORE;
    const evaluator = global.KTS_SETTLEMENT_EVALUATOR;
    const runtime = global.KTS_SETTLEMENT_RUNTIME;
    const engine = global.KTS_SETTLEMENT_ENGINE;
    const gates = global.KTS_SETTLEMENT_FEATURE_GATES;
    if (!store || !evaluator || !runtime || !engine || !gates || typeof gates.guardEvaluation !== 'function') throw new Error('SETTLEMENT_PIPELINE_DEPENDENCY_MISSING');
    return { store, evaluator, runtime, engine, gates };
  }

  const scopeSettlementQueues = new Map();

  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function scopeId(partnerId, businessDate, region) {
    return `scope:${partnerId}:${businessDate}:${String(region || '').toLowerCase()}`;
  }
  function isCancelled(message) { return String(message && message.status || '').toLowerCase() === 'cancelled'; }
  // Revision checks must include the actual monetary inputs, not only their
  // IDs/timestamps. Imports and same-version corrections may keep updated_at
  // while changing a bet, a regional price, or verified lottery evidence.
  function messageRevisionSignature(messages) {
    const rows=(Array.isArray(messages)?messages:[]).map(message=>({
      id:message&&message.id||null,partner_id:message&&message.partner_id||null,
      business_date:message&&message.business_date||null,region:message&&message.region||null,
      updated_at:message&&message.updated_at||null,status:message&&message.status||null,
      raw_text:message&&message.raw_text||null,canonical_version:message&&message.canonical_version||null,
      parser_error:message&&message.parser_error||null,
      canonical_payload:message&&message.canonical_payload||null
    }));
    rows.sort((a,b)=>String(a.id).localeCompare(String(b.id)));
    return JSON.stringify(rows);
  }
  function configRevisionSignature(config) {
    if (!config) return '';
    return JSON.stringify({
      id:config.id||null,partner_id:config.partner_id||null,version:config.version||null,
      effective_from_date:config.effective_from_date||null,updated_at:config.updated_at||null,
      region_pricing:config.region_pricing||{},region_terms:config.region_terms||{},
      dat_hit_mode:config.dat_hit_mode||null,dax_hit_mode:config.dax_hit_mode||null,
      mb_xien_234:config.mb_xien_234===true,tinh_ui:config.tinh_ui===true,
      total_percent:config.total_percent,refund_percent:config.refund_percent,
      commission_type:config.commission_type||null
    });
  }
  function resultRevisionSignature(result) {
    if (!result) return '';
    return JSON.stringify({
      fingerprint:result.fingerprint||null,
      business_date:result.business_date||null,region:result.region||null,
      status:result.status||null,complete:result.complete===true,
      coverage_complete:result.coverage_complete===true,
      verified:result.verified===true,verification_status:result.verification_status||null,
      verification_sources:result.verification_sources||[],
      verification_conflicts:result.verification_conflicts||[],
      expected_station_codes:result.expected_station_codes||[],
      stations:result.stations||[]
    });
  }
  function partnerRevisionSignature(partner) {
    return partner?JSON.stringify({
      id:partner.id||null,name:partner.name||null,role:partner.role||null,active:partner.active!==false
    }):'';
  }

  // Keep each message's category counts aligned with the rows the runtime
  // will actually settle. Dropped unconfirmed UI rows must never shift the
  // next message's attribution or appear in detailed reports.
  function guardedMessageEvaluation(evaluated, config, gates) {
    if (!evaluated || !Array.isArray(evaluated.category_inputs) || !Array.isArray(evaluated.detail_rows))
      throw new Error('SETTLEMENT_EVALUATION_INVALID');
    if (!gates || typeof gates.guardEvaluation !== 'function')
      throw new Error('SETTLEMENT_FEATURE_GATES_NOT_LOADED');
    return gates.guardEvaluation(evaluated, config);
  }

  function zeroResult(reason) {
    return {
      rows: [], total_xac: 0, total_qua_co: 0, total_payout: 0,
      gross_net: 0, total_percent: 100, refund_percent: 0,
      refund_amount: 0, final_net: 0, direction: 'HOA', blocked_reason: reason || null
    };
  }

  async function findScopeMessages(partnerId, businessDate, region) {
    const d = deps();
    const all = await d.store.getAll(d.store.STORES.messages);
    return all.filter(m => !isCancelled(m) && m.partner_id === partnerId && m.business_date === businessDate && String(m.region || '').toLowerCase() === String(region || '').toLowerCase())
      .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  }

  async function findResult(businessDate, region) {
    const d = deps();
    return await d.store.get(d.store.STORES.results, `${businessDate}:${String(region || '').toLowerCase()}`);
  }

  async function saveEmptyScope(input) {
    const d = deps();
    // An old empty-scope request must not overwrite a newer active bet.
    const current = await findScopeMessages(input.partner_id, input.business_date, input.region);
    if (current.length) return {status:'superseded',reason:'SCOPE_INPUT_CHANGED_DURING_SETTLEMENT',settlement:null};
    const result = zeroResult(null);
    const saved = await d.store.saveSettlement({
      id: scopeId(input.partner_id, input.business_date, input.region),
      partner_id: input.partner_id,
      message_id: null,
      message_ids: [],
      business_date: input.business_date,
      region: input.region,
      engine_version: d.engine.version,
      config_snapshot: null,
      lottery_result_snapshot: null,
      result_snapshot: result,
      settlement_result: result,
      detail_rows: [],
      category_rows: [],
      message_breakdown: [],
      scope_status: 'empty',
      blocked_reasons: [],
      comparison_status: 'empty'
    });
    return { status: 'empty', settlement: saved };
  }

  async function saveBlockedScope(input) {
    const d = deps();
    // Blocking is a write too. Never let an older parser/config/KQXS error
    // overwrite a freshly corrected scope in another tab.
    const latest = await findScopeMessages(input.partner_id,input.business_date,input.region);
    if (messageRevisionSignature(latest)!==messageRevisionSignature(input.messages||[]))
      return {status:'superseded',reason:'SCOPE_INPUT_CHANGED_DURING_SETTLEMENT',settlement:null};
    if (input.config_snapshot || input.expect_config_unavailable===true) {
      let config;
      try { config=await d.store.resolveConfigForDate(input.partner_id,input.business_date); }
      catch (_) { config=null; }
      if ((input.expect_config_unavailable===true && config!==null) ||
          (input.config_snapshot && configRevisionSignature(config)!==configRevisionSignature(input.config_snapshot)))
        return {status:'superseded',reason:'SCOPE_INPUT_CHANGED_DURING_SETTLEMENT',settlement:null};
    }
    if (input.result_snapshot || input.expect_result_missing===true) {
      const result = await findResult(input.business_date,input.region);
      if ((input.expect_result_missing===true && result!==null) ||
          (input.result_snapshot && resultRevisionSignature(result)!==resultRevisionSignature(input.result_snapshot)))
        return {status:'superseded',reason:'SCOPE_INPUT_CHANGED_DURING_SETTLEMENT',settlement:null};
    }
    if (input.partner_snapshot || input.expect_partner_missing===true) {
      const partner=await d.store.get(d.store.STORES.partners,input.partner_id);
      if ((input.expect_partner_missing===true && partner!=null) ||
          (input.partner_snapshot && partnerRevisionSignature(partner)!==partnerRevisionSignature(input.partner_snapshot)))
        return {status:'superseded',reason:'SCOPE_INPUT_CHANGED_DURING_SETTLEMENT',settlement:null};
    }
    const result = zeroResult(input.reason);
    const saved = await d.store.saveSettlement({
      id: scopeId(input.partner_id, input.business_date, input.region),
      partner_id: input.partner_id,
      message_id: null,
      message_ids: (input.messages || []).map(m => m.id),
      business_date: input.business_date,
      region: input.region,
      engine_version: d.engine.version,
      // A malformed config linked to ANOTHER partner is only evidence for
      // this block, never a valid pricing snapshot for this partner. The
      // canonical store rejects cross-partner snapshots by design.
      config_snapshot: input.config_snapshot &&
        String(input.config_snapshot.partner_id||'')===String(input.partner_id)
        ? clone(input.config_snapshot) : null,
      lottery_result_snapshot: clone(input.result_snapshot || null),
      result_snapshot: result,
      settlement_result: result,
      detail_rows: [],
      category_rows: [],
      message_breakdown: [],
      scope_status: 'blocked',
      blocked_reasons: [String(input.reason || 'BLOCKED')],
      comparison_status: 'blocked'
    });
    return { status: 'blocked', reason: input.reason, settlement: saved };
  }

  async function settleScopeOnce(input) {
    const d = deps();
    const partnerId = input.partner_id;
    const businessDate = input.business_date;
    const region = String(input.region || '').toLowerCase();
    if (!partnerId || !/^\d{4}-\d{2}-\d{2}$/.test(String(businessDate || ''))) throw new Error('SETTLEMENT_SCOPE_REQUIRED');
    if (!['mn', 'mt', 'mb'].includes(region)) throw new Error('SETTLEMENT_REGION_REQUIRED');

    const messages = input.messages || await findScopeMessages(partnerId, businessDate, region);
    if (!messages.length) return saveEmptyScope({ partner_id: partnerId, business_date: businessDate, region });

    const foreignMessage = messages.find(message =>
      String(message && message.partner_id || '') !== String(partnerId) ||
      String(message && message.business_date || '') !== String(businessDate) ||
      String(message && message.region || '').toLowerCase() !== region
    );
    if (foreignMessage) {
      return saveBlockedScope({
        partner_id: partnerId, business_date: businessDate, region, messages: [],
        reason: `MESSAGE_SCOPE_MISMATCH:${String(foreignMessage.id || 'unknown')}`
      });
    }

    let config;
    try { config = await d.store.resolveConfigForDate(partnerId, businessDate); }
    catch (e) { return saveBlockedScope({ partner_id: partnerId, business_date: businessDate, region, messages, expect_config_unavailable:true, reason: String(e.message || e) }); }
    if (!config || String(config.partner_id || '') !== String(partnerId)) {
      return saveBlockedScope({ partner_id: partnerId, business_date: businessDate, region, messages,
        config_snapshot:config||null,expect_config_unavailable:!config,
        reason: 'CONFIG_PARTNER_MISMATCH' });
    }

    // A parser_error cannot be waived by a stale canonical payload or a
    // manually changed status. Never calculate money from failed provenance.
    const pending = messages.filter(m => Boolean(m.parser_error) || !m.canonical_payload || String(m.status || '').startsWith('pending') || String(m.status || '').startsWith('parser_error'));
    if (pending.length) {
      return saveBlockedScope({ partner_id: partnerId, business_date: businessDate, region, messages, config_snapshot: config, reason: `PENDING_PARSER:${pending.map(m => m.id).join(',')}` });
    }

    // Store is the canonical KQXS authority. Callers may carry a snapshot for
    // event metadata, but monetary settlement always rereads the persisted scope.
    const resultSnapshot = await findResult(businessDate, region);
    if (!resultSnapshot) {
      return saveBlockedScope({ partner_id: partnerId, business_date: businessDate, region, messages, config_snapshot: config, expect_result_missing:true, reason: 'KQXS_NOT_AVAILABLE' });
    }
    const resultDate = String(resultSnapshot.business_date || '').slice(0, 10);
    const resultRegion = String(resultSnapshot.region || '').toLowerCase();
    if (resultDate !== String(businessDate) || resultRegion !== region) {
      return saveBlockedScope({
        partner_id: partnerId, business_date: businessDate, region, messages,
        config_snapshot: config, result_snapshot: resultSnapshot, reason: 'KQXS_SCOPE_MISMATCH'
      });
    }
    // Imported/restored IndexedDB may contain contradictory KQXS metadata.
    // A nonempty conflict list is authoritative even if a stale status says
    // "verified". Never evaluate monetary rows against contradictory sources.
    if (String(resultSnapshot.verification_status || '').toLowerCase() === 'conflict' ||
        (Array.isArray(resultSnapshot.verification_conflicts) && resultSnapshot.verification_conflicts.length > 0)) {
      return saveBlockedScope({
        partner_id: partnerId, business_date: businessDate, region, messages,
        config_snapshot: config, result_snapshot: resultSnapshot, reason: 'KQXS_SOURCE_CONFLICT'
      });
    }

    const categoryInputs = [];
    const detailRows = [];
    const messageEval = [];
    try {
      for (const message of messages) {
        const evaluated = d.evaluator.evaluateCanonicalMessage({
          canonical_payload: message.canonical_payload,
          config_snapshot: config,
          result_snapshot: resultSnapshot,
          region
        });
        const guarded = guardedMessageEvaluation(evaluated, config, d.gates);
        const start = categoryInputs.length;
        for (const row of guarded.category_inputs) categoryInputs.push(row);
        for (const detail of guarded.detail_rows) detailRows.push(Object.assign({ message_id: message.id }, detail));
        messageEval.push({ message_id: message.id, start, count: guarded.category_inputs.length });
      }
    } catch (e) {
      return saveBlockedScope({ partner_id: partnerId, business_date: businessDate, region, messages, config_snapshot: config, result_snapshot: resultSnapshot, reason: String(e.message || e) });
    }

    // Regression already refuses an empty active category set. The live
    // pipeline must also block rather than marking unsupported-only bets as
    // complete with zero money after the unconfirmed UI row was discarded.
    if (!categoryInputs.length) {
      return saveBlockedScope({partner_id:partnerId,business_date:businessDate,region,messages,
        config_snapshot:config,result_snapshot:resultSnapshot,reason:'NO_PERMITTED_SETTLEMENT_CATEGORY_INPUTS'});
    }

    let settled, partner;
    try {
      partner = await d.store.get(d.store.STORES.partners, partnerId);
      if (!partner) throw new Error('PARTNER_NOT_FOUND');
      settled = d.runtime.settleWithConfig(categoryInputs, { partner_role: partner.role, config_snapshot: config, region });
    } catch (e) {
      return saveBlockedScope({ partner_id: partnerId, business_date: businessDate, region, messages,
        config_snapshot: config, result_snapshot: resultSnapshot,
        partner_snapshot:partner||null,expect_partner_missing:!partner,
        reason: String(e.message || e) });
    }

    // engine.settle preserves row order; count mismatch means attribution
    // is unsafe. Block instead of assigning another message's winnings.
    if (!settled || !Array.isArray(settled.rows) || settled.rows.length !== categoryInputs.length) {
      return saveBlockedScope({partner_id:partnerId,business_date:businessDate,region,messages,
        config_snapshot:config,result_snapshot:resultSnapshot,partner_snapshot:partner,
        reason:'SETTLEMENT_CATEGORY_ROW_COUNT_MISMATCH'});
    }
    const breakdown = messageEval.map(item => ({
      message_id: item.message_id,
      category_rows: settled.rows.slice(item.start, item.start + item.count).map(clone)
    }));
    // Revalidate all scope inputs immediately before commit. A cancel/restore,
    // config version change, parser rewrite, or newer KQXS may have landed while
    // this calculation was running. In that case this run is superseded and must
    // not publish stale money; the queued/newer scope recalculation becomes final.
    const latestMessages = await findScopeMessages(partnerId, businessDate, region);
    let latestConfig;
    try { latestConfig = await d.store.resolveConfigForDate(partnerId, businessDate); }
    catch (_) { latestConfig = null; }
    const latestResult = await findResult(businessDate, region);
    const latestPartner = await d.store.get(d.store.STORES.partners, partnerId);
    if (
      partnerRevisionSignature(latestPartner) !== partnerRevisionSignature(partner) ||
      messageRevisionSignature(latestMessages) !== messageRevisionSignature(messages) ||
      configRevisionSignature(latestConfig) !== configRevisionSignature(config) ||
      resultRevisionSignature(latestResult) !== resultRevisionSignature(resultSnapshot)
    ) {
      return { status: 'superseded', reason: 'SCOPE_INPUT_CHANGED_DURING_SETTLEMENT', settlement: null };
    }

    const scopeStatus = resultSnapshot.complete ? 'complete_unverified' : 'provisional';
    const saved = await d.store.saveSettlement({
      id: scopeId(partnerId, businessDate, region),
      partner_id: partnerId,
      message_id: null,
      message_ids: messages.map(m => m.id),
      business_date: businessDate,
      region,
      engine_version: d.engine.version,
      config_snapshot: clone(config),
      lottery_result_snapshot: clone(resultSnapshot),
      result_snapshot: clone(settled),
      settlement_result: clone(settled),
      detail_rows: detailRows,
      category_rows: settled.rows,
      message_breakdown: breakdown,
      scope_status: scopeStatus,
      blocked_reasons: [],
      comparison_status: resultSnapshot.complete ? 'unverified' : 'provisional'
    });

    for (const message of latestMessages) {
      const current = await d.store.get(d.store.STORES.messages, message.id);
      if (!current || isCancelled(current)) continue;
      if (messageRevisionSignature([current]) !== messageRevisionSignature([message])) continue;
      await d.store.saveMessage(Object.assign({}, current, {
        config_snapshot: current.config_snapshot || config,
        status: resultSnapshot.complete ? 'settled_unverified' : 'settled_provisional'
      }));
    }
    return { status: scopeStatus, settlement: saved };
  }

  function settleScope(input) {
    const partnerId = String(input && input.partner_id || '');
    const businessDate = String(input && input.business_date || '');
    const region = String(input && input.region || '').toLowerCase();
    const key = scopeId(partnerId, businessDate, region);
    const previous = scopeSettlementQueues.get(key) || Promise.resolve();
    const run = previous.catch(() => {}).then(() => settleScopeOnce(input));
    let tracked;
    tracked = run.finally(() => {
      if (scopeSettlementQueues.get(key) === tracked) scopeSettlementQueues.delete(key);
    });
    scopeSettlementQueues.set(key, tracked);
    return tracked;
  }

  async function recalculateDateRegion(input) {
    const d = deps();
    const businessDate = input.business_date;
    const region = String(input.region || '').toLowerCase();
    const all = await d.store.getAll(d.store.STORES.messages);
    const partnerIds = [...new Set(all.filter(m => m.business_date === businessDate && String(m.region || '').toLowerCase() === region).map(m => m.partner_id))];
    const out = [];
    for (const partnerId of partnerIds) out.push(await settleScope({ partner_id: partnerId, business_date: businessDate, region, result_snapshot: input.result_snapshot }));
    return out;
  }

  async function recalculatePartnerFromDate(partnerId, effectiveDate) {
    const d = deps();
    const all = await d.store.getAll(d.store.STORES.messages);
    const scopes = new Map();
    for (const m of all) {
      if (m.partner_id !== partnerId || m.business_date < effectiveDate) continue;
      scopes.set(`${m.business_date}:${m.region}`, { business_date: m.business_date, region: m.region });
    }
    const out = [];
    for (const scope of scopes.values()) out.push(await settleScope({ partner_id: partnerId, business_date: scope.business_date, region: scope.region }));
    return out;
  }

  async function parseAndSaveMessage(input) {
    const d = deps();
    const partnerId = String(input && input.partner_id || '');
    const businessDate = String(input && input.business_date || '');
    const region = String(input && input.region || '').toLowerCase();
    const rawText = String(input && input.raw_text || '');
    if (!partnerId || !/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) throw new Error('SETTLEMENT_SCOPE_REQUIRED');
    if (!['mn', 'mt', 'mb'].includes(region)) throw new Error('SETTLEMENT_REGION_REQUIRED');
    if (!rawText.trim()) throw new Error('SETTLEMENT_MESSAGE_REQUIRED');

    // Domain-level preflight: callers outside the UI must not hit the parser or
    // persist a message until the exact partner/date pricing config exists.
    const config = await d.store.resolveConfigForDate(partnerId, businessDate);
    if (!config || String(config.partner_id || '') !== partnerId) throw new Error('CONFIG_PARTNER_MISMATCH');

    const parser = input.parser_provider || global.KTS_SETTLEMENT_PARSER_PROVIDER;
    if (!parser || typeof parser.fetchCanonical !== 'function') throw new Error('SETTLEMENT_PARSER_PROVIDER_MISSING');
    const base = {
      partner_id: partnerId,
      business_date: businessDate,
      region,
      raw_text: rawText,
      config_snapshot: config
    };
    let canonical;
    try {
      canonical = await parser.fetchCanonical(rawText, region, businessDate);
    } catch (e) {
      const savedPending = await d.store.saveMessage(Object.assign({}, base, {
        canonical_payload: null,
        parser_error: String(e.message || e),
        status: 'parser_error'
      }));
      await settleScope({ partner_id: partnerId, business_date: businessDate, region });
      return { status: 'parser_error', message: savedPending, error: String(e.message || e) };
    }

    if (String(canonical.region || '').toLowerCase() !== region) throw new Error('PARSER_REGION_MISMATCH');
    const saved = await d.store.saveMessage(Object.assign({}, base, {
      canonical_payload: canonical,
      canonical_version: canonical.parser_version || 'canonical-settlement-v1',
      parser_error: null,
      status: 'parsed_waiting_result'
    }));
    const result = await findResult(businessDate, region);
    const settlement = result ? await settleScope({ partner_id: partnerId, business_date: businessDate, region, result_snapshot: result }) : null;
    return { status: settlement ? settlement.status : 'parsed_waiting_result', message: saved, settlement };
  }

  async function cancelMessage(messageId) {
    const d = deps();
    const message = await d.store.get(d.store.STORES.messages, messageId);
    if (!message) throw new Error('MESSAGE_NOT_FOUND');
    if (!isCancelled(message)) {
      await d.store.saveMessage(Object.assign({}, message, { status: 'cancelled' }));
    }
    const settlement = await settleScope({ partner_id: message.partner_id, business_date: message.business_date, region: message.region });
    return { status: 'cancelled', message_id: messageId, settlement };
  }

  async function restoreMessage(messageId) {
    const d = deps();
    const message = await d.store.get(d.store.STORES.messages, messageId);
    if (!message) throw new Error('MESSAGE_NOT_FOUND');
    if (!isCancelled(message)) return { status: 'not_cancelled', message_id: messageId, settlement: null };
    const restoredStatus = message.parser_error ? 'parser_error' : message.canonical_payload ? 'parsed_waiting_result' : 'pending_parser';
    await d.store.saveMessage(Object.assign({}, message, { status: restoredStatus }));
    const settlement = await settleScope({ partner_id: message.partner_id, business_date: message.business_date, region: message.region });
    return { status: 'restored', message_id: messageId, settlement };
  }

  global.KTS_SETTLEMENT_PIPELINE = Object.freeze({
    version: 'settlement-pipeline-v17-kqxs-conflict-evidence',
    scopeId,
    isCancelled,
    guardedMessageEvaluation,
    messageRevisionSignature,configRevisionSignature,resultRevisionSignature,partnerRevisionSignature,
    findScopeMessages,
    findResult,
    settleScope,
    recalculateDateRegion,
    recalculatePartnerFromDate,
    parseAndSaveMessage,
    cancelMessage,
    restoreMessage
  });
})(typeof window !== 'undefined' ? window : globalThis);
