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

  function candidateRows(row) {
    if(row==null)return [];
    if(row.key!==META_KEY||row.version!==1||!Array.isArray(row.candidates))
      throw new Error('REGRESSION_CANDIDATE_METADATA_CORRUPTED');
    return row.candidates;
  }
  function goldenRows(row,regression) {
    if(row==null)return [];
    if(row.key!==regression.META_KEY||row.version!==1||!Array.isArray(row.cases))
      throw new Error('REGRESSION_GOLDEN_METADATA_CORRUPTED');
    return row.cases;
  }
  function atomicStore() {
    const {store}=deps();
    if(typeof store.mutateMetadataAtomically!=='function')
      throw new Error('REGRESSION_CANDIDATE_ATOMIC_STORE_REQUIRED');
    return store;
  }
  async function readMeta() {
    const {store}=deps();
    const row=await store.get(store.STORES.metadata,META_KEY);
    candidateRows(row);
    return row||{key:META_KEY,version:1,candidates:[]};
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
    let captured=null;
    await atomicStore().mutateMetadataAtomically(META_KEY,row=>{
      const cases=candidateRows(row);
      const existing=cases.find(c=>String(c.id)===candidate.id);
      if(existing){
        const persisted=normalizeCandidate(existing);
        // Event IDs are durable evidence identities. A second observation
        // with the same ID but changed HIOSKT/KTS money or canonical replay
        // must be flagged as a collision, never swallowed as a duplicate.
        const evidenceShape=c=>{
          const immutableCase=clone(c.case);
          // Generated timestamps and operator notes do not change the
          // underlying canonical replay or independent monetary evidence.
          delete immutableCase.pinned_at;
          delete immutableCase.note;
          return {
            source_event_id:c.source_event_id,
            case:immutableCase,
            source_comparison_status:c.source_comparison_status,
            local_final:c.local_final,
            reference_final:c.reference_final,
            final_delta:c.final_delta
          };
        };
        if(JSON.stringify(evidenceShape(persisted))!==
           JSON.stringify(evidenceShape(candidate)))
          throw new Error('REGRESSION_CANDIDATE_EVENT_ID_CONFLICT');
        captured=persisted;
        return row;
      }
      captured=candidate;
      const next=cases.concat([candidate]);
      return {key:META_KEY,version:1,updated_at:nowIso(),candidates:next};
    });
    return captured;
  }

  async function captureScope(scope) {
    const { runtime } = deps();
    const history = await runtime.getHistory(scope || {});
    const mismatches = (history || []).filter(event => String(event.comparison_status || '').toUpperCase() === 'MISMATCH');
    if (!mismatches.length) throw new Error('REGRESSION_CANDIDATE_MISMATCH_EVIDENCE_NOT_FOUND');
    return captureEvidence(mismatches[mismatches.length - 1], { note: 'Captured from shadow mismatch' });
  }

  async function confirmAndPin(id, options) {
    if(!options||options.reference_confirmed!==true)
      throw new Error('REGRESSION_CANDIDATE_REFERENCE_CONFIRMATION_REQUIRED');
    const d=deps();
    const store=d.store,regression=d.regression;
    if(typeof store.mutateMetadataRowsAtomically!=='function'||
       typeof regression.normalizeCase!=='function'||!regression.META_KEY)
      throw new Error('REGRESSION_CANDIDATE_ATOMIC_PROMOTION_REQUIRED');
    const target=String(id);
    return store.mutateMetadataRowsAtomically([META_KEY,regression.META_KEY],rows=>{
      const candidates=candidateRows(rows[META_KEY]).map(normalizeCandidate);
      const index=candidates.findIndex(c=>c.id===target);
      if(index<0)throw new Error('REGRESSION_CANDIDATE_NOT_FOUND');
      const c=candidates[index];
      if(c.state===STATES.DISMISSED)throw new Error('REGRESSION_CANDIDATE_DISMISSED');
      // An existing golden case must never be overwritten by a different
      // unverified reference (including an older case with matching ID).
      const golden=goldenRows(rows[regression.META_KEY],regression);
      const pinned=regression.normalizeCase(c.case);
      const current=golden.find(row=>row.id===pinned.id);
      if(current&&JSON.stringify(current)!==JSON.stringify(pinned))
        throw new Error('REGRESSION_GOLDEN_CONFLICTING_CASE');
      if(c.state===STATES.PROMOTED&&!current)
        throw new Error('REGRESSION_CANDIDATE_PROMOTION_INCOMPLETE');
      if(c.state===STATES.PENDING){
        c.state=STATES.PROMOTED;
        c.promoted_at=nowIso();
        c.updated_at=c.promoted_at;
        c.confirmation_note=String(options.note||'HIOSKT reference confirmed by operator');
      }
      candidates[index]=c;
      return {
        rows:{
          [META_KEY]:{key:META_KEY,version:1,updated_at:nowIso(),candidates},
          [regression.META_KEY]:{key:regression.META_KEY,version:1,
            updated_at:nowIso(),cases:current?golden:golden.concat([pinned])}
        },
        result:c
      };
    });
  }

  async function dismissCandidate(id,reason) {
    const wanted=String(id);
    let dismissed=null;
    await atomicStore().mutateMetadataAtomically(META_KEY,row=>{
      const candidates=candidateRows(row).map(normalizeCandidate);
      const index=candidates.findIndex(c=>c.id===wanted);
      if(index<0)throw new Error('REGRESSION_CANDIDATE_NOT_FOUND');
      const c=candidates[index];
      if(c.state===STATES.PROMOTED)throw new Error('REGRESSION_CANDIDATE_ALREADY_PROMOTED');
      if(c.state!==STATES.DISMISSED){
        c.state=STATES.DISMISSED;
        c.dismissed_at=nowIso();
        c.updated_at=c.dismissed_at;
        c.dismiss_reason=String(reason||'dismissed by operator');
      }
      dismissed=c;
      candidates[index]=c;
      return {key:META_KEY,version:1,updated_at:nowIso(),candidates};
    });
    return dismissed;
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
