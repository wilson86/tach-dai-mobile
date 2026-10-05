(function (global) {
  'use strict';

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
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
    if (!pane || !store || !observation || doc.getElementById('observationPanel')) return;

    const card = doc.createElement('div');
    card.className = 'card';
    card.id = 'observationPanel';
    card.innerHTML = `
      <div class="section-title">Theo dõi giai đoạn Shadow</div>
      <div class="hint">Tổng hợp toàn bộ scope đã đối chiếu HIOSKT. Hệ thống <b>không tự quyết định thời gian quan sát</b>; phải nhập số ngày đã thống nhất. Chỉ khi mọi scope khớp chính xác và đủ số ngày mới hiện đạt gate.</div>
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
      const cls = summary.promotion_ready ? 'ok' : (c.mismatch || c.display_only) ? 'err' : 'warn';
      const title = summary.promotion_ready ? 'ĐẠT GATE SHADOW CHO CỬA SỔ ĐÃ CHỌN' : 'CHƯA ĐẠT GATE SHADOW';
      const partnerNames = Object.fromEntries((partners || []).map(p => [p.id, p.name]));
      const rows = summary.scopes.map(r => {
        const statusClass = r.comparison_status === 'MATCH_EXACT' ? 'ok' : ['MISMATCH','MATCH_DISPLAY_ONLY'].includes(r.comparison_status) ? 'err' : 'warn';
        return `<tr><td>${esc(r.business_date)}</td><td>${esc(partnerNames[r.partner_id] || r.partner_id)}</td><td>${esc(r.region.toUpperCase())}</td><td class="${statusClass}">${esc(r.comparison_status)}</td></tr>`;
      }).join('');
      out.innerHTML = `
        <div class="status ${cls}">${esc(title)}</div>
        <div style="margin:8px 0"><b>${c.total}</b> scope · exact <b>${c.exact}</b> · lệch <b>${c.mismatch}</b> · chỉ khớp hiển thị <b>${c.display_only}</b> · blocked <b>${c.blocked}</b> · tạm tính <b>${c.provisional}</b> · chưa đối chiếu <b>${c.unverified}</b></div>
        <div>Ngày quan sát có toàn bộ scope exact: <b>${summary.exact_days}</b> / ${summary.duration_gate_configured ? `<b>${summary.options.required_observation_days}</b> yêu cầu` : '<b>chưa cấu hình</b>'}.</div>
        ${summary.blockers.length ? `<div class="status warn">Blocker: ${esc(summary.blockers.join(' · '))}</div>` : ''}
        <div style="overflow:auto;margin-top:8px"><table><thead><tr><th>Ngày</th><th>Đối tác</th><th>Miền</th><th>Shadow</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Chưa có scope trong cửa sổ này.</td></tr>'}</tbody></table></div>`;
    }

    doc.getElementById('observationLoad').addEventListener('click', async () => {
      try {
        const settlements = await store.getAll(store.STORES.settlements);
        const partners = await store.getAll(store.STORES.partners);
        const summary = observation.buildObservation(settlements, {
          from_date: doc.getElementById('observationFrom').value,
          to_date: doc.getElementById('observationTo').value,
          required_observation_days: doc.getElementById('observationDays').value
        });
        render(summary, partners);
        status(summary.promotion_ready ? 'Cửa sổ này đạt điều kiện shadow đã cấu hình.' : 'Còn blocker; chưa được promotion.', summary.promotion_ready ? 'ok' : 'warn');
      } catch (e) {
        status(String(e && e.message || e), 'err');
      }
    });
  }

  if (global.document && global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})(typeof window !== 'undefined' ? window : globalThis);
