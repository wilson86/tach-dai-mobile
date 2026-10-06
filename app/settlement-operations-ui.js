(function (global) {
  'use strict';

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }
  function num(v) { const n = Number(v || 0); return Number.isFinite(n) ? n : 0; }
  function money(v) { return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 4 }).format(num(v)); }
  function direction(v) { const n = num(v); return n > 0 ? 'THU' : n < 0 ? 'BÙ' : 'HÒA'; }
  function kindForStatus(status) {
    const s = String(status || '').toUpperCase();
    if (s === 'MATCH_EXACT') return 'ok';
    if (s === 'EMPTY') return '';
    if (['BLOCKED','MISMATCH'].includes(s)) return 'err';
    return 'warn';
  }
  function labelForStatus(status) {
    const s = String(status || '').toUpperCase();
    return ({
      MATCH_EXACT:'KHỚP EXACT', MATCH_DISPLAY_ONLY:'CHỈ KHỚP HIỂN THỊ', MISMATCH:'LỆCH TIỀN',
      BLOCKED:'FAIL-CLOSED', PROVISIONAL:'TẠM TÍNH', UNVERIFIED:'CHƯA ĐỐI CHIẾU', EMPTY:'CHƯA CÓ DỮ LIỆU'
    })[s] || s || 'CHƯA ĐỐI CHIẾU';
  }

  function add(target, totals) {
    target.xac += num(totals && totals.xac);
    target.qua_co += num(totals && totals.qua_co);
    target.payout += num(totals && totals.payout);
    target.refund_amount += num(totals && totals.refund_amount);
    target.final_net += num(totals && totals.final_net);
    target.direction = direction(target.final_net);
  }
  function emptyTotals() { return { xac:0, qua_co:0, payout:0, refund_amount:0, final_net:0, direction:'HÒA' }; }

  function buildViewModel(ops) {
    const roleTotals = { customer: emptyTotals(), owner: emptyTotals(), unknown: emptyTotals() };
    const regionTotals = { mn: emptyTotals(), mt: emptyTotals(), mb: emptyTotals() };
    for (const report of (ops && ops.partners) || []) {
      const role = report.partner && report.partner.role === 'owner' ? 'owner' : report.partner && report.partner.role === 'customer' ? 'customer' : 'unknown';
      add(roleTotals[role], report.totals);
      for (const region of report.regions || []) {
        if (!regionTotals[region.region]) regionTotals[region.region] = emptyTotals();
        add(regionTotals[region.region], {
          xac: region.total_xac, qua_co: region.total_qua_co, payout: region.total_payout,
          refund_amount: region.refund_amount, final_net: region.final_net
        });
      }
    }
    return { role_totals: roleTotals, region_totals: regionTotals };
  }

  function install() {
    const doc = global.document;
    const store = global.KTS_SETTLEMENT_STORE;
    const reportApi = global.KTS_SETTLEMENT_REPORT;
    if (!doc || !store || !reportApi || typeof reportApi.buildDailyOperationsReport !== 'function') return;
    const pane = doc.getElementById('pane-report');
    const firstCard = pane && pane.querySelector('.card');
    if (!pane || !firstCard || doc.getElementById('operationsReport')) return;

    const card = doc.createElement('div');
    card.className = 'card';
    card.innerHTML = '<div class="row" style="justify-content:space-between"><div><div class="section-title">Tổng quan vận hành trong ngày</div><div class="hint">Tổng tất cả khách/chủ · tách theo miền · trạng thái shadow. Không dùng để chốt nếu còn LỆCH / BLOCKED / TẠM TÍNH / CHƯA ĐỐI CHIẾU.</div></div><button id="loadOperationsReport" class="btn primary">Tổng quan ngày</button></div><div id="operationsReportStatus" class="status"></div><div id="operationsReport" class="hint">Chưa tải tổng quan.</div>';
    firstCard.insertAdjacentElement('afterend', card);

    function setStatus(text, kind) {
      const el = doc.getElementById('operationsReportStatus');
      if (!el) return;
      el.textContent = text || '';
      el.className = 'status ' + (kind || '');
    }

    function totalsLine(t) {
      return `XÁC ${money(t.xac)} · QUA CÒ ${money(t.qua_co)} · TRẢ ${money(t.payout)} · HỒI ${money(t.refund_amount)} · ${direction(t.final_net)} ${money(Math.abs(num(t.final_net)))}`;
    }

    function render(ops) {
      const host = doc.getElementById('operationsReport');
      if (!host) return;
      if (!ops || !ops.partners || !ops.partners.length) {
        host.innerHTML = '<div class="hint">Ngày này chưa có settlement.</div>';
        setStatus('Chưa có dữ liệu.', '');
        return;
      }
      const vm = buildViewModel(ops);
      const kind = kindForStatus(ops.status);
      const counts = ops.counts || {};
      const out = [];
      out.push(`<div class="status ${kind}"><b>${esc(labelForStatus(ops.status))}</b> · ${esc(ops.business_date)} · ${num(counts.partners)} đối tác</div>`);
      out.push(`<div style="margin:8px 0"><b>TỔNG SHADOW:</b> ${esc(totalsLine(ops.totals || emptyTotals()))}</div>`);
      out.push(`<div class="hint"><b>Exact-only:</b> ${esc(totalsLine(ops.exact_totals || emptyTotals()))}</div>`);
      out.push(`<div class="hint">Exact ${num(counts.exact)} · Chưa đối chiếu ${num(counts.unverified)} · Lệch ${num(counts.mismatch)} · Chỉ khớp hiển thị ${num(counts.display_only)} · Blocked ${num(counts.blocked)} · Tạm tính ${num(counts.provisional)}</div>`);

      out.push('<h3 style="margin:12px 0 4px">Theo vai trò</h3><table><thead><tr><th>Vai trò</th><th>XÁC</th><th>Qua cò</th><th>Trả</th><th>Thu/Bù</th></tr></thead><tbody>');
      for (const [role,label] of [['customer','Khách'],['owner','Chủ']]) {
        const t = vm.role_totals[role];
        out.push(`<tr><td><b>${label}</b></td><td>${money(t.xac)}</td><td>${money(t.qua_co)}</td><td>${money(t.payout)}</td><td>${esc(direction(t.final_net))} ${money(Math.abs(t.final_net))}</td></tr>`);
      }
      out.push('</tbody></table>');

      out.push('<h3 style="margin:12px 0 4px">Theo miền</h3><table><thead><tr><th>Miền</th><th>XÁC</th><th>Qua cò</th><th>Trả</th><th>Thu/Bù</th></tr></thead><tbody>');
      for (const [region,label] of [['mn','MN'],['mt','MT'],['mb','MB']]) {
        const t = vm.region_totals[region];
        if (!t || (!t.xac && !t.qua_co && !t.payout && !t.final_net)) continue;
        out.push(`<tr><td><b>${label}</b></td><td>${money(t.xac)}</td><td>${money(t.qua_co)}</td><td>${money(t.payout)}</td><td>${esc(direction(t.final_net))} ${money(Math.abs(t.final_net))}</td></tr>`);
      }
      out.push('</tbody></table>');

      out.push('<h3 style="margin:12px 0 4px">Từng khách / chủ</h3>');
      for (const report of ops.partners) {
        const p = report.partner || {};
        const status = report.blocked ? 'BLOCKED' : report.provisional ? 'PROVISIONAL' : report.shadow_status;
        const k = kindForStatus(status);
        const regionTags = (report.regions || []).map(r => `${String(r.region).toUpperCase()}:${direction(r.final_net)} ${money(Math.abs(num(r.final_net)))}`).join(' · ');
        out.push(`<div class="report-message"><div class="row" style="justify-content:space-between"><div><b>${esc(p.name || p.id || '')}</b> <span class="tag">${p.role === 'owner' ? 'Chủ' : 'Khách'}</span> <span class="tag ${k}">${esc(labelForStatus(status))}</span></div><button class="btn soft" data-open-partner="${esc(p.id || '')}">Chi tiết</button></div><div class="money" style="margin-top:5px">${esc(totalsLine(report.totals || emptyTotals()))}</div><div class="hint">${esc(regionTags)}</div></div>`);
      }
      host.innerHTML = out.join('');
      host.querySelectorAll('[data-open-partner]').forEach(btn => btn.addEventListener('click', () => {
        const select = doc.getElementById('reportPartner');
        if (select) select.value = btn.dataset.openPartner;
        const load = doc.getElementById('loadReport');
        if (load) load.click();
        firstCard.scrollIntoView({ behavior:'smooth', block:'start' });
      }));
      setStatus(ops.status === 'MATCH_EXACT' ? 'Toàn bộ đối tác trong ngày đang khớp exact.' : 'Còn phạm vi chưa đủ điều kiện để coi là khớp hoàn toàn.', kind);
    }

    async function load() {
      const date = doc.getElementById('reportDate');
      const businessDate = date ? String(date.value || '') : '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) return setStatus('Chọn ngày báo cáo.', 'err');
      setStatus('Đang tổng hợp toàn ngày…', '');
      try {
        const [partners, settlements, messages] = await Promise.all([
          store.getAll(store.STORES.partners), store.getAll(store.STORES.settlements), store.getAll(store.STORES.messages)
        ]);
        const messagesById = Object.fromEntries(messages.map(m => [m.id, m]));
        const ops = reportApi.buildDailyOperationsReport({ business_date: businessDate, partners, settlements, messages, messages_by_id: messagesById });
        render(ops);
      } catch (error) {
        setStatus(`Tổng hợp lỗi: ${String(error && error.message || error)}`, 'err');
      }
    }

    const button = doc.getElementById('loadOperationsReport');
    if (button) button.addEventListener('click', load);
    const date = doc.getElementById('reportDate');
    if (date) date.addEventListener('change', () => load().catch(() => {}));
    for (const nav of doc.querySelectorAll('.nav button[data-pane="report"]')) nav.addEventListener('click', () => load().catch(() => {}));
  }

  global.KTS_SETTLEMENT_OPERATIONS_UI = Object.freeze({ version:'operations-ui-v1', buildViewModel, direction, kindForStatus, labelForStatus });
  if (global.document && global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', install, { once:true });
  else install();
})(typeof window !== 'undefined' ? window : globalThis);
