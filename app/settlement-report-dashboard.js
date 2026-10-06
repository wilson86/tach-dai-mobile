(function (global) {
  'use strict';

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }
  function money(v) {
    const n = Number(v || 0);
    return Number.isFinite(n) ? new Intl.NumberFormat('vi-VN',{maximumFractionDigits:4}).format(n) : '0';
  }
  function roleLabel(role) { return role === 'owner' ? 'Chủ' : role === 'customer' ? 'Khách' : '—'; }
  function shadowLabel(status) {
    return ({
      MATCH_EXACT:'KHỚP EXACT', MATCH_DISPLAY_ONLY:'KHỚP HIỂN THỊ', MISMATCH:'LỆCH SHADOW',
      INCOMPLETE_REFERENCE:'THIẾU HIOSKT', UNVERIFIED:'CHỜ ĐỐI CHIẾU', BLOCKED:'BLOCKED', NO_DATA:'CHƯA CÓ'
    })[status] || String(status || 'CHƯA CÓ');
  }
  function shadowKind(status) {
    if (status === 'MATCH_EXACT') return 'ok';
    if (status === 'MISMATCH' || status === 'BLOCKED') return 'err';
    return 'warn';
  }
  function dayStatus(status) {
    return ({
      MATCH_EXACT:['TẤT CẢ ĐÃ KHỚP EXACT','ok'],
      BLOCKED:['CÓ PHẠM VI FAIL-CLOSED','err'],
      MISMATCH:['CÓ LỆCH SHADOW','err'],
      PROVISIONAL:['CÓ KẾT QUẢ TẠM TÍNH','warn'],
      MATCH_DISPLAY_ONLY:['CÓ PHẠM VI CHỈ KHỚP SỐ HIỂN THỊ','warn'],
      UNVERIFIED:['ĐANG CHỜ ĐỐI CHIẾU HIOSKT','warn'],
      EMPTY:['NGÀY NÀY CHƯA CÓ DỮ LIỆU','warn']
    })[status] || [String(status || 'UNKNOWN'),'warn'];
  }

  function install() {
    const doc = global.document;
    const store = global.KTS_SETTLEMENT_STORE;
    const reportApi = global.KTS_SETTLEMENT_REPORT;
    const pane = doc && doc.getElementById('pane-report');
    if (!doc || !store || !reportApi || !pane || doc.getElementById('dailyOpsDashboard')) return;

    const detailCard = pane.querySelector('.card');
    const card = doc.createElement('div');
    card.className = 'card';
    card.id = 'dailyOpsDashboard';
    card.innerHTML = `
      <div class="row" style="justify-content:space-between">
        <div class="section-title">Tổng quan vận hành trong ngày</div>
        <button id="refreshDailyOps" class="btn soft">Làm mới</button>
      </div>
      <div id="dailyOpsStatus" class="status"></div>
      <div id="dailyOpsTotals" class="hint"></div>
      <div id="dailyOpsPartners" class="hint" style="margin-top:8px"></div>`;
    if (detailCard) detailCard.insertAdjacentElement('afterend', card);
    else pane.insertBefore(card, pane.firstChild);

    function setStatus(text, kind) {
      const el = doc.getElementById('dailyOpsStatus');
      if (!el) return;
      el.textContent = text || '';
      el.className = 'status ' + (kind || '');
    }

    function scopeDate() {
      const el = doc.getElementById('reportDate');
      return el ? String(el.value || '') : '';
    }

    function regionSummary(report) {
      return (report.regions || []).map(r => {
        const cls = r.blocked ? 'err' : r.provisional ? 'warn' : shadowKind(r.shadow_status);
        const state = r.blocked ? 'BLOCKED' : r.provisional ? 'TẠM' : shadowLabel(r.shadow_status);
        return `<span class="tag ${cls}">${esc(r.region.toUpperCase())} · ${esc(state)}</span>`;
      }).join(' ');
    }

    function render(model) {
      const statusInfo = dayStatus(model.status);
      setStatus(`${statusInfo[0]} · ${model.business_date}`, statusInfo[1]);
      const totals = doc.getElementById('dailyOpsTotals');
      const partners = doc.getElementById('dailyOpsPartners');
      if (!totals || !partners) return;
      if (!model.partners.length) {
        totals.innerHTML = '';
        partners.innerHTML = '<div class="hint">Chưa có tin/settlement cho ngày này.</div>';
        return;
      }

      totals.innerHTML = `
        <div style="margin:6px 0"><b>Tổng đang tính:</b> XÁC <span class="money">${money(model.totals.xac)}</span> · QUA CÒ <span class="money">${money(model.totals.qua_co)}</span> · TRẢ <span class="money">${money(model.totals.payout)}</span> · HỒI <span class="money">${money(model.totals.refund_amount)}</span></div>
        <div class="status ${model.totals.direction === 'THU' ? 'ok' : model.totals.direction === 'BU' ? 'err' : ''}">${esc(model.totals.direction)}: ${money(model.totals.final_net)}</div>
        <div class="hint">Đã exact ${model.counts.exact}/${model.counts.partners} đối tác · blocked ${model.counts.blocked} · tạm tính ${model.counts.provisional} · lệch ${model.counts.mismatch} · khớp hiển thị ${model.counts.display_only}.</div>
        <details style="margin-top:6px"><summary class="hint">Tổng chỉ các đối tác đã khớp exact</summary><div class="hint" style="margin-top:5px">XÁC ${money(model.exact_totals.xac)} · QUA CÒ ${money(model.exact_totals.qua_co)} · TRẢ ${money(model.exact_totals.payout)} · HỒI ${money(model.exact_totals.refund_amount)} · ${esc(model.exact_totals.direction)} ${money(model.exact_totals.final_net)}</div></details>`;

      partners.innerHTML = model.partners.map(report => {
        const cls = report.blocked ? 'err' : report.provisional ? 'warn' : shadowKind(report.shadow_status);
        const state = report.blocked ? 'BLOCKED' : report.provisional ? 'TẠM TÍNH' : shadowLabel(report.shadow_status);
        const warning = report.blocked
          ? `<div class="status err">Không dùng tổng này để chốt · ${report.blocked_scopes.length} phạm vi bị chặn.</div>`
          : report.provisional
            ? '<div class="status warn">KQXS chưa hoàn tất · số tiền còn tạm.</div>'
            : report.shadow_status !== 'MATCH_EXACT'
              ? '<div class="status warn">Tiền đã tính nhưng chưa qua gate shadow exact.</div>' : '';
        return `<div class="report-message" data-ops-partner="${esc(report.partner.id)}">
          <div class="row" style="justify-content:space-between">
            <div><b>${esc(report.partner.name || report.partner.id)}</b> <span class="tag">${esc(roleLabel(report.partner.role))}</span></div>
            <span class="tag ${cls}">${esc(state)}</span>
          </div>
          <div style="margin-top:6px">${regionSummary(report)}</div>
          <div class="hint" style="margin-top:6px">XÁC ${money(report.totals.xac)} · QUA CÒ ${money(report.totals.qua_co)} · TRẢ ${money(report.totals.payout)} · HỒI ${money(report.totals.refund_amount)}</div>
          <div class="status ${report.totals.direction === 'THU' ? 'ok' : report.totals.direction === 'BU' ? 'err' : ''}">${esc(report.totals.direction)} ${money(report.totals.final_net)}</div>
          ${warning}
          <button class="btn soft" data-open-partner="${esc(report.partner.id)}" style="margin-top:6px">Xem chi tiết</button>
        </div>`;
      }).join('');

      partners.querySelectorAll('[data-open-partner]').forEach(btn => btn.addEventListener('click', () => {
        const select = doc.getElementById('reportPartner');
        const load = doc.getElementById('loadReport');
        if (select) select.value = btn.dataset.openPartner;
        if (load) load.click();
        const out = doc.getElementById('reportOutput');
        if (out && typeof out.scrollIntoView === 'function') out.scrollIntoView({ behavior:'smooth', block:'start' });
      }));
    }

    async function refresh() {
      const date = scopeDate();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setStatus('Chọn ngày hợp lệ để xem tổng quan.', 'err');
      setStatus('Đang tổng hợp toàn bộ khách/chủ trong ngày…', '');
      try {
        const [partners, settlements, messages] = await Promise.all([
          store.getAll(store.STORES.partners), store.getAll(store.STORES.settlements), store.getAll(store.STORES.messages)
        ]);
        const model = reportApi.buildDailyOperationsReport({ business_date: date, partners, settlements, messages });
        render(model);
        return model;
      } catch (e) {
        setStatus('Không tổng hợp được báo cáo ngày: ' + String(e && e.message || e), 'err');
        return null;
      }
    }

    const refreshBtn = doc.getElementById('refreshDailyOps');
    if (refreshBtn) refreshBtn.addEventListener('click', refresh);
    const date = doc.getElementById('reportDate');
    if (date) date.addEventListener('change', refresh);
    const load = doc.getElementById('loadReport');
    if (load) load.addEventListener('click', () => setTimeout(refresh, 0));
    for (const button of doc.querySelectorAll('.nav button[data-pane="report"]')) button.addEventListener('click', refresh);
  }

  global.KTS_SETTLEMENT_REPORT_DASHBOARD = Object.freeze({ version:'settlement-report-dashboard-v1', shadowLabel, shadowKind, dayStatus });
  if (global.document && global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
})(typeof window !== 'undefined' ? window : globalThis);
