(function (global) {
  'use strict';

  function deps() {
    const store = global.KTS_SETTLEMENT_STORE;
    const evaluator = global.KTS_SETTLEMENT_EVALUATOR;
    const runtime = global.KTS_SETTLEMENT_RUNTIME;
    const engine = global.KTS_SETTLEMENT_ENGINE;
    if (!store || !evaluator || !runtime || !engine) throw new Error('SETTLEMENT_PIPELINE_DEPENDENCY_MISSING');
    return { store, evaluator, runtime, engine };
  }

  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function scopeId(partnerId, businessDate, region) {
    return `scope:${partnerId}:${businessDate}:${String(region || '').toLowerCase()}`;
  }
  function isCancelled(message) { return String(message && message.status || '') === 'cancelled'; }

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
    const result = zeroResult(input.reason);
    const saved = await d.store.saveSettlement({
      id: scopeId(input.partner_id, input.business_date, input.region),
      partner_id: input.partner_id,
      message_id: null,
      message_ids: (input.messages || []).map(m => m.id),
      business_date: input.business_date,
      region: input.region,
      engine_version: d.engine.version,
      config_snapshot: clone(input.config_snapshot || null),
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

  async function settleScope(input) {
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
    catch (e) { return saveBlockedScope({ partner_id: partnerId, business_date: businessDate, region, messages, reason: String(e.message || e) }); }
    if (!config || String(config.partner_id || '') !== String(partnerId)) {
      return saveBlockedScope({ partner_id: partnerId, business_date: businessDate, region, messages, reason: 'CONFIG_PARTNER_MISMATCH' });
    }

    const pending = messages.filter(m => !m.canonical_payload || String(m.status || '').startsWith('pending') || String(m.status || '').startsWith('parser_error'));
    if (pending.length) {
      return saveBlockedScope({ partner_id: partnerId, business_date: businessDate, region, messages, config_snapshot: config, reason: `PENDING_PARSER:${pending.map(m => m.id).join(',')}` });
    }

    const resultSnapshot = input.result_snapshot || await findResult(businessDate, region);
    if (!resultSnapshot) {
      return saveBlockedScope({ partner_id: partnerId, business_date: businessDate, region, messages, config_snapshot: config, reason: 'KQXS_NOT_AVAILABLE' });
    }
    const resultDate = String(resultSnapshot.business_date || '').slice(0, 10);
    const resultRegion = String(resultSnapshot.region || '').toLowerCase();
    if (resultDate !== String(businessDate) || resultRegion !== region) {
      return saveBlockedScope({
        partner_id: partnerId, business_date: businessDate, region, messages,
        config_snapshot: config, result_snapshot: resultSnapshot, reason: 'KQXS_SCOPE_MISMATCH'
      });
    }
    if (String(resultSnapshot.verification_status || '').toLowerCase() === 'conflict') {
      return saveBlockedScope({
        partner_id: partnerId, business_date: businessDate, region, messages,
        config_snapshot: config, result_snapshot: resultSnapshot, reason: 'KQXS_SOURCE_CONFLICT'
      });
    }

    const categoryInputs = [];
    const rowOwners = [];
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
        const start = categoryInputs.length;
        for (const row of evaluated.category_inputs) {
          categoryInputs.push(row);
          rowOwners.push(message.id);
        }
        for (const detail of evaluated.detail_rows) detailRows.push(Object.assign({ message_id: message.id }, detail));
        messageEval.push({ message_id: message.id, start, count: evaluated.category_inputs.length });
      }
    } catch (e) {
      return saveBlockedScope({ partner_id: partnerId, business_date: businessDate, region, messages, config_snapshot: config, result_snapshot: resultSnapshot, reason: String(e.message || e) });
    }

    let settled;
    try {
      const partner = await d.store.get(d.store.STORES.partners, partnerId);
      if (!partner) throw new Error('PARTNER_NOT_FOUND');
      settled = d.runtime.settleWithConfig(categoryInputs, { partner_role: partner.role, config_snapshot: config, region });
    } catch (e) {
      return saveBlockedScope({ partner_id: partnerId, business_date: businessDate, region, messages, config_snapshot: config, result_snapshot: resultSnapshot, reason: String(e.message || e) });
    }

    const breakdown = messageEval.map(item => ({
      message_id: item.message_id,
      category_rows: settled.rows.slice(item.start, item.start + item.count).map(clone)
    }));
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

    for (const message of messages) {
      await d.store.saveMessage(Object.assign({}, message, {
        config_snapshot: message.config_snapshot || config,
        status: resultSnapshot.complete ? 'settled_unverified' : 'settled_provisional'
      }));
    }
    return { status: scopeStatus, settlement: saved };
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
    version: 'settlement-pipeline-v4-scope-safety',
    scopeId,
    isCancelled,
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
