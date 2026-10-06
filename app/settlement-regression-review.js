(function (global) {
  'use strict';

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }
  function numeric(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  function fieldNames(fields) {
    return Object.entries(fields || {})
      .filter(([, row]) => row && row.status && row.status !== 'MATCH_EXACT')
      .map(([field]) => String(field))
      .sort();
  }
  function candidateIssueShape(candidate) {
    const c = candidate || {};
    const kase = c.case || {};
    const scope = kase.scope || {};
    const comparison = kase.expected_comparison || {};
    const categoryParts = (comparison.categories || [])
      .filter(row => row && !['MATCH_EXACT', 'NOT_COMPARABLE'].includes(String(row.status || '').toUpperCase()))
      .map(row => `${String(row.code || '').toUpperCase()}:${fieldNames(row.fields).join(',') || String(row.status || '').toUpperCase()}`)
      .sort();
    const totalParts = Object.entries(comparison.totals || {})
      .filter(([, row]) => row && row.status && row.status !== 'MATCH_EXACT')
      .map(([field, row]) => `${field}:${String(row.status || '').toUpperCase()}`)
      .sort();
    return {
      region: String(scope.region || '').toLowerCase(),
      partner_role: String(kase.partner_role || 'unknown').toLowerCase(),
      categories: categoryParts,
      totals: totalParts
    };
  }
  function signatureForCandidate(candidate) {
    const shape = candidateIssueShape(candidate);
    const issue = shape.categories.length ? `CAT=${shape.categories.join('|')}` : `TOTAL=${shape.totals.join('|') || 'UNKNOWN'}`;
    return `${shape.region || 'unknown'}|${shape.partner_role}|${issue}`;
  }
  function summarizeCandidates(candidates) {
    const groups = new Map();
    for (const candidate of (Array.isArray(candidates) ? candidates : [])) {
      if (!candidate || String(candidate.state || '').toLowerCase() !== 'pending') continue;
      const signature = signatureForCandidate(candidate);
      const scope = candidate.case && candidate.case.scope || {};
      const delta = numeric(candidate.final_delta);
      let row = groups.get(signature);
      if (!row) {
        const shape = candidateIssueShape(candidate);
        row = {
          signature,
          region: shape.region,
          partner_role: shape.partner_role,
          categories: shape.categories,
          totals: shape.totals,
          count: 0,
          total_abs_delta: 0,
          max_abs_delta: 0,
          dates: new Set(),
          partners: new Set(),
          candidate_ids: [],
          latest_created_at: ''
        };
        groups.set(signature, row);
      }
      row.count += 1;
      if (delta != null) {
        const abs = Math.abs(delta);
        row.total_abs_delta += abs;
        row.max_abs_delta = Math.max(row.max_abs_delta, abs);
      }
      if (scope.business_date) row.dates.add(String(scope.business_date));
      if (scope.partner_id) row.partners.add(String(scope.partner_id));
      row.candidate_ids.push(String(candidate.id || ''));
      const created = String(candidate.created_at || '');
      if (created > row.latest_created_at) row.latest_created_at = created;
    }
    return [...groups.values()].map(row => Object.assign({}, row, {
      dates: [...row.dates].sort(),
      partners: [...row.partners].sort()
    })).sort((a, b) => b.count - a.count || b.total_abs_delta - a.total_abs_delta || a.signature.localeCompare(b.signature));
  }

  function installUi() {
    const doc = global.document;
    const pane = doc && doc.getElementById('pane-report');
    const candidates = global.KTS_SETTLEMENT_REGRESSION_CANDIDATES;
    if (!pane || !candidates || doc.getElementById('regressionReviewPanel')) return;

    const card = doc.createElement('div');
    card.className = 'card';
    card.id = 'regressionReviewPanel';
    card.innerHTML = `
      <div class="section-title">Nhóm mismatch cần fix</div>
      <div class="hint">Chỉ là bảng phân nhóm để ưu tiên sửa rule. Không tự xác nhận HIOSKT, không tự ghim golden và không thay đổi tiền. Nhiều candidate có cùng miền + vai trò + category/field lệch sẽ gom thành một nhóm.</div>
      <div class="row" style="margin-top:8px"><button id="regressionReviewRefresh" class="btn soft">Cập nhật nhóm lỗi</button></div>
      <div id="regressionReviewStatus" class="status"></div>
      <div id="regressionReviewOutput" class="hint"></div>`;
    pane.appendChild(card);
    let lastGroups = [];

    function status(text, kind) {
      const el = doc.getElementById('regressionReviewStatus');
      if (!el) return;
      el.textContent = text || '';
      el.className = 'status ' + (kind || '');
    }
    async function render() {
      const pending = await candidates.listCandidates({ state: candidates.STATES.PENDING });
      const groups = summarizeCandidates(pending);
      lastGroups = groups;
      const host = doc.getElementById('regressionReviewOutput');
      if (!groups.length) {
        host.innerHTML = '<div class="hint">Không có mismatch candidate đang chờ xử lý.</div>';
        status('Queue mismatch sạch.', 'ok');
        return groups;
      }
      host.innerHTML = groups.map((g, index) => {
        const issue = g.categories.length ? g.categories.join(' · ') : g.totals.join(' · ') || 'Chưa khoanh được field';
        const deltaText = Number.isFinite(g.total_abs_delta) ? new Intl.NumberFormat('vi-VN',{maximumFractionDigits:6}).format(g.total_abs_delta) : '—';
        return `<div class="report-message"><div><span class="tag err">#${index + 1}</span> <b>${esc(String(g.region || '').toUpperCase())}</b> · ${esc(g.partner_role)} · <b>${g.count}</b> case</div>`+
          `<div class="hint" style="margin-top:4px">${esc(issue)}</div>`+
          `<div class="hint">Ngày: ${esc(g.dates.join(', ') || '—')} · đối tác ${g.partners.length} · tổng |lệch THU/BÙ| ${esc(deltaText)}</div>`+
          `<div class="row" style="margin-top:6px"><button class="btn soft" data-repair-group="${index}">Mở hồ sơ sửa</button></div>`+
          `<details style="margin-top:4px"><summary class="hint">Candidate ID</summary><div class="raw">${esc(g.candidate_ids.join('\n'))}</div></details></div>`;
      }).join('');
      host.querySelectorAll('[data-repair-group]').forEach(btn => btn.addEventListener('click', () => {
        const index = Number(btn.getAttribute('data-repair-group'));
        const group = lastGroups[index];
        if (!group || !group.candidate_ids.length) return;
        if (typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') {
          global.dispatchEvent(new global.CustomEvent('kts:repair-open', { detail: { signature: group.signature, candidate_ids: group.candidate_ids.slice() } }));
        }
      }));
      status(`${pending.length} candidate đang chờ · gom thành ${groups.length} nhóm lỗi. Ưu tiên nhóm lặp nhiều trước.`, 'warn');
      return groups;
    }

    doc.getElementById('regressionReviewRefresh').addEventListener('click', () => render().catch(error => status(String(error && error.message || error), 'err')));
    if (typeof global.addEventListener === 'function') {
      global.addEventListener('kts:regression-candidates-changed', () => render().catch(() => {}));
      global.addEventListener('kts:shadow-saved', () => setTimeout(() => render().catch(() => {}), 0));
    }
    render().catch(() => {});
  }

  global.KTS_SETTLEMENT_REGRESSION_REVIEW = Object.freeze({
    version: 'settlement-regression-review-v2-repair-link',
    candidateIssueShape,
    signatureForCandidate,
    summarizeCandidates
  });

  if (global.document && global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', installUi, { once: true });
  else if (global.document) installUi();
})(typeof window !== 'undefined' ? window : globalThis);
