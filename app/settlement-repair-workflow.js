(function (global) {
  'use strict';

  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }
  function deps() {
    const candidates = global.KTS_SETTLEMENT_REGRESSION_CANDIDATES;
    const runtime = global.KTS_SETTLEMENT_SHADOW_RUNTIME;
    const store = global.KTS_SETTLEMENT_STORE;
    const regression = global.KTS_SETTLEMENT_REGRESSION_CASES;
    if (!candidates || !runtime || !store || !regression) throw new Error('REPAIR_WORKFLOW_DEPENDENCY_MISSING');
    return { candidates, runtime, store, regression };
  }
  function scopeFromCandidate(candidate) {
    const s = candidate && candidate.case && candidate.case.scope || {};
    if (!s.partner_id || !s.business_date || !s.region) throw new Error('REPAIR_SCOPE_REQUIRED');
    return { partner_id: String(s.partner_id), business_date: String(s.business_date), region: String(s.region).toLowerCase() };
  }
  function fieldIssueRows(fields, prefix) {
    const rows = [];
    for (const [field, value] of Object.entries(fields || {})) {
      const status = String(value && value.status || '').toUpperCase();
      if (!status || status === 'MATCH_EXACT' || status === 'NOT_COMPARABLE') continue;
      rows.push({
        kind: prefix.kind,
        code: prefix.code || null,
        field: String(field),
        status,
        local: value && value.local != null ? value.local : null,
        reference: value && value.reference != null ? value.reference : null,
        delta: value && value.delta != null ? value.delta : null
      });
    }
    return rows;
  }
  function issueRowsFromComparison(comparison) {
    const c = comparison || {};
    const rows = [];
    rows.push(...fieldIssueRows(c.totals, { kind: 'total' }));
    for (const category of (c.categories || [])) {
      const code = String(category && category.code || '').toUpperCase();
      rows.push(...fieldIssueRows(category && category.fields, { kind: 'category', code }));
    }
    return rows;
  }
  function issueRowsFromEvent(event) {
    return issueRowsFromComparison(event && event.comparison || {});
  }
  function issueKey(row) {
    return [String(row && row.kind || ''), String(row && row.code || ''), String(row && row.field || '')].join(':');
  }
  function issueCodes(rows) {
    return [...new Set((rows || []).filter(r => r.kind === 'category' && r.code).map(r => String(r.code).toUpperCase()))];
  }
  function messageMatchesCodes(message, codes) {
    if (!codes.length) return true;
    const legs = message && message.canonical_payload && message.canonical_payload.legs || [];
    return legs.some(leg => codes.includes(String(leg && leg.code || '').toUpperCase()));
  }
  function relevantMessages(event, issues) {
    const messages = event && event.local_snapshot && event.local_snapshot.messages || [];
    const codes = issueCodes(issues);
    const matched = messages.filter(m => messageMatchesCodes(m, codes));
    return clone(matched.length ? matched : messages);
  }
  function pricingKeysForIssues(issues) {
    const map = { '3CXC': '3CDD' };
    return [...new Set((issues || []).filter(r => r.kind === 'category' && r.code).map(r => map[r.code] || r.code))];
  }
  function relevantPricing(config, region, issues) {
    const regionPricing = config && config.region_pricing && (config.region_pricing[region] || (region === 'mt' ? config.region_pricing.mn : null)) || {};
    const out = {};
    for (const key of pricingKeysForIssues(issues)) if (regionPricing[key] != null) out[key] = clone(regionPricing[key]);
    return out;
  }
  function diagnosticHints(issues) {
    const fields = new Set((issues || []).map(r => r.field));
    const hints = [];
    if (fields.has('xac') || fields.has('total_xac')) hints.push('Kiểm tra parser expansion, số lượng number/station và XÁC unit của category bị lệch.');
    if (fields.has('qua_co') || fields.has('total_qua_co')) hints.push('Kiểm tra XÁC trước, sau đó commission_type / commission_value / giá theo ngày hiệu lực.');
    if (fields.has('hit_units')) hints.push('Kiểm tra selector KQXS, số nháy và hit-mode của category; không đổi rule nếu chưa có oracle.');
    if (fields.has('payout') || fields.has('total_payout')) hints.push('Kiểm tra hit_units trước rồi mới kiểm tra win_rate của đúng category/ngày.');
    if (fields.has('refund_amount')) hints.push('Kiểm tra vai trò Khách/Chủ, % hồi và điều kiện hồi chỉ áp dụng đúng chiều THU/BÙ.');
    if (fields.has('final_net') && !hints.length) hints.push('Chỉ lệch THU/BÙ: kiểm tra vai trò đối tác, % tổng, % hồi và thứ tự áp dụng; không suy diễn rule mới.');
    return hints;
  }
  function resultSummary(snapshot) {
    const s = snapshot || {};
    return {
      business_date: s.business_date || null,
      region: s.region || null,
      source: s.source || null,
      fingerprint: s.fingerprint || null,
      verification_status: s.verification_status || null,
      verification_sources: clone(s.verification_sources || []),
      verification_reason: s.verification_reason || null,
      verification_conflicts: clone(s.verification_conflicts || []),
      expected_station_codes: clone(s.expected_station_codes || []),
      complete: Boolean(s.complete),
      coverage_complete: s.coverage_complete == null ? null : Boolean(s.coverage_complete)
    };
  }
  function currentReplayAssessment(candidate, event, replayResult, replayError) {
    const originalIssues = issueRowsFromEvent(event);
    const originalKeys = new Set(originalIssues.map(issueKey));
    if (replayError) {
      return {
        basis: 'CAPTURED_CANONICAL',
        status: 'REPLAY_ERROR',
        pass: false,
        safe_to_promote: false,
        source_engine_version: event && event.local_snapshot && event.local_snapshot.engine_version || candidate && candidate.case && candidate.case.engine_version || null,
        current_engine_version: null,
        original_issue_count: originalIssues.length,
        current_issue_count: null,
        current_issues: [],
        resolved_issue_keys: [],
        remaining_issue_keys: [],
        new_issue_keys: [],
        current_final_delta: null,
        error: String(replayError && replayError.message || replayError)
      };
    }
    const comparison = replayResult && replayResult.comparison || {};
    const currentIssues = issueRowsFromComparison(comparison);
    const currentKeys = new Set(currentIssues.map(issueKey));
    const resolved = [...originalKeys].filter(key => !currentKeys.has(key)).sort();
    const remaining = [...originalKeys].filter(key => currentKeys.has(key)).sort();
    const added = [...currentKeys].filter(key => !originalKeys.has(key)).sort();
    const status = String(comparison.status || (replayResult && replayResult.pass ? 'MATCH_EXACT' : 'UNVERIFIED')).toUpperCase();
    const finalRow = comparison.totals && comparison.totals.final_net || null;
    return {
      basis: 'CAPTURED_CANONICAL',
      status,
      pass: Boolean(replayResult && replayResult.pass),
      safe_to_promote: comparison.safe_to_promote === true,
      source_engine_version: event && event.local_snapshot && event.local_snapshot.engine_version || candidate && candidate.case && candidate.case.engine_version || null,
      current_engine_version: replayResult && replayResult.settlement && replayResult.settlement.engine_version || null,
      original_issue_count: originalIssues.length,
      current_issue_count: currentIssues.length,
      current_issues: clone(currentIssues),
      resolved_issue_keys: resolved,
      remaining_issue_keys: remaining,
      new_issue_keys: added,
      current_final_delta: finalRow && finalRow.delta != null ? finalRow.delta : null,
      current_settlement_result: clone(replayResult && replayResult.settlement && replayResult.settlement.settlement_result || null),
      error: null
    };
  }
  function replayCurrent(candidate, event, regressionApi) {
    try {
      const replay = regressionApi.replayCase(candidate.case);
      return currentReplayAssessment(candidate, event, replay, null);
    } catch (error) {
      return currentReplayAssessment(candidate, event, null, error);
    }
  }
  function buildRepairPacket(candidate, event, partner) {
    if (!candidate || !event) throw new Error('REPAIR_EVIDENCE_REQUIRED');
    const scope = scopeFromCandidate(candidate);
    const issues = issueRowsFromEvent(event);
    const local = event.local_snapshot || {};
    const config = local.config_snapshot || candidate.case && candidate.case.config_snapshot || null;
    const lottery = local.lottery_result_snapshot || candidate.case && candidate.case.lottery_result_snapshot || null;
    return {
      format: 'kts-shadow-repair-packet-v2-current-replay',
      candidate_id: String(candidate.id || ''),
      source_event_id: String(candidate.source_event_id || event.id || ''),
      scope,
      partner: partner ? { id: String(partner.id || scope.partner_id), name: String(partner.name || ''), role: String(partner.role || '') } : { id: scope.partner_id, name: '', role: String(candidate.case && candidate.case.partner_role || '') },
      comparison_status: String(event.comparison_status || event.comparison && event.comparison.status || '').toUpperCase(),
      trigger: event.trigger || null,
      reason: event.reason || null,
      observed_at: event.observed_at || null,
      engine_version: local.engine_version || candidate.case && candidate.case.engine_version || null,
      issues,
      issue_codes: issueCodes(issues),
      messages: relevantMessages(event, issues),
      config_summary: config ? {
        version: config.version == null ? null : config.version,
        effective_from_date: config.effective_from_date || null,
        commission_type: config.commission_type || null,
        total_percent: config.total_percent == null ? null : String(config.total_percent),
        refund_percent: config.refund_percent == null ? null : String(config.refund_percent),
        dat_hit_mode: config.dat_hit_mode || null,
        dax_hit_mode: config.dax_hit_mode || null,
        mb_xien_234: Boolean(config.mb_xien_234),
        tinh_ui: Boolean(config.tinh_ui),
        relevant_pricing: relevantPricing(config, scope.region, issues)
      } : null,
      result_summary: resultSummary(lottery),
      lottery_result_snapshot: clone(lottery),
      reference_snapshot: clone(event.reference_snapshot || null),
      local_settlement_result: clone(local.settlement_result || null),
      local_category_rows: clone(local.category_rows || []),
      diagnostic_hints: diagnosticHints(issues),
      current_replay: null
    };
  }
  async function loadCandidatePacket(candidate) {
    const d = deps();
    const scope = scopeFromCandidate(candidate);
    const history = await d.runtime.getHistory(scope);
    const event = (history || []).find(row => String(row.id || '') === String(candidate.source_event_id || ''));
    if (!event) throw new Error('REPAIR_EVIDENCE_NOT_FOUND:' + String(candidate.source_event_id || candidate.id || ''));
    const partner = d.store.STORES && d.store.STORES.partners && typeof d.store.get === 'function'
      ? await d.store.get(d.store.STORES.partners, scope.partner_id).catch(() => null)
      : null;
    const packet = buildRepairPacket(candidate, event, partner);
    packet.current_replay = replayCurrent(candidate, event, d.regression);
    return packet;
  }
  async function loadGroup(candidateIds) {
    const d = deps();
    const pending = await d.candidates.listCandidates({ state: d.candidates.STATES.PENDING });
    const wanted = new Set((candidateIds || []).map(String));
    const selected = pending.filter(c => wanted.has(String(c.id)));
    if (!selected.length) throw new Error('REPAIR_GROUP_EMPTY');
    const packets = [];
    const errors = [];
    for (const candidate of selected) {
      try { packets.push(await loadCandidatePacket(candidate)); }
      catch (error) { errors.push({ candidate_id: String(candidate.id || ''), error: String(error && error.message || error) }); }
    }
    return { format: 'kts-shadow-repair-group-v2-current-replay', total: selected.length, loaded: packets.length, errors, packets };
  }

  function installUi() {
    const doc = global.document;
    const pane = doc && doc.getElementById('pane-report');
    if (!pane || doc.getElementById('shadowRepairPanel')) return;
    const card = doc.createElement('div');
    card.className = 'card';
    card.id = 'shadowRepairPanel';
    card.innerHTML = `
      <div class="section-title">Shadow repair · hồ sơ nguyên nhân</div>
      <div class="hint">Mở từ “Nhóm mismatch cần fix”. Hồ sơ giữ evidence gốc bất biến và replay lại <b>engine hiện tại</b> trên đúng config + KQXS + canonical đã chụp. Không tự sửa rule, tiền, candidate hay xác nhận HIOSKT.</div>
      <div id="shadowRepairStatus" class="status"></div>
      <div id="shadowRepairOutput" class="hint">Chưa chọn nhóm mismatch.</div>`;
    pane.appendChild(card);

    function status(text, kind) {
      const el = doc.getElementById('shadowRepairStatus');
      el.textContent = text || '';
      el.className = 'status ' + (kind || '');
    }
    function issueTable(rows, emptyText) {
      const body = rows && rows.length ? rows.map(row => `<tr><td>${esc(row.code || 'TỔNG')}</td><td>${esc(row.field)}</td><td>${esc(row.local == null ? '—' : row.local)}</td><td>${esc(row.reference == null ? '—' : row.reference)}</td><td class="${row.status === 'MISMATCH' ? 'err' : 'warn'}">${esc(row.delta == null ? '—' : row.delta)}</td></tr>`).join('') : `<tr><td colspan="5">${esc(emptyText)}</td></tr>`;
      return `<div style="overflow:auto;margin-top:7px"><table><thead><tr><th>Category</th><th>Field</th><th>KTS</th><th>HIOSKT</th><th>Delta</th></tr></thead><tbody>${body}</tbody></table></div>`;
    }
    function renderReplay(replay) {
      if (!replay) return '<div class="status warn">Chưa có replay engine hiện tại.</div>';
      if (replay.status === 'REPLAY_ERROR') {
        return `<div class="status err">Replay engine hiện tại lỗi: ${esc(replay.error || 'unknown')}</div><div class="hint">Candidate vẫn giữ nguyên trạng thái chờ xử lý.</div>`;
      }
      const exact = replay.pass && replay.safe_to_promote;
      const tag = exact ? '<span class="tag ok">ENGINE HIỆN TẠI · MATCH_EXACT</span>' : `<span class="tag err">ENGINE HIỆN TẠI · ${esc(replay.status)}</span>`;
      const movement = `đã hết ${replay.resolved_issue_keys.length} field · còn ${replay.remaining_issue_keys.length} field · mới phát sinh ${replay.new_issue_keys.length} field`;
      const note = exact
        ? 'Case đã khớp exact khi replay bằng engine hiện tại, nhưng candidate vẫn PENDING cho tới khi người vận hành xác nhận/dismiss thủ công.'
        : 'Case vẫn còn lệch với engine hiện tại; không tự thay đổi candidate.';
      return `<div class="report-message"><div>${tag} · engine ${esc(replay.current_engine_version || '—')}</div>`+
        `<div class="hint">${esc(movement)} · delta THU/BÙ hiện tại ${esc(replay.current_final_delta == null ? '—' : replay.current_final_delta)}</div>`+
        `<div class="hint"><b>Basis:</b> canonical đã chụp tại evidence. Replay này kiểm tra thay đổi engine/evaluator; không chạy lại parser backend nên không dùng để chứng minh riêng một parser fix.</div>`+
        `<div class="hint">${esc(note)}</div>`+
        issueTable(replay.current_issues, exact ? 'Không còn field lệch.' : 'Replay không trả field mismatch chi tiết.')+
        (replay.resolved_issue_keys.length ? `<details style="margin-top:6px"><summary class="hint">Field đã hết lệch</summary><div class="raw">${esc(replay.resolved_issue_keys.join('\n'))}</div></details>` : '')+
        (replay.new_issue_keys.length ? `<details style="margin-top:6px"><summary class="hint">Field mới phát sinh</summary><div class="raw">${esc(replay.new_issue_keys.join('\n'))}</div></details>` : '')+
        `</div>`;
    }
    function renderPacket(packet) {
      const messages = packet.messages.length ? packet.messages.map(m => `<div class="raw" style="margin-top:5px"><b>${esc(m.id || '')}</b> · ${esc(m.raw_text || '')}\n${esc(JSON.stringify(m.canonical_payload || null))}</div>`).join('') : '<div class="hint">Không có tin evidence.</div>';
      const hints = packet.diagnostic_hints.length ? '<ul>' + packet.diagnostic_hints.map(x => `<li>${esc(x)}</li>`).join('') + '</ul>' : '<div class="hint">Chưa đủ field detail để đưa checklist.</div>';
      return `<div class="report-message"><div><span class="tag err">TRƯỚC SỬA · MISMATCH</span> <b>${esc(packet.scope.business_date)} ${esc(packet.scope.region.toUpperCase())}</b> · ${esc(packet.partner.name || packet.partner.id)} · ${esc(packet.partner.role)}</div>`+
        `<div class="hint">event ${esc(packet.source_event_id)} · engine lúc lỗi ${esc(packet.engine_version || '—')} · ${esc(packet.observed_at || '—')}</div>`+
        issueTable(packet.issues, 'Evidence không có field mismatch chi tiết.')+
        renderReplay(packet.current_replay)+
        `<details open style="margin-top:7px"><summary class="hint">Tin gốc liên quan</summary>${messages}</details>`+
        `<details style="margin-top:7px"><summary class="hint">Config đúng ngày</summary><div class="raw">${esc(JSON.stringify(packet.config_summary, null, 2))}</div></details>`+
        `<details style="margin-top:7px"><summary class="hint">KQXS evidence</summary><div class="raw">${esc(JSON.stringify(packet.result_summary, null, 2))}</div><details><summary class="hint">Snapshot đầy đủ</summary><div class="raw">${esc(JSON.stringify(packet.lottery_result_snapshot, null, 2))}</div></details></details>`+
        `<details style="margin-top:7px"><summary class="hint">Checklist khoanh nguyên nhân</summary>${hints}</details></div>`;
    }
    async function openGroup(ids) {
      status('Đang nạp evidence và replay engine hiện tại…', 'warn');
      const result = await loadGroup(ids);
      const host = doc.getElementById('shadowRepairOutput');
      host.innerHTML = result.packets.map(renderPacket).join('') + (result.errors.length ? `<div class="status err">Không nạp được: ${esc(result.errors.map(x => x.candidate_id + ':' + x.error).join(' · '))}</div>` : '');
      const exactNow = result.packets.filter(p => p.current_replay && p.current_replay.pass && p.current_replay.safe_to_promote).length;
      status(`Đã nạp ${result.loaded}/${result.total} case · engine hiện tại exact ${exactNow}/${result.loaded}. Candidate vẫn giữ nguyên, chưa xác nhận/dismiss tự động.`, result.errors.length ? 'warn' : exactNow === result.loaded && result.loaded ? 'ok' : 'warn');
      if (card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return result;
    }
    if (typeof global.addEventListener === 'function') {
      global.addEventListener('kts:repair-open', event => {
        const ids = event && event.detail && event.detail.candidate_ids || [];
        openGroup(ids).catch(error => status(String(error && error.message || error), 'err'));
      });
    }
  }

  global.KTS_SETTLEMENT_REPAIR_WORKFLOW = Object.freeze({
    version: 'settlement-repair-workflow-v2-current-replay',
    scopeFromCandidate,
    issueRowsFromComparison,
    issueRowsFromEvent,
    issueKey,
    relevantMessages,
    relevantPricing,
    diagnosticHints,
    resultSummary,
    currentReplayAssessment,
    replayCurrent,
    buildRepairPacket,
    loadCandidatePacket,
    loadGroup
  });

  if (global.document && global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', installUi, { once: true });
  else if (global.document) installUi();
})(typeof window !== 'undefined' ? window : globalThis);
