(function (global) {
  'use strict';

  const META_KEY = 'shadow_regression_candidates_v1';
  const FORMAT = 'kts-shadow-regression-candidate-v1';
  const STATES = Object.freeze({ PENDING: 'pending', PROMOTED: 'promoted', DISMISSED: 'dismissed' });

  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
  function nowIso() { return new Date().toISOString(); }
  function deps() {
    const store = global.KTS_SETTLEMENT_STORE;
    const runtime = global.KTS_SETTLEMENT_SHADOW_RUNTIME;
    const regression = global.KTS_SETTLEMENT_REGRESSION_CASES;
    if (!store || !runtime || !regression) throw new Error('REGRESSION_CANDIDATE_DEPENDENCY_MISSING');
    return { store, runtime, regression };
  }
  function candidateId(event) {
    if (!event || !event.id) throw new Error('REGRESSION_CANDIDATE_EVENT_ID_REQUIRED');
    return 'candidate:' + String(event.id);
  }
  function normalizeCandidate(input) {
    if (!input || typeof input !== 'object') throw new Error('REGRESSION_CANDIDATE_REQUIRED');
    const state = String(input.state || STATES.PENDING).toLowerCase();
    if (!Object.values(STATES).includes(state)) throw new Error('REGRESSION_CANDIDATE_STATE_INVALID');
    if (!input.case || typeof input.case !== 'object') throw new Error('REGRESSION_CANDIDATE_CASE_REQUIRED');
    const scope = input.case.scope || {};
    if (!scope.partner_id || !scope.business_date || !scope.region) throw new Error('REGRESSION_CANDIDATE_SCOPE_REQUIRED');
    const sourceEventId = String(input.source_event_id || input.case.source_event_id || '');
    if (!sourceEventId) throw new Error('REGRESSION_CANDIDATE_SOURCE_EVENT_REQUIRED');
    return {
      format: FORMAT,
      id: String(input.id || ('candidate:' + sourceEventId)),
      source_event_id: sourceEventId,
      state,
      created_at: input.created_at || nowIso(),
      updated_at: input.updated_at || nowIso(),
      promoted_at: input.promoted_at || null,
      dismissed_at: input.dismissed_at || null,
      confirmation_note: String(input.confirmation_note || ''),
      dismiss_reason: String(input.dismiss_reason || ''),
      source_comparison_status: String(input.source_comparison_status || 'MISMATCH').toUpperCase(),
      local_final: input.local_final == null ? null : String(input.local_final),
      reference_final: input.reference_final == null ? null : String(input.reference_final),
      final_delta: input.final_delta == null ? null : String(input.final_delta),
      case: clone(input.case)
    };
  }

  async function readMeta() {
    const { store } = deps();
    const row = await store.get(store.STORES.metadata, META_KEY);
    return row && Array.isArray(row.candidates) ? row : { key: META_KEY, version: 1, candidates: [] };
  }
  function requestPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('REGRESSION_CANDIDATE_WRITE_FAILED'));
    });
  }
  function txPromise(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('REGRESSION_CANDIDATE_TX_FAILED'));
      tx.onabort = () => reject(tx.error || new Error('REGRESSION_CANDIDATE_TX_ABORTED'));
    });
  }
  async function writeMeta(row) {
    const { store } = deps();
    if (typeof store.saveMetadata === 'function') return store.saveMetadata(META_KEY, row);
    if (typeof store.openDb !== 'function') throw new Error('REGRESSION_CANDIDATE_STORE_UNAVAILABLE');
    const db = await store.openDb();
    try {
      const tx = db.transaction(store.STORES.metadata, 'readwrite');
      const req = tx.objectStore(store.STORES.metadata).put(clone(row));
      await requestPromise(req);
      await txPromise(tx);
    } finally { db.close(); }
    return row;
  }

  async function listCandidates(options) {
    const row = await readMeta();
    const state = options && options.state ? String(options.state).toLowerCase() : '';
    return row.candidates.map(normalizeCandidate)
      .filter(c => !state || c.state === state)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }

  async function captureEvidence(event, options) {
    if (!event || String(event.comparison_status || event.comparison && event.comparison.status || '').toUpperCase() !== 'MISMATCH') {
      throw new Error('REGRESSION_CANDIDATE_MISMATCH_ONLY');
    }
    const d = deps();
    const replay = await d.regression.caseFromEvidence(event, { note: options && options.note || 'Pending HIOSKT reference confirmation' });
    const local = event.local_snapshot && event.local_snapshot.settlement_result || {};
    const ref = event.reference_snapshot && event.reference_snapshot.totals || {};
    const cmp = event.comparison && event.comparison.totals && event.comparison.totals.final_net || {};
    const candidate = normalizeCandidate({
      id: candidateId(event),
      source_event_id: String(event.id),
      state: STATES.PENDING,
      created_at: event.observed_at || nowIso(),
      source_comparison_status: 'MISMATCH',
      local_final: local.exact && local.exact.final_net != null ? local.exact.final_net : local.final_net,
      reference_final: ref.final,
      final_delta: cmp.delta,
      case: replay
    });
    const row = await readMeta();
    const existing = row.candidates.find(c => String(c.id) === candidate.id);
    if (existing) return normalizeCandidate(existing);
    row.candidates.push(candidate);
    row.updated_at = nowIso();
    await writeMeta(row);
    return candidate;
  }

  async function captureScope(scope) {
    const { runtime } = deps();
    const history = await runtime.getHistory(scope || {});
    const mismatches = (history || []).filter(event => String(event.comparison_status || '').toUpperCase() === 'MISMATCH');
    if (!mismatches.length) throw new Error('REGRESSION_CANDIDATE_MISMATCH_EVIDENCE_NOT_FOUND');
    return captureEvidence(mismatches[mismatches.length - 1], { note: 'Captured from shadow mismatch' });
  }

  async function confirmAndPin(id, options) {
    if (!options || options.reference_confirmed !== true) throw new Error('REGRESSION_CANDIDATE_REFERENCE_CONFIRMATION_REQUIRED');
    const d = deps();
    const row = await readMeta();
    const index = row.candidates.findIndex(c => String(c.id) === String(id));
    if (index < 0) throw new Error('REGRESSION_CANDIDATE_NOT_FOUND');
    const candidate = normalizeCandidate(row.candidates[index]);
    if (candidate.state === STATES.DISMISSED) throw new Error('REGRESSION_CANDIDATE_DISMISSED');
    await d.regression.pinCase(candidate.case);
    candidate.state = STATES.PROMOTED;
    candidate.promoted_at = nowIso();
    candidate.updated_at = candidate.promoted_at;
    candidate.confirmation_note = String(options.note || 'HIOSKT reference confirmed by operator');
    row.candidates[index] = candidate;
    row.updated_at = candidate.updated_at;
    await writeMeta(row);
    return candidate;
  }

  async function dismissCandidate(id, reason) {
    const row = await readMeta();
    const index = row.candidates.findIndex(c => String(c.id) === String(id));
    if (index < 0) throw new Error('REGRESSION_CANDIDATE_NOT_FOUND');
    const candidate = normalizeCandidate(row.candidates[index]);
    if (candidate.state === STATES.PROMOTED) throw new Error('REGRESSION_CANDIDATE_ALREADY_PROMOTED');
    candidate.state = STATES.DISMISSED;
    candidate.dismissed_at = nowIso();
    candidate.updated_at = candidate.dismissed_at;
    candidate.dismiss_reason = String(reason || 'dismissed by operator');
    row.candidates[index] = candidate;
    row.updated_at = candidate.updated_at;
    await writeMeta(row);
    return candidate;
  }

  function mismatchScopesFromSavedDetail(detail) {
    const d = detail || {};
    if (d.batch && Array.isArray(d.results)) {
      return d.results.filter(r => String(r.comparison_status || '').toUpperCase() === 'MISMATCH').map(r => ({
        partner_id: r.partner_id,
        business_date: r.business_date,
        region: r.region
      }));
    }
    if (String(d.comparison_status || '').toUpperCase() === 'MISMATCH' && d.partner_id && d.business_date && d.region) {
      return [{ partner_id: d.partner_id, business_date: d.business_date, region: d.region }];
    }
    return [];
  }

  async function captureFromSavedDetail(detail) {
    const scopes = mismatchScopesFromSavedDetail(detail);
    const results = [];
    for (const scope of scopes) {
      try { results.push({ scope, candidate: await captureScope(scope), error: null }); }
      catch (error) { results.push({ scope, candidate: null, error: String(error && error.message || error) }); }
    }
    return results;
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }
  function installUi() {
    const doc = global.document;
    const pane = doc && doc.getElementById('pane-report');
    if (!pane || doc.getElementById('regressionCandidatePanel')) return;
    const card = doc.createElement('div');
    card.className = 'card';
    card.id = 'regressionCandidatePanel';
    card.innerHTML = `
      <div class="section-title">Regression candidate · chờ xác nhận</div>
      <div class="hint">Mismatch từ Shadow được gom thành candidate nhưng <b>không tự trở thành golden</b>. Chỉ bấm xác nhận khi bạn đã kiểm tra số HIOSKT/reference là đúng. Sau khi ghim, case sẽ chặn promotion cho tới khi engine khớp exact.</div>
      <div class="row" style="margin-top:8px"><button id="regressionCandidateRefresh" class="btn soft">Nạp candidate</button></div>
      <div id="regressionCandidateStatus" class="status"></div><div id="regressionCandidateOutput" class="hint"></div>`;
    pane.appendChild(card);

    function status(text, kind) {
      const el = doc.getElementById('regressionCandidateStatus');
      el.textContent = text || '';
      el.className = 'status ' + (kind || '');
    }
    async function render() {
      const host = doc.getElementById('regressionCandidateOutput');
      const rows = await listCandidates({ state: STATES.PENDING });
      if (!rows.length) {
        host.innerHTML = '<div class="hint">Không có candidate đang chờ xác nhận.</div>';
        return rows;
      }
      host.innerHTML = rows.map(c => {
        const s = c.case.scope || {};
        const delta = c.final_delta == null ? '—' : c.final_delta;
        return `<div class="report-message" data-candidate="${esc(c.id)}"><div><span class="tag err">MISMATCH</span> <b>${esc(s.business_date)} ${esc(String(s.region || '').toUpperCase())}</b> · ${esc(s.partner_id)}</div>`+
          `<div class="hint">THU/BÙ KTS ${esc(c.local_final == null ? '—' : c.local_final)} · HIOSKT ${esc(c.reference_final == null ? '—' : c.reference_final)} · lệch ${esc(delta)}</div>`+
          `<div class="row" style="margin-top:6px"><button class="btn primary" data-action="promote" data-id="${esc(c.id)}">Xác nhận HIOSKT đúng + Ghim golden</button><button class="btn soft" data-action="dismiss" data-id="${esc(c.id)}">Bỏ candidate</button></div></div>`;
      }).join('');
      host.querySelectorAll('[data-action="promote"]').forEach(btn => btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (typeof global.confirm === 'function' && !global.confirm('Xác nhận số HIOSKT/reference của case này là đúng? Case sẽ được ghim làm golden regression.')) return;
        try {
          btn.disabled = true;
          await confirmAndPin(id, { reference_confirmed: true, note: 'Confirmed from regression candidate UI' });
          status('Đã ghim golden. Nếu engine hiện còn lệch, regression gate sẽ FAIL cho tới khi sửa khớp.', 'warn');
          await render();
          if (typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') global.dispatchEvent(new global.CustomEvent('kts:regression-candidates-changed'));
        } catch (error) { status(String(error && error.message || error), 'err'); btn.disabled = false; }
      }));
      host.querySelectorAll('[data-action="dismiss"]').forEach(btn => btn.addEventListener('click', async () => {
        try { await dismissCandidate(btn.getAttribute('data-id'), 'dismissed from candidate UI'); status('Đã bỏ candidate; không ghim golden.', 'ok'); await render(); }
        catch (error) { status(String(error && error.message || error), 'err'); }
      }));
      return rows;
    }
    doc.getElementById('regressionCandidateRefresh').addEventListener('click', () => render().catch(error => status(String(error && error.message || error), 'err')));
    render().catch(() => {});

    if (typeof global.addEventListener === 'function') {
      global.addEventListener('kts:shadow-saved', event => {
        const scopes = mismatchScopesFromSavedDetail(event && event.detail);
        if (!scopes.length) return;
        captureFromSavedDetail(event.detail).then(() => render()).then(() => status(`Đã gom ${scopes.length} mismatch thành regression candidate chờ xác nhận.`, 'warn')).catch(error => status(String(error && error.message || error), 'err'));
      });
    }
  }

  global.KTS_SETTLEMENT_REGRESSION_CANDIDATES = Object.freeze({
    version: 'settlement-regression-candidates-v1', META_KEY, FORMAT, STATES,
    normalizeCandidate, listCandidates, captureEvidence, captureScope,
    confirmAndPin, dismissCandidate, mismatchScopesFromSavedDetail, captureFromSavedDetail
  });

  if (global.document && global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', installUi, { once: true });
  else if (global.document) installUi();
})(typeof window !== 'undefined' ? window : globalThis);
