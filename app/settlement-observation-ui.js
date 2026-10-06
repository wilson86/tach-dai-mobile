(function (global) {
  'use strict';

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#039;');
  }
  function dateOffset(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function status(text, kind) {
    const el = global.document && global.document.getElementById('observationStatus');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'status ' + (kind || '');
  }

  function install() {
    const doc = global.document;
    const pane = doc && doc.getElementById('pane-report');
    const store = global.KTS_SETTLEMENT_STORE;
    const observation = global.KTS_SETTLEMENT_OBSERVATION;
    const regression = global.KTS_SETTLEMENT_REGRESSION_CASES;
    if (!pane || !store || !observation || doc.getElementById('observationPanel')) return;

    const card = doc.createElement('div');
    card.className = 'card';
    card.id = 'observationPanel';
    card.innerHTML = `
      <div class="section-title">Theo dõi giai đoạn Shadow</div>
      <div class="hint">Tổng hợp toàn bộ scope đang có tin thật trong cửa sổ đã chọn. Scope bị hủy hết không tính. Nếu có tin nhưng thiếu settlement thì gate bị chặn; không được coi một ngày là sạch chỉ vì mới đối chiếu một phần. Case regression đã ghim trên máy cũng phải PASS.</div>
      <div class="grid3" style="margin-top:8px">
        <div><label>Từ ngày</label><input id="observationFrom" type="date"></div>
        <div><label>Đến ngày</label><input id="observationTo" type="date"></div>
        <div><label>Số ngày quan sát yêu cầu</label><input id="observationDays" type="number" min="1" max="3650" placeholder="Chưa chốt"></div>
      </div>
      <div class="row" style="margin-top:8px"><button id="observationLoad" class="btn primary">Tổng hợp Shadow</button></div>
      <div id="observationStatus" class="status"></div>
      <div id="observationOutput" class="hint"></div>`;
    pane.appendChild(card);
    doc.getElementById('observationFrom').value = dateOffset(-6);
    doc.getElementById('observationTo').value = dateOffset(0);

    function render(summary, partners) {
      const out = doc.getElementById('observationOutput');
      const c = summary.counts;
      const regressionGate = summary.regression_gate || { enabled:false, met:true, total:0, passed:0, failed:0 };
      const cls = summary.promotion_ready ? 'ok' : (c.mismatch || c.display_only || c.missing_scopes || regressionGate.failed) ? 'err' : 'warn';
      const title = summary.promotion_ready ? 'ĐẠT GATE SHADOW CHO CỬA SỔ ĐÃ CHỌN' : 'CHƯA ĐẠT GATE SHADOW';
      const partnerNames = Object.fromEntries((partners || []).map(p => [p.id, p.name]));
      const rows = summary.scopes.map(r => {
        const statusClass = r.comparison_status === 'MATCH_EXACT' ? 'ok' : ['MISMATCH','MATCH_DISPLAY_ONLY'].includes(r.comparison_status) ? 'err' : 'warn';
        return `<tr><td>${esc(r.business_date)}</td><td>${esc(partnerNames[r.partner_id] || r.partner_id)}</td><td>${esc(r.region.toUpperCase())}</td><td class="${statusClass}">${esc(r.comparison_status)}</td></tr>`;
      }).join('');
      const missingRows = (summary.coverage && summary.coverage.missing_scopes || []).map(r => `<tr><td>${esc(r.business_date)}</td><td>${esc(partnerNames[r.partner_id] || r.partner_id)}</td><td>${esc(String(r.region || '').toUpperCase())}</td><td class="err">THIẾU SETTLEMENT</td></tr>`).join('');
      const coverage = summary.coverage || { enabled:false, expected_scopes:c.total, present_scopes:c.total, missing_scopes:[] };
      const regressionText = regressionGate.enabled
        ? `<div>Regression đã ghim: <b>${regressionGate.passed}</b> / <b>${regressionGate.total}</b> PASS · fail <b>${regressionGate.failed}</b>.</div>`
        : '<div>Regression đã ghim: <b>chưa có</b> trên thiết bị này. Bộ fixture CI vẫn chạy riêng trên GitHub.</div>';
      out.innerHTML = `
        <div class="status ${cls}">${esc(title)}</div>
        <div style="margin:8px 0"><b>${c.total}</b> scope có settlement · exact <b>${c.exact}</b> · lệch <b>${c.mismatch}</b> · chỉ khớp hiển thị <b>${c.display_only}</b> · blocked <b>${c.blocked}</b> · tạm tính <b>${c.provisional}</b> · chưa đối chiếu <b>${c.unverified}</b>.</div>
        <div>Coverage tin thật: <b>${coverage.present_scopes}</b> / <b>${coverage.expected_scopes}</b> scope · thiếu <b>${coverage.missing_scopes.length}</b>.</div>
        ${regressionText}
        <div>Ngày quan sát có <b>đủ toàn bộ scope đang có tin</b> và tất cả khớp exact: <b>${summary.exact_days}</b> / ${summary.duration_gate_configured ? `<b>${summary.options.required_observation_days}</b> yêu cầu` : '<b>chưa cấu hình</b>'}.</div>
        ${summary.blockers.length ? `<div class="status warn">Blocker: ${esc(summary.blockers.join(' · '))}</div>` : ''}
        <div style="overflow:auto;margin-top:8px"><table><thead><tr><th>Ngày</th><th>Đối tác</th><th>Miền</th><th>Shadow</th></tr></thead><tbody>${rows}${missingRows || ''}${!rows && !missingRows ? '<tr><td colspan="4">Chưa có scope trong cửa sổ này.</td></tr>' : ''}</tbody></table></div>`;
    }

    doc.getElementById('observationLoad').addEventListener('click', async () => {
      try {
        const [settlements, partners, messages, regressionSummary] = await Promise.all([
          store.getAll(store.STORES.settlements),
          store.getAll(store.STORES.partners),
          store.getAll(store.STORES.messages),
          regression && typeof regression.runPinnedCases === 'function'
            ? regression.runPinnedCases().catch(() => null)
            : Promise.resolve(null)
        ]);
        const summary = observation.buildObservation(settlements, {
          from_date: doc.getElementById('observationFrom').value,
          to_date: doc.getElementById('observationTo').value,
          required_observation_days: doc.getElementById('observationDays').value,
          messages,
          regression_summary: regressionSummary
        });
        render(summary, partners);
        status(summary.promotion_ready ? 'Cửa sổ này đạt điều kiện shadow đã cấu hình.' : 'Còn blocker, thiếu coverage hoặc regression fail; chưa được promotion.', summary.promotion_ready ? 'ok' : 'warn');
      } catch (e) {
        status(String(e && e.message || e), 'err');
      }
    });
  }

  if (global.document && global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})(typeof window !== 'undefined' ? window : globalThis);
