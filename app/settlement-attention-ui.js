(function (global) {
  'use strict';

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }

  const PRIORITY = Object.freeze({
    BLOCKED: 1,
    MISMATCH: 2,
    PROVISIONAL: 3,
    MATCH_DISPLAY_ONLY: 4,
    INCOMPLETE_REFERENCE: 5,
    UNVERIFIED: 6,
    NO_DATA: 7
  });

  function statusLabel(status) {
    return ({
      BLOCKED:'FAIL-CLOSED',
      MISMATCH:'LỆCH HIOSKT',
      PROVISIONAL:'TẠM TÍNH',
      MATCH_DISPLAY_ONLY:'CHỈ KHỚP HIỂN THỊ',
      INCOMPLETE_REFERENCE:'THIẾU SỐ HIOSKT',
      UNVERIFIED:'CHƯA ĐỐI CHIẾU',
      NO_DATA:'CHƯA CÓ DỮ LIỆU'
    })[String(status || '').toUpperCase()] || String(status || 'CHƯA ĐỐI CHIẾU');
  }

  function statusKind(status) {
    const s = String(status || '').toUpperCase();
    if (s === 'BLOCKED' || s === 'MISMATCH') return 'err';
    return 'warn';
  }

  function actionFor(status) {
    const s = String(status || '').toUpperCase();
    if (s === 'BLOCKED') return 'message';
    if (s === 'PROVISIONAL') return 'result';
    return 'shadow';
  }

  function actionLabel(action) {
    return action === 'message' ? 'Mở tin' : action === 'result' ? 'Mở KQXS' : 'Đối chiếu';
  }

  function normalizedRegionStatus(report, region) {
    if (region && region.blocked) return 'BLOCKED';
    if (region && region.provisional) return 'PROVISIONAL';
    const s = String(region && region.shadow_status || report && report.shadow_status || 'UNVERIFIED').toUpperCase();
    return s === 'MATCH_EXACT' ? 'MATCH_EXACT' : s;
  }

  function buildAttention(model) {
    const items = [];
    const seen = new Set();
    for (const report of (model && model.partners) || []) {
      const partner = report.partner || {};
      const regions = Array.isArray(report.regions) ? report.regions : [];
      for (const region of regions) {
        const code = String(region.region || '').toLowerCase();
        const status = normalizedRegionStatus(report, region);
        if (!code || status === 'MATCH_EXACT') continue;
        const key = `${partner.id || ''}:${code}:${status}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const blocked = (report.blocked_scopes || []).filter(x => String(x.region || '').toLowerCase() === code);
        const reasons = blocked.flatMap(x => Array.isArray(x.reasons) ? x.reasons : []).filter(Boolean);
        items.push({
          partner_id: String(partner.id || ''),
          partner_name: String(partner.name || partner.id || ''),
          partner_role: String(partner.role || 'unknown'),
          region: code,
          status,
          kind: statusKind(status),
          action: actionFor(status),
          reasons,
          priority: PRIORITY[status] || 99
        });
      }
      for (const blocked of report.blocked_scopes || []) {
        const code = String(blocked.region || '').toLowerCase();
        if (!code || regions.some(r => String(r.region || '').toLowerCase() === code)) continue;
        const key = `${partner.id || ''}:${code}:BLOCKED`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({
          partner_id: String(partner.id || ''), partner_name: String(partner.name || partner.id || ''),
          partner_role: String(partner.role || 'unknown'), region: code, status:'BLOCKED', kind:'err', action:'message',
          reasons: Array.isArray(blocked.reasons) ? blocked.reasons.slice() : [], priority: PRIORITY.BLOCKED
        });
      }
    }
    const regionRank = { mn:0, mt:1, mb:2 };
    items.sort((a,b) => a.priority - b.priority || a.partner_name.localeCompare(b.partner_name, 'vi') || (regionRank[a.region] ?? 9) - (regionRank[b.region] ?? 9));
    const counts = {};
    for (const item of items) counts[item.status] = (counts[item.status] || 0) + 1;
    return { business_date: String(model && model.business_date || ''), items, counts, clear: items.length === 0 && String(model && model.status || '') === 'MATCH_EXACT' };
  }

  function install() {
    const doc = global.document;
    const store = global.KTS_SETTLEMENT_STORE;
    const reportApi = global.KTS_SETTLEMENT_REPORT;
    const pane = doc && doc.getElementById('pane-report');
    if (!doc || !store || !reportApi || !pane || doc.getElementById('dailyAttention')) return;

    const anchor = doc.getElementById('dailyOpsDashboard') || pane.querySelector('.card');
    const card = doc.createElement('div');
    card.className = 'card';
    card.id = 'dailyAttention';
    card.innerHTML = `<div class="row" style="justify-content:space-between"><div><div class="section-title">Việc cần xử lý</div><div class="hint">Chỉ hiện các phạm vi chưa khớp exact. Ưu tiên fail-closed → lệch HIOSKT → tạm tính → chưa đối chiếu.</div></div><button id="refreshAttention" class="btn soft">Làm mới</button></div><div id="attentionStatus" class="status"></div><div id="attentionList" class="hint">Chưa tải.</div>`;
    if (anchor) anchor.insertAdjacentElement('afterend', card); else pane.appendChild(card);

    function setStatus(text, kind) {
      const el = doc.getElementById('attentionStatus');
      if (!el) return;
      el.textContent = text || '';
      el.className = 'status ' + (kind || '');
    }

    function openNav(name) {
      const btn = doc.querySelector(`.nav button[data-pane="${name}"]`);
      if (btn && typeof btn.click === 'function') btn.click();
    }

    function openItem(item, businessDate) {
      if (item.action === 'message') {
        const partner = doc.getElementById('partnerSelect');
        const date = doc.getElementById('messageDate');
        const region = doc.getElementById('messageRegion');
        if (partner) partner.value = item.partner_id;
        if (date) date.value = businessDate;
        if (region) region.value = item.region;
        openNav('message');
        return;
      }
      if (item.action === 'result') {
        const date = doc.getElementById('resultDate');
        const region = doc.getElementById('resultRegion');
        if (date && !date.disabled) date.value = businessDate;
        if (region) region.value = item.region;
        openNav('result');
        return;
      }
      const partner = doc.getElementById('reportPartner');
      const region = doc.getElementById('shadowRegion');
      if (partner) partner.value = item.partner_id;
      if (region) region.value = item.region;
      const load = doc.getElementById('shadowLoad');
      if (load && typeof load.click === 'function') load.click();
      const panel = doc.getElementById('shadowPanel');
      if (panel && typeof panel.scrollIntoView === 'function') panel.scrollIntoView({ behavior:'smooth', block:'start' });
    }

    function render(attention) {
      const host = doc.getElementById('attentionList');
      if (!host) return;
      if (attention.clear) {
        setStatus('Không còn việc cần xử lý · toàn ngày đang khớp exact.', 'ok');
        host.innerHTML = '<div class="hint">Gate shadow của ngày này sạch.</div>';
        return;
      }
      if (!attention.items.length) {
        setStatus('Chưa có phạm vi để kiểm tra.', 'warn');
        host.innerHTML = '<div class="hint">Chưa có dữ liệu hoặc chưa tạo settlement.</div>';
        return;
      }
      setStatus(`${attention.items.length} phạm vi cần xử lý.`, attention.items.some(x => x.kind === 'err') ? 'err' : 'warn');
      host.innerHTML = attention.items.map((item, index) => {
        const reason = item.reasons.length ? `<div class="hint">${esc(item.reasons.join(' · '))}</div>` : '';
        return `<div class="report-message"><div class="row" style="justify-content:space-between"><div><b>${esc(item.partner_name)}</b> <span class="tag">${esc(item.region.toUpperCase())}</span> <span class="tag ${esc(item.kind)}">${esc(statusLabel(item.status))}</span></div><button class="btn soft" data-attention-index="${index}">${esc(actionLabel(item.action))}</button></div>${reason}</div>`;
      }).join('');
      host.querySelectorAll('[data-attention-index]').forEach(btn => btn.addEventListener('click', () => {
        const item = attention.items[Number(btn.dataset.attentionIndex)];
        if (item) openItem(item, attention.business_date);
      }));
    }

    async function refresh() {
      const date = doc.getElementById('reportDate');
      const businessDate = date ? String(date.value || '') : '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) return setStatus('Chọn ngày báo cáo hợp lệ.', 'err');
      try {
        const [partners, settlements, messages] = await Promise.all([
          store.getAll(store.STORES.partners), store.getAll(store.STORES.settlements), store.getAll(store.STORES.messages)
        ]);
        const model = reportApi.buildDailyOperationsReport({ business_date: businessDate, partners, settlements, messages });
        const attention = buildAttention(model);
        render(attention);
        return attention;
      } catch (e) {
        setStatus('Không tải được việc cần xử lý: ' + String(e && e.message || e), 'err');
        return null;
      }
    }

    const refreshBtn = doc.getElementById('refreshAttention');
    if (refreshBtn) refreshBtn.addEventListener('click', refresh);
    const date = doc.getElementById('reportDate');
    if (date) date.addEventListener('change', refresh);
    if (typeof global.addEventListener === 'function') {
      global.addEventListener('kts:auto-result-recalculated', () => { if (pane.classList.contains('active')) refresh().catch(() => {}); });
      global.addEventListener('kts:shadow-saved', () => { if (pane.classList.contains('active')) refresh().catch(() => {}); });
    }
    for (const btn of doc.querySelectorAll('.nav button[data-pane="report"]')) btn.addEventListener('click', refresh);
  }

  global.KTS_SETTLEMENT_ATTENTION = Object.freeze({
    version:'settlement-attention-v1', PRIORITY, statusLabel, statusKind, actionFor, actionLabel, buildAttention
  });
  if (global.document && global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', install, { once:true });
  else install();
})(typeof window !== 'undefined' ? window : globalThis);
