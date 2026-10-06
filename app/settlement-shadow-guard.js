(function (global) {
  'use strict';

  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
  function isScopeRecord(v) { return Boolean(v && typeof v === 'object' && /^scope:/.test(String(v.id || ''))); }
  function isConflict(settlement) {
    const snapshot = settlement && settlement.lottery_result_snapshot;
    return String(snapshot && snapshot.verification_status || '').toLowerCase() === 'conflict';
  }
  function unique(values) { return [...new Set((values || []).filter(Boolean).map(String))]; }
  function staleReference(reference, reason) {
    if (!reference) return null;
    const out = clone(reference);
    delete out.comparison;
    out.stale_reason = String(reason || 'RECALCULATION_PENDING');
    out.stale_at = new Date().toISOString();
    return out;
  }

  function collectScopeIds(value, out, seen) {
    const ids = out || new Set();
    const visited = seen || new Set();
    if (value == null || typeof value !== 'object' || visited.has(value)) return ids;
    visited.add(value);
    if (isScopeRecord(value)) ids.add(String(value.id));
    if (Array.isArray(value)) {
      for (const item of value) collectScopeIds(item, ids, visited);
      return ids;
    }
    if (Object.prototype.hasOwnProperty.call(value, 'settlement')) collectScopeIds(value.settlement, ids, visited);
    return ids;
  }

  function rewriteOutcome(value, records) {
    if (Array.isArray(value)) return value.map(item => rewriteOutcome(item, records));
    if (!value || typeof value !== 'object') return value;
    if (isScopeRecord(value) && records.has(String(value.id))) return clone(records.get(String(value.id)));
    const out = Object.assign({}, value);
    if (Object.prototype.hasOwnProperty.call(value, 'settlement')) {
      out.settlement = rewriteOutcome(value.settlement, records);
      const direct = isScopeRecord(out.settlement) ? out.settlement : null;
      if (direct && direct.comparison_status === 'blocked' && ['complete_unverified','provisional','blocked'].includes(String(out.status || ''))) {
        out.status = 'blocked';
        out.reason = unique(direct.blocked_reasons)[0] || 'BLOCKED';
      }
    }
    return out;
  }

  function install() {
    const store = global.KTS_SETTLEMENT_STORE;
    const base = global.KTS_SETTLEMENT_PIPELINE;
    const shadowRuntime = global.KTS_SETTLEMENT_SHADOW_RUNTIME;
    if (!store || !base || !shadowRuntime || base.__shadow_guarded) return;
    if (!store.STORES || !store.STORES.settlements || typeof store.getAll !== 'function' || typeof store.get !== 'function' || typeof store.saveSettlement !== 'function') return;
    if (typeof shadowRuntime.compareAndSave !== 'function') return;

    async function snapshotReferences() {
      const rows = await store.getAll(store.STORES.settlements);
      const refs = new Map();
      for (const row of rows || []) {
        if (row && row.id && row.reference_app_snapshot) refs.set(String(row.id), clone(row.reference_app_snapshot));
      }
      return refs;
    }

    async function saveGuarded(settlement, reference, reason) {
      const reasons = unique([...(settlement.blocked_reasons || []), reason]);
      return store.saveSettlement(Object.assign({}, settlement, {
        reference_app_snapshot: staleReference(reference || settlement.reference_app_snapshot, reason),
        comparison_status: 'blocked',
        blocked_reasons: reasons,
        created_at: settlement.created_at
      }));
    }

    async function reconcileOne(id, priorReference) {
      let current = await store.get(store.STORES.settlements, id);
      if (!current) return null;
      const reference = current.reference_app_snapshot || priorReference || null;
      const withoutConflictReason = unique(current.blocked_reasons || []).filter(x => x !== 'KQXS_SOURCE_CONFLICT');

      if (isConflict(current)) {
        return saveGuarded(Object.assign({}, current, { blocked_reasons: withoutConflictReason }), reference, 'KQXS_SOURCE_CONFLICT');
      }

      if (String(current.scope_status || '') === 'blocked') {
        return store.saveSettlement(Object.assign({}, current, {
          reference_app_snapshot: staleReference(reference, 'SETTLEMENT_SCOPE_BLOCKED'),
          comparison_status: 'blocked',
          blocked_reasons: withoutConflictReason,
          created_at: current.created_at
        }));
      }

      if (String(current.scope_status || '') === 'provisional') {
        return store.saveSettlement(Object.assign({}, current, {
          reference_app_snapshot: staleReference(reference, 'KQXS_PROVISIONAL'),
          comparison_status: 'provisional',
          blocked_reasons: withoutConflictReason,
          created_at: current.created_at
        }));
      }

      if (!reference) {
        if ((current.blocked_reasons || []).includes('KQXS_SOURCE_CONFLICT') || current.comparison_status === 'blocked') {
          current = await store.saveSettlement(Object.assign({}, current, {
            blocked_reasons: withoutConflictReason,
            comparison_status: 'unverified',
            created_at: current.created_at
          }));
        }
        return current;
      }

      if (!current.reference_app_snapshot) {
        current = await store.saveSettlement(Object.assign({}, current, {
          reference_app_snapshot: clone(reference),
          blocked_reasons: withoutConflictReason,
          comparison_status: 'unverified',
          created_at: current.created_at
        }));
      } else if ((current.blocked_reasons || []).includes('KQXS_SOURCE_CONFLICT')) {
        current = await store.saveSettlement(Object.assign({}, current, {
          blocked_reasons: withoutConflictReason,
          created_at: current.created_at
        }));
      }

      const parts = String(id).split(':');
      const scope = { partner_id: parts[1], business_date: parts[2], region: parts[3] };
      const refreshed = await shadowRuntime.compareAndSave(Object.assign({}, scope, { reference_snapshot: reference }));
      return refreshed && refreshed.settlement ? refreshed.settlement : current;
    }

    async function reconcileFailure(id, priorReference, error) {
      const current = await store.get(store.STORES.settlements, id);
      if (!current) return null;
      const code = `SHADOW_RECOMPARE_FAILED:${String(error && error.message || error || 'UNKNOWN').slice(0, 160)}`;
      return saveGuarded(current, current.reference_app_snapshot || priorReference || null, code);
    }

    async function guardedCall(name, args) {
      const priorRefs = await snapshotReferences();
      const outcome = await base[name](...args);
      const ids = collectScopeIds(outcome);
      const records = new Map();
      for (const id of ids) {
        try {
          const row = await reconcileOne(id, priorRefs.get(id) || null);
          if (row) records.set(id, row);
        } catch (error) {
          const row = await reconcileFailure(id, priorRefs.get(id) || null, error);
          if (row) records.set(id, row);
        }
      }
      return rewriteOutcome(outcome, records);
    }

    const wrapped = Object.assign({}, base, {
      version: String(base.version || 'settlement-pipeline') + '+shadow-guard-v1',
      __shadow_guarded: true,
      settleScope: (...args) => guardedCall('settleScope', args),
      recalculateDateRegion: (...args) => guardedCall('recalculateDateRegion', args),
      recalculatePartnerFromDate: (...args) => guardedCall('recalculatePartnerFromDate', args),
      parseAndSaveMessage: (...args) => guardedCall('parseAndSaveMessage', args),
      cancelMessage: (...args) => guardedCall('cancelMessage', args),
      restoreMessage: (...args) => guardedCall('restoreMessage', args)
    });
    global.KTS_SETTLEMENT_PIPELINE = Object.freeze(wrapped);
  }

  global.KTS_SETTLEMENT_SHADOW_GUARD = Object.freeze({
    version: 'settlement-shadow-guard-v1',
    isConflict,
    staleReference,
    collectScopeIds,
    rewriteOutcome,
    install
  });

  if (global.document && global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})(typeof window !== 'undefined' ? window : globalThis);
