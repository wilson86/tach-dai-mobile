(function (global) {
  'use strict';

  const $ = id => document.getElementById(id);
  const store = global.KTS_SETTLEMENT_STORE;
  const resultService = global.KTS_RESULT_SERVICE;
  const resultProvider = global.KTS_RESULT_PROVIDER;
  const parserProvider = global.KTS_SETTLEMENT_PARSER_PROVIDER;
  const pipeline = global.KTS_SETTLEMENT_PIPELINE;
  const reportApi = global.KTS_SETTLEMENT_REPORT;
  if (!store || !resultService || !resultProvider || !parserProvider || !pipeline || !reportApi) throw new Error('SETTLEMENT_UI_DEPENDENCY_MISSING');

  const PRICES_MN_MT = [
    ['2CB', '2C lô'], ['2CD', '2C ĐĐ'], ['2CB7', '2C 7 lô'], ['DAT', '2C ĐáT'], ['DAX', '2C ĐáX'],
    ['3CB', '3C lô'], ['3CB7', '3C 7 lô'], ['3CDD', '3C ĐĐ / XC'], ['4C', '4C']
  ];
  const PRICES_MB = [
    ['2CB', '2C lô'], ['2CD', '2C ĐĐ'], ['2CB8', '2C 8 lô'], ['DAT', '2C đá thẳng'],
    ['3CB', '3C lô'], ['3CB7', '3C 7 lô'], ['3CDD', '3C ĐĐ / xỉu chủ'], ['4C', '4C'],
    ['MB_XIEN2', 'Xiên 2', 'xien'], ['MB_XIEN3', 'Xiên 3', 'xien'], ['MB_XIEN4', 'Xiên 4', 'xien'], ['UI', 'Ủi', 'ui']
  ];

  let partners = [];
  let inactivePartners = [];
  let poller = null;
  let savingMessage = false;

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function status(id, text, kind) {
    const el = $(id);
    if (!el) return;
    el.textContent = text || '';
    el.className = 'status ' + (kind || '');
  }

  function money(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) ? new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 4 }).format(n) : '0';
  }

  function renderPricing(targetId, rows, region) {
    const table = [`<table><thead><tr><th>Loại</th><th>Cò</th><th>Trúng</th></tr></thead><tbody>`];
    for (const [code, label, gate] of rows) {
      const gateClass = gate ? ` data-gate="${gate}"` : '';
      table.push(`<tr${gateClass}><td><b>${esc(label)}</b><div class="hint">${esc(code)}</div></td><td><input data-price-region="${region}" data-price-code="${code}" data-price-field="commission" inputmode="decimal" value="0"></td><td><input data-price-region="${region}" data-price-code="${code}" data-price-field="win" inputmode="decimal" value="0"></td></tr>`);
    }
    table.push('</tbody></table>');
    $(targetId).innerHTML = table.join('');
    refreshGateVisuals();
  }

  function refreshGateVisuals() {
    const xienOn = $('allowMbXien').checked;
    const uiOn = $('allowUi').checked;
    document.querySelectorAll('[data-gate="xien"] input').forEach(el => { el.disabled = !xienOn; });
    document.querySelectorAll('[data-gate="ui"] input').forEach(el => { el.disabled = !uiOn; });
  }

  function currentPartnerId() { return $('partnerSelect').value || ''; }
  function selectedPartner() { return partners.find(p => p.id === currentPartnerId()) || null; }

  async function refreshPartners(preferId) {
    const allPartners = await store.getAll(store.STORES.partners);
    partners = allPartners.filter(p => p.active !== false).sort((a, b) => String(a.name).localeCompare(String(b.name), 'vi'));
    inactivePartners = allPartners.filter(p => p.active === false).sort((a, b) => String(a.name).localeCompare(String(b.name), 'vi'));
    const options = partners.map(p => `<option value="${esc(p.id)}">${esc(p.name)} · ${p.role === 'owner' ? 'Chủ' : 'Khách'}</option>`).join('');
    $('partnerSelect').innerHTML = options || '<option value="">Chưa có đối tác</option>';
    $('reportPartner').innerHTML = options || '<option value="">Chưa có đối tác</option>';
    const inactive = inactivePartners.map(p => `<option value="${esc(p.id)}">${esc(p.name)} · ${p.role === 'owner' ? 'Chủ' : 'Khách'}</option>`).join('');
    $('inactivePartnerSelect').innerHTML = inactive || '<option value="">Không có</option>';
    if (preferId && partners.some(p => p.id === preferId)) {
      $('partnerSelect').value = preferId;
      $('reportPartner').value = preferId;
    }
    updatePartnerView();
    await loadConfigForDate();
  }

  function updatePartnerView() {
    const p = selectedPartner();
    $('partnerRoleView').textContent = p ? (p.role === 'owner' ? 'Chủ' : 'Khách') : '—';
  }

  async function addPartner() {
    const name = $('partnerName').value.trim();
    if (!name) return status('partnerStatus', 'Nhập tên đối tác.', 'err');
    try {
      const saved = await store.savePartner({ name, role: $('partnerRole').value });
      $('partnerName').value = '';
      await refreshPartners(saved.id);
      status('partnerStatus', `Đã lưu ${saved.name}.`, 'ok');
    } catch (e) { status('partnerStatus', String(e.message || e), 'err'); }
  }

  function configCloneInput(cfg, partnerId) {
    return {
      partner_id: partnerId,
      effective_from_date: cfg.effective_from_date,
      region_pricing: JSON.parse(JSON.stringify(cfg.region_pricing || {})),
      dat_hit_mode: cfg.dat_hit_mode,
      dax_hit_mode: cfg.dax_hit_mode,
      mb_xien_234: cfg.mb_xien_234 === true,
      tinh_ui: cfg.tinh_ui === true,
      total_percent: cfg.total_percent,
      refund_percent: cfg.refund_percent,
      commission_type: cfg.commission_type
    };
  }

  async function copyPartner() {
    const source = selectedPartner();
    if (!source) return status('partnerStatus', 'Chưa chọn khách/chủ để copy.', 'err');
    const proposed = source.name + ' - Copy';
    const entered = global.prompt ? global.prompt('Tên khách/chủ mới', proposed) : proposed;
    if (entered == null) return;
    const name = String(entered || '').trim();
    if (!name) return status('partnerStatus', 'Tên bản copy không được để trống.', 'err');
    try {
      let cfg = null;
      const date = $('effectiveDate').value || today();
      try { cfg = await store.resolveConfigForDate(source.id, date); }
      catch (e) {
        if (!String(e && e.message || e).includes('NO_CONFIG')) throw e;
      }
      const saved = await store.savePartner({ name, role: source.role, phone: source.phone || '' });
      if (cfg) await store.saveConfig(configCloneInput(cfg, saved.id));
      await refreshPartners(saved.id);
      status('partnerStatus', cfg
        ? `Đã copy ${source.name} → ${saved.name}, gồm cấu hình đang áp dụng. Không copy tin/KQXS/lịch sử tiền.`
        : `Đã copy ${source.name} → ${saved.name}. Nguồn chưa có cấu hình nên chỉ copy khách/chủ.`, 'ok');
    } catch (e) { status('partnerStatus', String(e.message || e), 'err'); }
  }

  async function deactivatePartner() {
    const source = selectedPartner();
    if (!source) return status('partnerStatus', 'Chưa chọn khách/chủ để xóa.', 'err');
    const ok = !global.confirm || global.confirm(`Xóa ${source.name} khỏi danh sách đang dùng?\n\nTin, settlement và lịch sử cũ vẫn được giữ để đối soát.`);
    if (!ok) return;
    try {
      await store.savePartner({ id:source.id, name:source.name, phone:source.phone || '', role:source.role, active:false, created_at:source.created_at });
      await refreshPartners();
      status('partnerStatus', `Đã xóa ${source.name} khỏi danh sách đang dùng. Lịch sử cũ vẫn được giữ và có thể khôi phục.`, 'ok');
    } catch (e) { status('partnerStatus', String(e.message || e), 'err'); }
  }

  async function restorePartner() {
    const id = $('inactivePartnerSelect').value;
    const source = inactivePartners.find(p => p.id === id);
    if (!source) return status('partnerStatus', 'Không có khách/chủ đã xóa để khôi phục.', 'warn');
    try {
      const saved = await store.savePartner({ id:source.id, name:source.name, phone:source.phone || '', role:source.role, active:true, created_at:source.created_at });
      await refreshPartners(saved.id);
      status('partnerStatus', `Đã khôi phục ${saved.name}.`, 'ok');
    } catch (e) { status('partnerStatus', String(e.message || e), 'err'); }
  }

  function priceInputsToObject() {
    const out = { mn: {}, mt: {}, mb: {} };
    document.querySelectorAll('[data-price-region]').forEach(input => {
      const region = input.dataset.priceRegion;
      const code = input.dataset.priceCode;
      const field = input.dataset.priceField;
      if (!out[region][code]) out[region][code] = {};
      out[region][code][field] = String(input.value || '0').trim() || '0';
    });
    return out;
  }

  function fillPricing(config) {
    const pricing = config && config.region_pricing ? config.region_pricing : {};
    document.querySelectorAll('[data-price-region]').forEach(input => {
      const region = input.dataset.priceRegion;
      const code = input.dataset.priceCode;
      const field = input.dataset.priceField;
      const regionData = pricing[region] || (region === 'mt' ? pricing.mn : {}) || {};
      input.value = regionData[code] && regionData[code][field] != null ? regionData[code][field] : '0';
    });
  }

  function resetConfigForm() {
    $('commissionType').value = 'ratio';
    $('totalPercent').value = '100';
    $('refundPercent').value = '0';
    $('datMode').value = 'ky_ruoi';
    $('daxMode').value = 'multi_pair';
    $('allowMbXien').checked = false;
    $('allowUi').checked = false;
    fillPricing(null);
    refreshGateVisuals();
  }

  function applyConfig(config) {
    $('commissionType').value = config.commission_type || 'ratio';
    $('totalPercent').value = config.total_percent == null ? '100' : config.total_percent;
    $('refundPercent').value = config.refund_percent == null ? '0' : config.refund_percent;
    $('datMode').value = config.dat_hit_mode || 'ky_ruoi';
    $('daxMode').value = config.dax_hit_mode || 'multi_pair';
    $('allowMbXien').checked = config.mb_xien_234 === true;
    $('allowUi').checked = config.tinh_ui === true;
    fillPricing(config);
    refreshGateVisuals();
  }

  async function loadConfigForDate() {
    const partnerId = currentPartnerId();
    if (!partnerId) { resetConfigForm(); return; }
    const date = $('effectiveDate').value || today();
    try {
      const cfg = await store.resolveConfigForDate(partnerId, date);
      applyConfig(cfg);
      status('configStatus', `Đang xem cấu hình v${cfg.version} hiệu lực từ ${cfg.effective_from_date}.`, 'ok');
    } catch (e) {
      resetConfigForm();
      if (String(e.message || e).includes('NO_CONFIG')) status('configStatus', 'Chưa có cấu hình trước ngày này. Hãy tạo phiên bản đầu tiên.', 'warn');
      else status('configStatus', String(e.message || e), 'err');
    }
  }

  async function saveConfig() {
    const partnerId = currentPartnerId();
    if (!partnerId) return status('configStatus', 'Chưa chọn đối tác.', 'err');
    const effective = $('effectiveDate').value;
    if (!effective) return status('configStatus', 'Chọn ngày bắt đầu áp dụng.', 'err');
    try {
      const cfg = await store.saveConfig({
        partner_id: partnerId,
        effective_from_date: effective,
        commission_type: $('commissionType').value,
        total_percent: $('totalPercent').value,
        refund_percent: $('refundPercent').value,
        dat_hit_mode: $('datMode').value,
        dax_hit_mode: $('daxMode').value,
        mb_xien_234: $('allowMbXien').checked,
        tinh_ui: $('allowUi').checked,
        region_pricing: priceInputsToObject()
      });
      const recalculated = await pipeline.recalculatePartnerFromDate(partnerId, effective);
      status('configStatus', `Đã lưu v${cfg.version}, áp dụng từ ${cfg.effective_from_date}. Ngày trước giữ rule cũ · đã rà lại ${recalculated.length} phạm vi có tin.`, 'ok');
    } catch (e) { status('configStatus', String(e.message || e), 'err'); }
  }

  async function saveMessage() {
    const partnerId = currentPartnerId();
    const raw = $('messageText').value.trim();
    const button = $('saveMessage');
    if (!partnerId) return status('messageStatus', 'Chưa chọn đối tác.', 'err');
    if (!raw) return status('messageStatus', 'Chưa có tin.', 'err');
    if (savingMessage) return status('messageStatus', 'Tin trước đang được lưu. Chờ hoàn tất để tránh gửi trùng.', 'warn');

    savingMessage = true;
    const originalLabel = button ? button.textContent : '';
    if (button) { button.disabled = true; button.textContent = 'Đang lưu…'; }
    status('messageStatus', 'Đang chạy canonical parser…', '');
    try {
      const outcome = await pipeline.parseAndSaveMessage({
        partner_id: partnerId,
        business_date: $('messageDate').value,
        region: $('messageRegion').value,
        raw_text: raw,
        parser_provider: parserProvider
      });
      if (outcome.status === 'parser_error') {
        status('messageStatus', `Đã giữ tin ${outcome.message.id} nhưng KHÔNG tính tiền: ${outcome.error}`, 'err');
        return outcome;
      }

      // Canonical message was accepted and is already durable. Clear the editor
      // so a fast second tap cannot accidentally create another identical bet.
      // Intentionally retyping/pasting the same line after this completes still
      // creates a new message, because identical real bets are valid business data.
      $('messageText').value = '';
      $('messageText').focus();

      if (outcome.status === 'parsed_waiting_result') {
        status('messageStatus', `Đã parse tin ${outcome.message.id}. Chờ KQXS trước khi tính tiền.`, 'warn');
        return outcome;
      }
      if (outcome.status === 'blocked') {
        status('messageStatus', `Tin đã parse nhưng settlement đang chặn: ${outcome.settlement && outcome.settlement.reason ? outcome.settlement.reason : 'xem báo cáo'}`, 'err');
        return outcome;
      }
      status('messageStatus', `Đã lưu + tính tin ${outcome.message.id} · ${outcome.status === 'provisional' ? 'TẠM TÍNH' : 'chờ đối chiếu HIOSKT'}.`, outcome.status === 'provisional' ? 'warn' : 'ok');
      return outcome;
    } catch (e) {
      status('messageStatus', String(e.message || e), 'err');
      return null;
    } finally {
      savingMessage = false;
      if (button) { button.disabled = false; button.textContent = originalLabel || 'Lưu + tính'; }
    }
  }

  async function recalcAfterResult(snapshot) {
    try {
      const rows = await pipeline.recalculateDateRegion({ business_date: snapshot.business_date, region: snapshot.region, result_snapshot: snapshot });
      const blocked = rows.filter(x => x.status === 'blocked').length;
      if (blocked) status('resultStatus', `KQXS đã cập nhật · đã tính lại ${rows.length} đối tác · ${blocked} phạm vi đang fail-closed.`, 'warn');
    } catch (e) { status('resultStatus', 'KQXS có dữ liệu nhưng tính lại lỗi: ' + String(e.message || e), 'err'); }
  }

  function renderResult(snapshot, meta) {
    const badge = snapshot.complete ? '<span class="tag ok">ĐÃ CHỐT</span>' : '<span class="tag warn">TẠM TÍNH</span>';
    const parts = [`<div class="row" style="justify-content:space-between"><div>${badge} <span class="hint">${esc(snapshot.source)} · ${esc(snapshot.fetched_at)}</span></div></div>`];
    for (const station of snapshot.stations) {
      parts.push(`<h3 style="margin:12px 0 4px">${esc(station.name)}</h3><table><thead><tr><th>Giải</th><th>Kết quả</th></tr></thead><tbody>`);
      const order = snapshot.region === 'mb' ? ['DB','G1','G2','G3','G4','G5','G6','G7'] : ['G8','G7','G6','G5','G4','G3','G2','G1','DB'];
      for (const prize of order) parts.push(`<tr><td><b>${prize}</b></td><td>${esc((station.prizes[prize] || []).join(' · '))}</td></tr>`);
      parts.push('</tbody></table>');
    }
    if (meta && meta.changed && meta.previous) parts.push('<div class="status warn">Nguồn vừa thay đổi kết quả đã lưu. Hệ thống sẽ tự tính lại toàn bộ settlement liên quan.</div>');
    $('resultTable').innerHTML = parts.join('');
    recalcAfterResult(snapshot);
  }

  function renderPollStatus(info) {
    const state = info && info.state;
    if (state === 'fetching') status('resultStatus', 'Đang lấy KQXS…', '');
    else if (state === 'waiting') status('resultStatus', 'Chưa đủ giải · sẽ cập nhật lại sau 90 giây · settlement chỉ TẠM TÍNH.', 'warn');
    else if (state === 'complete') status('resultStatus', 'Đã đủ kết quả · dừng polling · settlement được tính lại và chờ shadow đối chiếu.', 'ok');
    else if (state === 'error') status('resultStatus', `Chưa lấy được KQXS: ${info.error}. Giữ dữ liệu gần nhất và sẽ thử lại.`, 'err');
  }

  async function startResults() {
    if (poller) poller.stop();
    poller = resultService.createPoller({
      fetchSnapshot: resultProvider.fetchSnapshot,
      store,
      intervalMs: 90000,
      onUpdate: renderResult,
      onStatus: renderPollStatus
    });
    try {
      await poller.start({ business_date: $('resultDate').value, region: $('resultRegion').value });
    } catch (e) { status('resultStatus', String(e.message || e), 'err'); }
  }

  function stopResults() {
    if (poller) poller.stop();
    status('resultStatus', 'Đã dừng tự cập nhật.', '');
  }

  function renderReport(report) {
    const out = [`<div class="row" style="justify-content:space-between"><b>${esc(report.partner.name || '')}</b><span class="tag">${esc(report.business_date)}</span></div>`];
    if (!report.messages.length && !report.blocked) { $('reportOutput').innerHTML = '<div class="hint">Ngày này chưa có settlement.</div>'; return; }
    if (report.blocked) out.push(`<div class="status err">FAIL-CLOSED: có ${report.blocked_scopes.length} phạm vi chưa đủ điều kiện tính. Không dùng tổng tiền này để chốt.</div>`);
    else if (report.provisional) out.push('<div class="status warn">TẠM TÍNH: KQXS chưa hoàn tất.</div>');
    out.push(`<details style="margin:8px 0"><summary class="hint">Tổng cộng cả 3 miền</summary><div style="margin-top:6px"><span class="money">XÁC ${money(report.totals.xac)}</span> · QUA CÒ <span class="money">${money(report.totals.qua_co)}</span> · TRẢ TRÚNG <span class="money">${money(report.totals.payout)}</span> · HỒI <span class="money">${money(report.totals.refund_amount)}</span></div><div class="status ${report.totals.direction === 'THU' ? 'ok' : report.totals.direction === 'BU' ? 'err' : ''}">${report.totals.direction}: ${money(report.totals.final_net)}</div></details>`);
    for (const region of report.regions) {
      const regionName = region.region === 'mn' ? 'MIỀN NAM' : region.region === 'mt' ? 'MIỀN TRUNG' : region.region === 'mb' ? 'MIỀN BẮC' : region.region.toUpperCase();
      out.push(`<h3>${regionName} ${region.blocked ? '<span class="tag warn">BLOCKED</span>' : region.provisional ? '<span class="tag warn">TẠM TÍNH</span>' : ''}</h3><div class="hint">XÁC ${money(region.total_xac)} · QUA CÒ ${money(region.total_qua_co)} · TRẢ ${money(region.total_payout)} · HỒI ${money(region.refund_amount)} · ${region.direction}: ${money(Math.abs(Number(region.final_net || 0)))}</div><table><thead><tr><th>Loại</th><th>XÁC</th><th>Qua cò</th><th>Trúng</th><th>Trả</th></tr></thead><tbody>`);
      for (const row of region.categories) out.push(`<tr><td>${esc(row.code)}</td><td>${money(row.xac)}</td><td>${money(row.qua_co)}</td><td>${money(row.hit_units)}</td><td>${money(row.payout)}</td></tr>`);
      out.push('</tbody></table>');
      for (const msg of region.messages) {
        out.push(`<div class="report-message"><div class="raw">${esc(msg.raw_text)}</div>`);
        for (const d of msg.detail_rows) out.push(`<div class="hint">• ${esc(d.station || '')} ${esc(d.numbers || '')} ${esc(d.selector || d.code || '')} · xác ${money(d.xac)} · trúng ${money(d.hit_units)} ${d.points != null ? '· ' + esc(d.points) + 'n' : ''}</div>`);
        out.push(`</div>`);
      }
    }
    $('reportOutput').innerHTML = out.join('');
  }

  async function loadReport() {
    const partnerId = $('reportPartner').value;
    const date = $('reportDate').value;
    if (!partnerId || !date) return;
    const partner = partners.find(p => p.id === partnerId) || { id: partnerId };
    const settlements = await store.getAll(store.STORES.settlements);
    const messages = await store.getAll(store.STORES.messages);
    const messagesById = Object.fromEntries(messages.map(m => [m.id, m]));
    renderReport(reportApi.buildDailyPartnerReport({ partner, business_date: date, settlements, messages_by_id: messagesById }));
  }

  function nav() {
    document.querySelectorAll('.nav button').forEach(btn => btn.addEventListener('click', () => {
      document.querySelectorAll('.nav button').forEach(x => x.classList.toggle('active', x === btn));
      document.querySelectorAll('.pane').forEach(p => p.classList.toggle('active', p.id === 'pane-' + btn.dataset.pane));
    }));
  }

  async function boot() {
    nav();
    renderPricing('priceMn', PRICES_MN_MT, 'mn');
    renderPricing('priceMt', PRICES_MN_MT, 'mt');
    renderPricing('priceMb', PRICES_MB, 'mb');
    const d = today();
    for (const id of ['effectiveDate','messageDate','resultDate','reportDate']) $(id).value = d;
    $('resultEndpoint').value = resultProvider.endpoint();
    $('parserEndpoint').value = parserProvider.endpoint();
    $('allowMbXien').addEventListener('change', refreshGateVisuals);
    $('allowUi').addEventListener('change', refreshGateVisuals);
    $('partnerSelect').addEventListener('change', async () => { updatePartnerView(); $('reportPartner').value = currentPartnerId(); await loadConfigForDate(); });
    $('effectiveDate').addEventListener('change', loadConfigForDate);
    $('addPartner').addEventListener('click', addPartner);
    $('copyPartner').addEventListener('click', copyPartner);
    $('deactivatePartner').addEventListener('click', deactivatePartner);
    $('restorePartner').addEventListener('click', restorePartner);
    $('saveConfig').addEventListener('click', saveConfig);
    $('saveMessage').addEventListener('click', saveMessage);
    $('messageText').addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        saveMessage();
      }
    });
    $('clearMessage').addEventListener('click', () => { $('messageText').value = ''; status('messageStatus', '', ''); });
    $('saveParserEndpoint').addEventListener('click', () => {
      try { $('parserEndpoint').value = parserProvider.setEndpoint($('parserEndpoint').value); status('messageStatus', 'Đã lưu endpoint canonical parser.', 'ok'); }
      catch (e) { status('messageStatus', String(e.message || e), 'err'); }
    });
    $('startResults').addEventListener('click', startResults);
    $('stopResults').addEventListener('click', stopResults);
    $('saveEndpoint').addEventListener('click', () => {
      try { $('resultEndpoint').value = resultProvider.setEndpoint($('resultEndpoint').value); status('resultStatus', 'Đã lưu endpoint KQXS. Không lưu API key trong PWA.', 'ok'); }
      catch (e) { status('resultStatus', String(e.message || e), 'err'); }
    });
    $('loadReport').addEventListener('click', loadReport);
    await refreshPartners();
  }

  boot().catch(e => status('partnerStatus', 'Khởi tạo lỗi: ' + String(e.message || e), 'err'));
})(typeof window !== 'undefined' ? window : globalThis);
