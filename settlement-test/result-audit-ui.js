(function (global) {
  'use strict';

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function scopeKey(date, region) {
    return `${String(date || '')}:${String(region || '').toLowerCase()}`;
  }

  function listEvents(events, date, region) {
    const id = scopeKey(date, region);
    return (events || [])
      .filter(e => String(e.result_id || e.id || '').startsWith(id))
      .filter(e => String(e.result_id || '') === id || (!e.result_id && String(e.business_date || '') === String(date || '') && String(e.region || '').toLowerCase() === String(region || '').toLowerCase()))
      .sort((a, b) => String(b.observed_at || b.fetched_at || '').localeCompare(String(a.observed_at || a.fetched_at || '')));
  }

  function snapshotVerified(snapshot) {
    if (!snapshot || snapshot.complete !== true) return false;
    const claimed = snapshot.verified === true || String(snapshot.verification_status || '').toLowerCase() === 'verified';
    if (!claimed) return false;
    const sources = Array.isArray(snapshot.verification_sources)
      ? new Set(snapshot.verification_sources.map(x => String(x || '').trim()).filter(Boolean))
      : new Set();
    const conflicts = Array.isArray(snapshot.verification_conflicts) ? snapshot.verification_conflicts : [];
    const expected = Array.isArray(snapshot.expected_station_codes)
      ? snapshot.expected_station_codes.map(x => String(x || '').trim().toLowerCase()).filter(Boolean)
      : [];
    const actual = Array.isArray(snapshot.stations)
      ? snapshot.stations.map(row => String(row && row.code || '').trim().toLowerCase()).filter(Boolean)
      : [];
    return sources.size >= 2 && conflicts.length === 0 &&
      expected.length > 0 && new Set(expected).size === expected.length &&
      new Set(actual).size === actual.length && actual.length === expected.length &&
      expected.every(code => actual.includes(code));
  }

  function summarize(events) {
    const rows = events || [];
    if (!rows.length) return { count: 0, changed: false, sources: [] };
    return {
      count: rows.length,
      changed: rows.length > 1,
      sources: [...new Set(rows.map(x => String(x.source || 'unknown')))]
    };
  }

  function install() {
    const doc = global.document;
    const store = global.KTS_SETTLEMENT_STORE;
    if (!doc || !store) return;
    const pane = doc.getElementById('pane-result');
    const resultTable = doc.getElementById('resultTable');
    const tableCard = resultTable && resultTable.closest('.card');
    if (!pane || !tableCard || doc.getElementById('resultAudit')) return;

    const card = doc.createElement('div');
    card.className = 'card';
    card.innerHTML = '<div class="row" style="justify-content:space-between"><div class="section-title">Lịch sử KQXS / sửa kết quả</div><button id="refreshResultAudit" class="btn soft">Làm mới</button></div><div id="resultAuditStatus" class="status"></div><div id="resultAudit" class="hint">Chưa có lịch sử.</div>';
    tableCard.insertAdjacentElement('afterend', card);

    let refreshEpoch = 0;

    function currentScope() {
      const date = doc.getElementById('resultDate');
      const region = doc.getElementById('resultRegion');
      return { date: date ? String(date.value || '') : '', region: region ? String(region.value || '').toLowerCase() : '' };
    }

    function setStatus(text, kind) {
      const el = doc.getElementById('resultAuditStatus');
      if (!el) return;
      el.textContent = text || '';
      el.className = 'status ' + (kind || '');
    }

    async function refresh() {
      const epoch = ++refreshEpoch;
      const scope = currentScope();
      const host = doc.getElementById('resultAudit');
      const stillCurrent = () => {
        const now = currentScope();
        return epoch === refreshEpoch && now.date === scope.date && now.region === scope.region;
      };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(scope.date) || !['mn','mt','mb'].includes(scope.region)) return [];
      const all = await store.getAll(store.STORES.resultEvents);
      if (!stillCurrent()) return [];
      const rows = listEvents(all, scope.date, scope.region);
      const summary = summarize(rows);
      if (!host) return rows;
      if (!rows.length) {
        host.innerHTML = '<div class="hint">Chưa ghi nhận snapshot KQXS nào cho ngày/miền này.</div>';
        setStatus('', '');
        return rows;
      }
      host.innerHTML = rows.map((row, index) => {
        const verification = snapshotVerified(row) ? 'ĐÃ XÁC MINH' : row.complete ? 'ĐỦ KQ · CHỜ XÁC MINH' : 'TẠM';
        const fingerprint = String(row.fingerprint || '').slice(0, 16);
        return `<div class="report-message"><div class="row" style="justify-content:space-between"><div><span class="tag ${index === 0 ? 'ok' : ''}">${index === 0 ? 'MỚI NHẤT' : 'TRƯỚC ĐÓ'}</span> <b>${esc(verification)}</b></div><span class="hint">${esc(row.observed_at || row.fetched_at || '')}</span></div><div class="hint">Nguồn: ${esc(row.source || 'unknown')} · fetched ${esc(row.fetched_at || '')}${fingerprint ? ` · fp ${esc(fingerprint)}` : ''}</div></div>`;
      }).join('');
      if (summary.changed) setStatus(`Có ${summary.count} phiên bản KQXS đã lưu cho ${scope.region.toUpperCase()} ${scope.date}. Hệ thống giữ toàn bộ để đối soát khi nguồn sửa kết quả.`, 'warn');
      else setStatus(`1 snapshot KQXS đã lưu · nguồn ${summary.sources.join(', ')}.`, 'ok');
      return rows;
    }

    const refreshBtn = doc.getElementById('refreshResultAudit');
    if (refreshBtn) refreshBtn.addEventListener('click', () => refresh().catch(e => setStatus(String(e.message || e), 'err')));
    for (const id of ['resultDate','resultRegion']) {
      const el = doc.getElementById(id);
      if (el) el.addEventListener('change', () => refresh().catch(() => {}));
    }
    for (const button of doc.querySelectorAll('.nav button[data-pane="result"]')) button.addEventListener('click', () => refresh().catch(() => {}));
    if (typeof global.addEventListener === 'function') {
      global.addEventListener('kts:auto-result-update', () => refresh().catch(() => {}));
      global.addEventListener('kts:auto-result-recalculated', () => refresh().catch(() => {}));
    }
  }

  global.KTS_RESULT_AUDIT_UI = Object.freeze({ version: 'result-audit-ui-v2-stale-safe-strict-verified', scopeKey, listEvents, summarize, snapshotVerified });
  if (global.document && global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})(typeof window !== 'undefined' ? window : globalThis);
