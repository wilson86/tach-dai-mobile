(function (global) {
  'use strict';

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }
  function num(v) { const n = Number(v || 0); return Number.isFinite(n) ? n : 0; }
  function money(v) { return new Intl.NumberFormat('vi-VN',{maximumFractionDigits:4}).format(num(v)); }
  function direction(v) { const n = num(v); return n > 0 ? 'THU' : n < 0 ? 'BÙ' : 'HÒA'; }
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

  function emptyTotals() { return { xac:0, qua_co:0, payout:0, refund_amount:0, final_net:0, direction:'HÒA' }; }
  function addTotals(target, source) {
    target.xac += num(source && source.xac);
    target.qua_co += num(source && source.qua_co);
    target.payout += num(source && source.payout);
    target.refund_amount += num(source && source.refund_amount);
    target.final_net += num(source && source.final_net);
    target.direction = direction(target.final_net);
    return target;
  }
  function buildBreakdown(model) {
    const roleTotals = { customer:emptyTotals(), owner:emptyTotals(), unknown:emptyTotals() };
    const regionTotals = { mn:emptyTotals(), mt:emptyTotals(), mb:emptyTotals() };
    for (const report of (model && model.partners) || []) {
      const role = report.partner && report.partner.role === 'owner' ? 'owner' : report.partner && report.partner.role === 'customer' ? 'customer' : 'unknown';
      addTotals(roleTotals[role], report.totals || {});
      for (const region of report.regions || []) {
        if (!regionTotals[region.region]) regionTotals[region.region] = emptyTotals();
        addTotals(regionTotals[region.region], {
          xac:region.total_xac, qua_co:region.total_qua_co, payout:region.total_payout,
          refund_amount:region.refund_amount, final_net:region.final_net
        });
      }
    }
    return { role_totals:roleTotals, region_totals:regionTotals };
  }

  function buildReadiness(model) {
    const counts = model && model.counts || {};
    const partners = num(counts.partners);
    const reasons = [];
    if (!partners) reasons.push({ code:'NO_DATA', label:'Chưa có đối tác/tin trong ngày' });
    if (num(counts.blocked) > 0) reasons.push({ code:'BLOCKED', label:`${num(counts.blocked)} đối tác có phạm vi fail-closed` });
    if (num(counts.provisional) > 0) reasons.push({ code:'PROVISIONAL', label:`${num(counts.provisional)} đối tác còn tiền tạm tính` });
    if (num(counts.mismatch) > 0) reasons.push({ code:'MISMATCH', label:`${num(counts.mismatch)} đối tác đang lệch HIOSKT` });
    if (num(counts.display_only) > 0) reasons.push({ code:'DISPLAY_ONLY', label:`${num(counts.display_only)} đối tác mới chỉ khớp số hiển thị` });
    if (num(counts.unverified) > 0) reasons.push({ code:'UNVERIFIED', label:`${num(counts.unverified)} đối tác chưa đối chiếu exact` });
    const exact = num(counts.exact);
    if (partners > 0 && exact !== partners && !reasons.length) reasons.push({ code:'NOT_ALL_EXACT', label:'Chưa phải tất cả đối tác đều khớp exact' });
    return {
      ready: reasons.length === 0 && String(model && model.status || '') === 'MATCH_EXACT' && partners > 0,
      reasons, exact, partners
    };
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
        <div><div class="section-title">Tổng quan vận hành trong ngày</div><div class="hint">Tổng tất cả khách/chủ · tách theo vai trò và miền · giữ cảnh báo shadow/fail-closed.</div></div>
        <button id="refreshDailyOps" class="btn soft">Làm mới</button>
      </div>
      <div id="dailyOpsStatus" class="status"></div>
      <div id="dailyCloseGate" class="hint"></div>
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
    function totalsRow(label, t) {
      return `<tr><td><b>${esc(label)}</b></td><td>${money(t.xac)}</td><td>${money(t.qua_co)}</td><td>${money(t.payout)}</td><td>${money(t.refund_amount)}</td><td>${esc(direction(t.final_net))} ${money(Math.abs(num(t.final_net)))}</td></tr>`;
    }
    function renderReadiness(model) {
      const host = doc.getElementById('dailyCloseGate');
      if (!host) return;
      const gate = buildReadiness(model);
      if (gate.ready) {
        host.innerHTML = `<div class="status ok">GATE ĐỐI SOÁT CUỐI NGÀY: ĐỦ · ${gate.exact}/${gate.partners} đối tác khớp exact.</div><div class="hint">Đây chỉ là gate shadow; hệ thống không tự chốt hoặc khóa ngày.</div>`;
      } else {
        const items = gate.reasons.length ? gate.reasons.map(r => `<li>${esc(r.label)}</li>`).join('') : '<li>Chưa đạt trạng thái MATCH_EXACT toàn ngày.</li>';
        host.innerHTML = `<div class="status warn">GATE ĐỐI SOÁT CUỐI NGÀY: CHƯA ĐỦ</div><ul style="margin:4px 0 8px 18px;padding:0">${items}</ul><div class="hint">Gate chỉ báo phần còn thiếu; không tự động chốt tiền.</div>`;
      }
    }

    function render(model) {
      const statusInfo = dayStatus(model.status);
      setStatus(`${statusInfo[0]} · ${model.business_date}`, statusInfo[1]);
      renderReadiness(model);
      const totals = doc.getElementById('dailyOpsTotals');
      const partners = doc.getElementById('dailyOpsPartners');
      if (!totals || !partners) return;
      if (!model.partners.length) {
        totals.innerHTML = '';
        partners.innerHTML = '<div class="hint">Chưa có tin/settlement cho ngày này.</div>';
        return;
      }

      const breakdown = buildBreakdown(model);
      totals.innerHTML = `
        <div style="margin:6px 0"><b>Tổng đang tính:</b> XÁC <span class="money">${money(model.totals.xac)}</span> · QUA CÒ <span class="money">${money(model.totals.qua_co)}</span> · TRẢ <span class="money">${money(model.totals.payout)}</span> · HỒI <span class="money">${money(model.totals.refund_amount)}</span></div>
        <div class="status ${model.totals.direction === 'THU' ? 'ok' : model.totals.direction === 'BU' ? 'err' : ''}">${esc(direction(model.totals.final_net))}: ${money(Math.abs(num(model.totals.final_net)))}</div>
        <div class="hint">Đã exact ${model.counts.exact}/${model.counts.partners} đối tác · blocked ${model.counts.blocked} · tạm tính ${model.counts.provisional} · lệch ${model.counts.mismatch} · khớp hiển thị ${model.counts.display_only}.</div>
        <details style="margin-top:6px"><summary class="hint">Tổng chỉ các đối tác đã khớp exact</summary><div class="hint" style="margin-top:5px">XÁC ${money(model.exact_totals.xac)} · QUA CÒ ${money(model.exact_totals.qua_co)} · TRẢ ${money(model.exact_totals.payout)} · HỒI ${money(model.exact_totals.refund_amount)} · ${esc(direction(model.exact_totals.final_net))} ${money(Math.abs(num(model.exact_totals.final_net)))}</div></details>
        <details open style="margin-top:8px"><summary class="hint"><b>Tách Khách / Chủ</b></summary><div class="result-grid" style="margin-top:5px"><table><thead><tr><th>Vai trò</th><th>XÁC</th><th>Qua cò</th><th>Trả</th><th>Hồi</th><th>Thu/Bù</th></tr></thead><tbody>${totalsRow('Khách', breakdown.role_totals.customer)}${totalsRow('Chủ', breakdown.role_totals.owner)}</tbody></table></div></details>
        <details open style="margin-top:8px"><summary class="hint"><b>Tách theo miền</b></summary><div class="result-grid" style="margin-top:5px"><table><thead><tr><th>Miền</th><th>XÁC</th><th>Qua cò</th><th>Trả</th><th>Hồi</th><th>Thu/Bù</th></tr></thead><tbody>${[['mn','MN'],['mt','MT'],['mb','MB']].filter(x => { const t=breakdown.region_totals[x[0]]; return t && (t.xac || t.qua_co || t.payout || t.refund_amount || t.final_net); }).map(x => totalsRow(x[1], breakdown.region_totals[x[0]])).join('')}</tbody></table></div></details>`;

      partners.innerHTML = model.partners.map(report => {
        const cls = report.blocked ? 'err' : report.provisional ? 'warn' : shadowKind(report.shadow_status);
        const state = report.blocked ? 'BLOCKED' : report.provisional ? 'TẠM TÍNH' : shadowLabel(report.shadow_status);
        const warning = report.blocked
          ? `<div class="status err">Không dùng tổng này để chốt · ${report.blocked_scopes.length} phạm vi bị chặn.</div>`
          : report.provisional
            ? '<div class="status warn">KQXS chưa hoàn tất · số tiền còn tạm.</div>'
            : report.shadow_status !== 'MATCH_EXACT'
              ? '<div class="status warn">Tiền đã tính nhưng chưa qua gate shadow exact.</div>' : '';
        const cats = (report.categories || []).map(c => `${esc(c.label || c.code)}: XÁC ${money(c.xac)} · QUA ${money(c.qua_co)} · TRẢ ${money(c.payout)}`).join('<br>');
        return `<div class="report-message" data-ops-partner="${esc(report.partner.id)}">
          <div class="row" style="justify-content:space-between">
            <div><b>${esc(report.partner.name || report.partner.id)}</b> <span class="tag">${esc(roleLabel(report.partner.role))}</span></div>
            <span class="tag ${cls}">${esc(state)}</span>
          </div>
          <div style="margin-top:6px">${regionSummary(report)}</div>
          <div class="hint" style="margin-top:6px">XÁC ${money(report.totals.xac)} · QUA CÒ ${money(report.totals.qua_co)} · TRẢ ${money(report.totals.payout)} · HỒI ${money(report.totals.refund_amount)}</div>
          <div class="status ${report.totals.direction === 'THU' ? 'ok' : report.totals.direction === 'BU' ? 'err' : ''}">${esc(direction(report.totals.final_net))} ${money(Math.abs(num(report.totals.final_net)))}</div>
          ${warning}
          ${cats ? `<details style="margin-top:5px"><summary class="hint">Theo loại cược</summary><div class="hint" style="margin-top:4px">${cats}</div></details>` : ''}
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
    if (typeof global.addEventListener === 'function') global.addEventListener('kts:auto-result-recalculated', () => {
      if (pane.classList.contains('active')) refresh().catch(() => {});
    });
    for (const button of doc.querySelectorAll('.nav button[data-pane="report"]')) button.addEventListener('click', refresh);
  }

  global.KTS_SETTLEMENT_REPORT_DASHBOARD = Object.freeze({
    version:'settlement-report-dashboard-v3-readiness', shadowLabel, shadowKind, dayStatus, direction, buildBreakdown, buildReadiness
  });
  if (global.document && global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
})(typeof window !== 'undefined' ? window : globalThis);
