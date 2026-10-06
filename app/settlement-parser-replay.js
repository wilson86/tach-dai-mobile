(function (global) {
  'use strict';

  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
  function esc(v) { return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
  function deps() {
    const candidates = global.KTS_SETTLEMENT_REGRESSION_CANDIDATES;
    const runtime = global.KTS_SETTLEMENT_SHADOW_RUNTIME;
    const parser = global.KTS_SETTLEMENT_PARSER_PROVIDER;
    const regression = global.KTS_SETTLEMENT_REGRESSION_CASES;
    if (!candidates || !runtime || !parser || !regression) throw new Error('PARSER_REPLAY_DEPENDENCY_MISSING');
    return { candidates, runtime, parser, regression };
  }
  function scopeFromCandidate(candidate) {
    const s = candidate && candidate.case && candidate.case.scope || {};
    if (!s.partner_id || !s.business_date || !s.region) throw new Error('PARSER_REPLAY_SCOPE_REQUIRED');
    return { partner_id:String(s.partner_id), business_date:String(s.business_date), region:String(s.region).toLowerCase() };
  }
  function stakeCanonical(v) {
    const text = String(v == null ? '' : v).trim().replace(',', '.');
    const n = Number(text);
    return Number.isFinite(n) ? String(n) : text;
  }
  function canonicalShape(payload, requestedRegion) {
    const p = payload || {};
    const region = String(p.region || requestedRegion || '').toLowerCase();
    return {
      region,
      legs: (Array.isArray(p.legs) ? p.legs : []).map(leg => ({
        code: String(leg && leg.code || '').toUpperCase(),
        values: Array.isArray(leg && leg.values) ? leg.values.map(String) : [],
        stake: stakeCanonical(leg && leg.stake),
        action: String(leg && leg.action || '').toLowerCase(),
        position: leg && leg.position != null ? String(leg.position).toLowerCase() : null,
        station_codes: Array.isArray(leg && leg.station_codes) ? leg.station_codes.map(x => String(x).toLowerCase()) : [],
        inherited_values: Boolean(leg && leg.inherited_values)
      }))
    };
  }
  function canonicalDiff(captured, current, requestedRegion) {
    const a = canonicalShape(captured, requestedRegion), b = canonicalShape(current, requestedRegion), out = [];
    if (a.region !== b.region) out.push({ path:'region', captured:a.region, current:b.region });
    if (a.legs.length !== b.legs.length) out.push({ path:'legs.length', captured:a.legs.length, current:b.legs.length });
    const fields = ['code','values','stake','action','position','station_codes','inherited_values'];
    const count = Math.max(a.legs.length, b.legs.length);
    for (let i=0;i<count;i++) {
      if (!a.legs[i] || !b.legs[i]) continue;
      for (const field of fields) {
        const av = a.legs[i][field], bv = b.legs[i][field];
        if (JSON.stringify(av) !== JSON.stringify(bv)) out.push({ path:`legs[${i}].${field}`, captured:clone(av), current:clone(bv) });
      }
    }
    return out;
  }
  function comparisonIssues(comparison) {
    const out = [];
    const c = comparison || {};
    for (const [field,row] of Object.entries(c.totals || {})) {
      const status = String(row && row.status || '').toUpperCase();
      if (status && !['MATCH_EXACT','NOT_COMPARABLE'].includes(status)) out.push({ kind:'total', code:null, field, status, local:row.local, reference:row.reference, delta:row.delta });
    }
    for (const cat of (c.categories || [])) {
      for (const [field,row] of Object.entries(cat && cat.fields || {})) {
        const status = String(row && row.status || '').toUpperCase();
        if (status && !['MATCH_EXACT','NOT_COMPARABLE'].includes(status)) out.push({ kind:'category', code:String(cat.code || '').toUpperCase(), field, status, local:row.local, reference:row.reference, delta:row.delta });
      }
    }
    return out;
  }
  async function replayCandidate(candidate, event, apis) {
    if (!candidate || !candidate.case) throw new Error('PARSER_REPLAY_CANDIDATE_REQUIRED');
    const scope = scopeFromCandidate(candidate);
    const d = apis || deps();
    const nextCase = clone(candidate.case);
    const messages = Array.isArray(nextCase.messages) ? nextCase.messages : [];
    const messageResults = [];
    let changed = 0, errors = 0;
    for (const message of messages) {
      const id = String(message && message.id || '');
      if (String(message && message.status || '').toLowerCase() === 'cancelled') {
        messageResults.push({ message_id:id, status:'SKIPPED_CANCELLED', changed:false, differences:[] });
        continue;
      }
      const raw = String(message && message.raw_text || '').trim();
      if (!raw) {
        errors += 1;
        messageResults.push({ message_id:id, status:'PARSER_REPLAY_ERROR', changed:null, differences:[], error:'PARSER_REPLAY_RAW_TEXT_REQUIRED' });
        continue;
      }
      try {
        const current = await d.parser.fetchCanonical(raw, scope.region, scope.business_date);
        const differences = canonicalDiff(message.canonical_payload, current, scope.region);
        const isChanged = differences.length > 0;
        if (isChanged) changed += 1;
        messageResults.push({
          message_id:id,
          status:isChanged ? 'CANONICAL_CHANGED' : 'CANONICAL_UNCHANGED',
          changed:isChanged,
          differences,
          captured_parser_version: message.canonical_payload && message.canonical_payload.parser_version || null,
          current_parser_version: current && current.parser_version || null,
          captured_canonical: canonicalShape(message.canonical_payload, scope.region),
          current_canonical: canonicalShape(current, scope.region)
        });
        message.canonical_payload = clone(current);
      } catch (error) {
        errors += 1;
        messageResults.push({ message_id:id, status:'PARSER_REPLAY_ERROR', changed:null, differences:[], error:String(error && error.message || error) });
      }
    }
    const base = {
      format:'kts-parser-replay-v1', diagnostic_only:true, candidate_id:String(candidate.id || ''), source_event_id:String(candidate.source_event_id || event && event.id || ''), scope,
      parser_endpoint: typeof d.parser.endpoint === 'function' ? d.parser.endpoint() : null,
      message_count:messages.length, changed_message_count:changed, error_count:errors, messages:messageResults,
      captured_comparison_status:String(event && event.comparison_status || event && event.comparison && event.comparison.status || '').toUpperCase()
    };
    if (errors) return Object.assign(base, { status:'PARSER_REPLAY_ERROR', reference_match_exact:false, comparison:null, current_issues:[], current_final_delta:null, error:'PARSER_REPLAY_MESSAGE_ERRORS:' + errors });
    try {
      const replay = d.regression.replayCase(nextCase);
      const comparison = replay && replay.comparison || {};
      const exact = Boolean(replay && replay.pass && comparison.safe_to_promote === true);
      const status = changed
        ? (exact ? 'CANONICAL_CHANGED_REPLAY_EXACT' : 'CANONICAL_CHANGED_STILL_MISMATCH')
        : (exact ? 'CANONICAL_UNCHANGED_ENGINE_EXACT' : 'CANONICAL_UNCHANGED_STILL_MISMATCH');
      const finalRow = comparison.totals && comparison.totals.final_net || null;
      return Object.assign(base, {
        status,
        reference_match_exact:exact,
        current_engine_version:replay && replay.settlement && replay.settlement.engine_version || null,
        comparison:clone(comparison),
        current_issues:comparisonIssues(comparison),
        current_final_delta:finalRow && finalRow.delta != null ? finalRow.delta : null,
        replayed_case:nextCase,
        error:null
      });
    } catch (error) {
      return Object.assign(base, { status:'PARSER_ENGINE_REPLAY_ERROR', reference_match_exact:false, comparison:null, current_issues:[], current_final_delta:null, error:String(error && error.message || error) });
    }
  }
  async function candidateAndEvent(candidateId) {
    const d = deps();
    const pending = await d.candidates.listCandidates({ state:d.candidates.STATES.PENDING });
    const candidate = pending.find(c => String(c.id || '') === String(candidateId || ''));
    if (!candidate) throw new Error('PARSER_REPLAY_CANDIDATE_NOT_FOUND:' + String(candidateId || ''));
    const scope = scopeFromCandidate(candidate);
    const history = await d.runtime.getHistory(scope);
    const event = (history || []).find(row => String(row.id || '') === String(candidate.source_event_id || ''));
    if (!event) throw new Error('PARSER_REPLAY_EVIDENCE_NOT_FOUND:' + String(candidate.source_event_id || ''));
    return { candidate, event };
  }
  async function replayCandidateId(candidateId) {
    const pair = await candidateAndEvent(candidateId);
    return replayCandidate(pair.candidate, pair.event);
  }
  async function replayGroup(candidateIds) {
    const results = [];
    for (const id of (candidateIds || [])) {
      try { results.push(await replayCandidateId(id)); }
      catch (error) { results.push({ format:'kts-parser-replay-v1', diagnostic_only:true, candidate_id:String(id), status:'PARSER_REPLAY_ERROR', reference_match_exact:false, error:String(error && error.message || error), messages:[], current_issues:[] }); }
    }
    return { format:'kts-parser-replay-group-v1', total:results.length, exact:results.filter(x => x.reference_match_exact).length, errors:results.filter(x => /ERROR$/.test(String(x.status || ''))).length, results };
  }

  function installUi() {
    const doc = global.document, pane = doc && doc.getElementById('pane-report');
    if (!pane || doc.getElementById('parserReplayPanel')) return;
    const card = doc.createElement('div');
    card.className = 'card'; card.id = 'parserReplayPanel';
    card.innerHTML = `<div class="section-title">Parser replay · raw text → parser hiện tại</div>
      <div class="hint">Chỉ chạy khi bấm nút. Dùng lại raw_text evidence, gọi canonical parser hiện tại rồi replay bằng engine hiện tại trên đúng config + KQXS đã chụp. Không ghi settlement, không dismiss candidate, không xác nhận HIOSKT.</div>
      <div id="parserReplayStatus" class="status"></div><div id="parserReplayControls" class="hint">Mở một nhóm mismatch trước.</div><div id="parserReplayOutput" class="hint"></div>`;
    pane.appendChild(card);
    let activeIds = [];
    function status(text, kind) { const el=doc.getElementById('parserReplayStatus'); el.textContent=text||''; el.className='status '+(kind||''); }
    function renderResult(row) {
      if (/ERROR$/.test(String(row.status || ''))) return `<div class="report-message"><span class="tag err">${esc(row.status)}</span> <b>${esc(row.candidate_id)}</b><div class="status err">${esc(row.error || 'unknown')}</div></div>`;
      const ok = row.reference_match_exact;
      const msg = (row.messages || []).map(m => {
        if (m.status === 'SKIPPED_CANCELLED') return `<div class="hint">${esc(m.message_id)} · đã hủy · bỏ qua</div>`;
        if (m.status === 'PARSER_REPLAY_ERROR') return `<div class="status err">${esc(m.message_id)} · ${esc(m.error)}</div>`;
        const diff = m.differences && m.differences.length ? `<details><summary class="hint">Canonical thay đổi ${m.differences.length} field</summary><div class="raw">${esc(JSON.stringify(m.differences,null,2))}</div></details>` : '<div class="hint">Canonical không đổi.</div>';
        return `<div class="report-message"><b>${esc(m.message_id)}</b> · ${m.changed ? '<span class="tag warn">CANONICAL CHANGED</span>' : '<span class="tag ok">CANONICAL UNCHANGED</span>'}<div class="hint">parser cũ ${esc(m.captured_parser_version || '—')} → hiện tại ${esc(m.current_parser_version || '—')}</div>${diff}</div>`;
      }).join('');
      const issues = row.current_issues && row.current_issues.length ? `<details><summary class="hint">Field còn lệch (${row.current_issues.length})</summary><div class="raw">${esc(JSON.stringify(row.current_issues,null,2))}</div></details>` : '<div class="hint">Không còn field tiền lệch.</div>';
      return `<div class="report-message"><div>${ok ? '<span class="tag ok">PARSER + ENGINE · MATCH_EXACT</span>' : `<span class="tag err">${esc(row.status)}</span>`} <b>${esc(row.scope && row.scope.business_date || '')} ${esc(String(row.scope && row.scope.region || '').toUpperCase())}</b></div><div class="hint">canonical đổi ${row.changed_message_count}/${row.message_count} tin · final delta ${esc(row.current_final_delta == null ? '—' : row.current_final_delta)} · endpoint ${esc(row.parser_endpoint || '—')}</div>${msg}${issues}<div class="hint">Kết quả này chỉ là diagnostic. Candidate vẫn PENDING cho tới khi xử lý thủ công.</div></div>`;
    }
    async function run(ids) {
      if (!ids.length) return;
      status('Đang gọi parser hiện tại và replay…', 'warn');
      const result = await replayGroup(ids);
      doc.getElementById('parserReplayOutput').innerHTML = result.results.map(renderResult).join('');
      status(`Parser replay xong ${result.total} case · MATCH_EXACT ${result.exact} · lỗi ${result.errors}. Không có dữ liệu nghiệp vụ nào bị ghi.`, result.errors ? 'warn' : (result.exact === result.total ? 'ok' : 'warn'));
      if (card.scrollIntoView) card.scrollIntoView({ behavior:'smooth', block:'start' });
    }
    function renderControls() {
      const host = doc.getElementById('parserReplayControls');
      if (!activeIds.length) { host.textContent='Mở một nhóm mismatch trước.'; return; }
      const endpoint = global.KTS_SETTLEMENT_PARSER_PROVIDER && global.KTS_SETTLEMENT_PARSER_PROVIDER.endpoint ? global.KTS_SETTLEMENT_PARSER_PROVIDER.endpoint() : '—';
      host.innerHTML = `<div class="hint">${activeIds.length} candidate · parser endpoint: ${esc(endpoint)}</div><div class="row" style="margin-top:6px"><button id="parserReplayGroup" class="btn soft">Replay parser cả nhóm</button></div>` + activeIds.map((id,i)=>`<div class="row" style="margin-top:5px"><span class="hint" style="flex:1">${esc(id)}</span><button class="btn soft" data-parser-replay-one="${i}">Replay parser</button></div>`).join('');
      doc.getElementById('parserReplayGroup').addEventListener('click', () => run(activeIds.slice()).catch(e=>status(String(e&&e.message||e),'err')));
      host.querySelectorAll('[data-parser-replay-one]').forEach(btn => btn.addEventListener('click', () => {
        const id = activeIds[Number(btn.getAttribute('data-parser-replay-one'))];
        run(id ? [id] : []).catch(e=>status(String(e&&e.message||e),'err'));
      }));
    }
    if (typeof global.addEventListener === 'function') global.addEventListener('kts:repair-open', event => {
      activeIds = (event && event.detail && event.detail.candidate_ids || []).map(String);
      doc.getElementById('parserReplayOutput').innerHTML = '';
      renderControls();
      status('Đã nạp nhóm. Parser chưa được gọi; bấm Replay khi cần kiểm tra parser hiện tại.', 'warn');
    });
  }

  global.KTS_SETTLEMENT_PARSER_REPLAY = Object.freeze({
    version:'settlement-parser-replay-v1', canonicalShape, canonicalDiff, comparisonIssues, replayCandidate, candidateAndEvent, replayCandidateId, replayGroup
  });
  if (global.document && global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', installUi, { once:true });
  else if (global.document) installUi();
})(typeof window !== 'undefined' ? window : globalThis);
