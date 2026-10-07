(function (global) {
  'use strict';

  const $ = id => document.getElementById(id);
  const store = global.KTS_SETTLEMENT_STORE;
  const resultService = global.KTS_RESULT_SERVICE;
  const resultProvider = global.KTS_RESULT_PROVIDER;
  const parserProvider = global.KTS_SETTLEMENT_PARSER_PROVIDER;
  const pipeline = global.KTS_SETTLEMENT_PIPELINE;
  const reportApi = global.KTS_SETTLEMENT_REPORT;
  const pricingCopy = global.KTS_SETTLEMENT_PRICING_COPY;
  const configValidation = global.KTS_SETTLEMENT_CONFIG_VALIDATION;
  if (!store || !resultService || !resultProvider || !parserProvider || !pipeline || !reportApi || !pricingCopy || !configValidation) throw new Error('SETTLEMENT_UI_DEPENDENCY_MISSING');

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
  let pendingConfigTemplate = null;
  let savingMessage = false;
  let savingConfig = false;
  let configDirty = false;
  let loadedConfigPartnerId = '';
  let loadedConfigDate = '';

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

  function friendlyParserError(error) {
    const text = String(error && error.message || error || '');
    const maps = [
      ['SETTLEMENT_DUPLICATE_NUMBER','Có số bị lặp trong cùng một nhóm. Hãy kiểm tra lại tin.'],
      ['SETTLEMENT_STATION_REQUIRED','Không nhận ra đài trong tin. Hãy kiểm tra tên/viết tắt đài.'],
      ['SETTLEMENT_ACTION_REQUIRED','Thiếu cách đánh sau nhóm số.'],
      ['SETTLEMENT_STAKE_REQUIRED','Thiếu tiền cược hoặc đơn vị tiền.'],
      ['INVALID_SETTLEMENT_STAKE','Tiền cược không hợp lệ.'],
      ['UNVERIFIED_SETTLEMENT_ACTION','Cách đánh này chưa được xác nhận trong KTS nên chưa tính.'],
      ['SETTLEMENT_VALUE_REQUIRED','Thiếu số hoặc nhóm số không hợp lệ.'],
      ['SETTLEMENT_MESSAGE_HAS_NO_LEGS','Không đọc được cách đánh nào trong tin.'],
      ['PARSER_REGION_MISMATCH','Miền của tin không khớp miền đang chọn.'],
      ['PARSER_MESSAGE_REQUIRED','Tin đang trống.']
    ];
    const hit = maps.find(([code]) => text.includes(code));
    return hit ? hit[1] : 'Không đọc được cú pháp tin. Tin chưa được tính; hãy kiểm tra và sửa lại.';
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

  function applyGateState(selector, enabled) {
    document.querySelectorAll(selector).forEach(row => {
      row.classList.toggle('hidden', !enabled);
      row.querySelectorAll('input').forEach(input => {
        input.disabled = !enabled;
        if (!enabled) input.value = '0';
      });
    });
  }

  function refreshGateVisuals() {
    const xienOn = $('allowMbXien').checked;
    const uiOn = $('allowUi').checked;
    applyGateState('[data-gate="xien"]', xienOn);
    applyGateState('[data-gate="ui"]', uiOn);
  }

  function currentPartnerId() { return $('partnerSelect').value || ''; }
  function selectedPartner() { return partners.find(p => p.id === currentPartnerId()) || null; }

  function setConfigDirty(value) {
    configDirty = Boolean(value);
    const el = $('configDirtyStatus');
    if (el) {
      el.textContent = configDirty ? 'Chưa lưu thay đổi' : 'Đã lưu';
      el.className = 'tag ' + (configDirty ? 'warn' : 'ok');
    }
  }

  function confirmDiscardConfigChanges() {
    return !configDirty || !global.confirm || global.confirm('Thiết lập đang có thay đổi chưa lưu. Bỏ các thay đổi này?');
  }

  function isConfigEditableControl(el) {
    if (!el) return false;
    if (el.dataset && el.dataset.priceRegion) return true;
    return new Set([
      'commissionType','mnTotalPercent','mnRefundPercent','mnDatMode','mnDaxMode',
      'mtTotalPercent','mtRefundPercent','mtDatMode','mtDaxMode',
      'mbTotalPercent','mbRefundPercent','allowMbXien','allowUi'
    ]).has(String(el.id || ''));
  }

  function configEditorSignature() {
    const draft = {
      partner_id: currentPartnerId(),
      effective_from_date: String($('effectiveDate').value || ''),
      commission_type: String($('commissionType').value || ''),
      region_terms: regionTermsFromForm(),
      region_pricing: priceInputsToObject(),
      mb_xien_234: Boolean($('allowMbXien').checked),
      tinh_ui: Boolean($('allowUi').checked)
    };
    return typeof store.stableStringify === 'function' ? store.stableStringify(draft) : JSON.stringify(draft);
  }

  async function refreshPartners(preferId) {
    const allPartners = await store.getAll(store.STORES.partners);
    partners = allPartners.filter(p => p.active !== false).sort((a, b) => String(a.name).localeCompare(String(b.name), 'vi'));
    inactivePartners = allPartners.filter(p => p.active === false).sort((a, b) => String(a.name).localeCompare(String(b.name), 'vi'));
    const options = partners.map(p => `<option value="${esc(p.id)}">${esc(p.name)} · ${p.role === 'owner' ? 'Chủ' : 'Khách'}</option>`).join('');
    $('partnerSelect').innerHTML = options || '<option value="">Chưa có đối tác</option>';
    const reportRows = partners.concat(inactivePartners).sort((a, b) => String(a.name).localeCompare(String(b.name), 'vi'));
    const reportOptions = reportRows.map(p => `<option value="${esc(p.id)}">${esc(p.name)} · ${p.role === 'owner' ? 'Chủ' : 'Khách'}${p.active === false ? ' · Đã ngừng' : ''}</option>`).join('');
    $('reportPartner').innerHTML = reportOptions || '<option value="">Chưa có đối tác</option>';
    const inactive = inactivePartners.map(p => `<option value="${esc(p.id)}">${esc(p.name)} · ${p.role === 'owner' ? 'Chủ' : 'Khách'}</option>`).join('');
    $('inactivePartnerSelect').innerHTML = inactive || '<option value="">Không có</option>';
    if (preferId && partners.some(p => p.id === preferId)) $('partnerSelect').value = preferId;
    if (preferId && reportRows.some(p => p.id === preferId)) $('reportPartner').value = preferId;
    updatePartnerView();
    await loadConfigForDate();
  }

  function updatePartnerView() {
    const p = selectedPartner();
    $('partnerRoleView').textContent = p ? (p.role === 'owner' ? 'Chủ' : 'Khách') : '—';
    const configName = $('configPartnerName');
    if (configName) configName.textContent = p ? `${p.name} · ${p.role === 'owner' ? 'Chủ' : 'Khách'}` : 'Chưa chọn đối tác';
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
      region_terms: JSON.parse(JSON.stringify(cfg.region_terms || {})),
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
    if (!confirmDiscardConfigChanges()) return status('partnerStatus', 'Tạo bản sao đã hủy; thay đổi thiết lập chưa lưu vẫn được giữ.', 'warn');
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
    if (!confirmDiscardConfigChanges()) return status('partnerStatus', 'Ngừng sử dụng đã hủy; thay đổi thiết lập chưa lưu vẫn được giữ.', 'warn');
    const source = selectedPartner();
    if (!source) return status('partnerStatus', 'Chưa chọn khách/chủ để ngừng sử dụng.', 'err');
    const ok = !global.confirm || global.confirm(`Ngừng sử dụng ${source.name}?\n\nĐối tác sẽ chỉ bị ẩn khỏi danh sách đang dùng. Tin, settlement và lịch sử cũ vẫn được giữ để đối soát.`);
    if (!ok) return;
    try {
      await store.savePartner({ id:source.id, name:source.name, phone:source.phone || '', role:source.role, active:false, created_at:source.created_at });
      await refreshPartners();
      status('partnerStatus', `Đã ngừng sử dụng ${source.name}. Lịch sử cũ vẫn được giữ và có thể khôi phục.`, 'ok');
    } catch (e) { status('partnerStatus', String(e.message || e), 'err'); }
  }

  async function restorePartner() {
    if (!confirmDiscardConfigChanges()) return status('partnerStatus', 'Khôi phục đã hủy; thay đổi thiết lập chưa lưu vẫn được giữ.', 'warn');
    const id = $('inactivePartnerSelect').value;
    const source = inactivePartners.find(p => p.id === id);
    if (!source) return status('partnerStatus', 'Không có khách/chủ đã ngừng sử dụng để khôi phục.', 'warn');
    try {
      const saved = await store.savePartner({ id:source.id, name:source.name, phone:source.phone || '', role:source.role, active:true, created_at:source.created_at });
      await refreshPartners(saved.id);
      status('partnerStatus', `Đã khôi phục ${saved.name}.`, 'ok');
    } catch (e) { status('partnerStatus', String(e.message || e), 'err'); }
  }

  function regionDisplayName(region) {
    return region === 'mn' ? 'Miền Nam' : region === 'mt' ? 'Miền Trung' : region === 'mb' ? 'Miền Bắc' : String(region || '');
  }

  function applyCopiedRates(result) {
    const target = result.target_region;
    for (const [code, row] of Object.entries(result.target_pricing || {})) {
      for (const field of ['commission','win']) {
        const input = document.querySelector(`[data-price-region="${target}"][data-price-code="${code}"][data-price-field="${field}"]`);
        if (input) input.value = row && row[field] != null ? String(row[field]) : '0';
      }
    }
  }

  function copyRatesFromUi() {
    try {
      const result = pricingCopy.copyRates({
        source_region: $('copyRateSource').value,
        target_region: $('copyRateTarget').value,
        pricing: priceInputsToObject()
      });
      applyCopiedRates(result);
      setConfigDirty(true);
      status('copyRatesStatus', `Đã copy tỷ lệ ${regionDisplayName(result.source_region)} → ${regionDisplayName(result.target_region)}. ${result.zeroed_codes ? 'Cách đánh không có tương ứng đã về 0.' : 'Tất cả cách đánh đều có tương ứng.'} Chưa lưu cấu hình.`, 'ok');
    } catch (e) {
      const message = String(e && e.message || e);
      status('copyRatesStatus', message === 'COPY_RATE_SAME_REGION' ? 'Chọn hai miền khác nhau để copy.' : message, 'err');
    }
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
      const regionData = pricing[region] || {};
      input.value = regionData[code] && regionData[code][field] != null ? regionData[code][field] : '0';
    });
  }

  function regionTermsFromForm() {
    return {
      mn: { total_percent:$('mnTotalPercent').value, refund_percent:$('mnRefundPercent').value, dat_hit_mode:$('mnDatMode').value, dax_hit_mode:$('mnDaxMode').value },
      mt: { total_percent:$('mtTotalPercent').value, refund_percent:$('mtRefundPercent').value, dat_hit_mode:$('mtDatMode').value, dax_hit_mode:$('mtDaxMode').value },
      mb: { total_percent:$('mbTotalPercent').value, refund_percent:$('mbRefundPercent').value, dat_hit_mode:'multi_pair' }
    };
  }

  function setRegionTerms(config) {
    const all = config && config.region_terms ? config.region_terms : {};
    const legacyTotal = config && config.total_percent != null ? config.total_percent : '100';
    const legacyRefund = config && config.refund_percent != null ? config.refund_percent : '0';
    const legacyDat = config && config.dat_hit_mode ? config.dat_hit_mode : 'ky_ruoi';
    const legacyDax = config && config.dax_hit_mode ? config.dax_hit_mode : 'multi_pair';
    const pick = (region, field, fallback) => all[region] && all[region][field] != null ? all[region][field] : fallback;
    $('mnTotalPercent').value = pick('mn','total_percent',legacyTotal);
    $('mnRefundPercent').value = pick('mn','refund_percent',legacyRefund);
    $('mnDatMode').value = pick('mn','dat_hit_mode',legacyDat);
    $('mnDaxMode').value = pick('mn','dax_hit_mode',legacyDax);
    $('mtTotalPercent').value = pick('mt','total_percent',legacyTotal);
    $('mtRefundPercent').value = pick('mt','refund_percent',legacyRefund);
    $('mtDatMode').value = pick('mt','dat_hit_mode',legacyDat);
    $('mtDaxMode').value = pick('mt','dax_hit_mode',legacyDax);
    $('mbTotalPercent').value = pick('mb','total_percent',legacyTotal);
    $('mbRefundPercent').value = pick('mb','refund_percent',legacyRefund);
  }

  function resetConfigForm() {
    $('commissionType').value = 'ratio';
    setRegionTerms(null);
    $('allowMbXien').checked = false;
    $('allowUi').checked = false;
    fillPricing(null);
    refreshGateVisuals();
  }

  function configNeedsMtPricing(config) {
    const pricing = config && config.region_pricing || {};
    return Boolean(pricing.mn && !pricing.mt);
  }

  function applyConfig(config) {
    $('commissionType').value = config.commission_type || 'ratio';
    setRegionTerms(config);
    $('allowMbXien').checked = config.mb_xien_234 === true;
    $('allowUi').checked = config.tinh_ui === true;
    fillPricing(config);
    refreshGateVisuals();
  }

  function viDate(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(value || '');
  }

  function setMissingConfigAction(show, text, template, businessDate) {
    const row = $('missingConfigAction');
    const hint = $('missingConfigHint');
    const apply = $('applyConfigForMessageDate');
    pendingConfigTemplate = show && template ? template : null;
    if (row) row.classList.toggle('hidden', !show);
    if (hint) hint.textContent = text || '';
    if (apply) {
      apply.classList.toggle('hidden', !pendingConfigTemplate);
      apply.textContent = pendingConfigTemplate
        ? `Dùng bảng giá ${viDate(pendingConfigTemplate.effective_from_date)} cho ${viDate(businessDate)} & tính`
        : 'Dùng bảng giá gần nhất & tính';
    }
  }

  async function nearestConfigTemplate(partnerId, businessDate) {
    const configs = await store.listConfigsForPartner(partnerId);
    if (!configs.length) return null;
    const sorted = configs.slice().sort((a,b) => String(a.effective_from_date).localeCompare(String(b.effective_from_date)) || Number(a.version || 0) - Number(b.version || 0));
    const future = sorted.filter(c => String(c.effective_from_date) > String(businessDate));
    return future[0] || sorted[sorted.length - 1] || null;
  }

  async function applyNearestConfigForMessageDate() {
    const partnerId = currentPartnerId();
    const businessDate = $('messageDate').value;
    const template = pendingConfigTemplate || await nearestConfigTemplate(partnerId, businessDate);
    if (!partnerId || !businessDate || !template) return prepareConfigForMessageDate();
    const ok = !global.confirm || global.confirm(`Dùng bảng giá đang áp dụng từ ${viDate(template.effective_from_date)} cho ngày ${viDate(businessDate)}?\n\nHệ thống sẽ tạo một phiên bản cấu hình mới từ ngày này rồi tính lại tin đang nhập.`);
    if (!ok) return;
    const input = configCloneInput(template, partnerId);
    input.effective_from_date = businessDate;
    const cfg = await store.saveConfig(input);
    await pipeline.recalculatePartnerFromDate(partnerId, businessDate);
    setMissingConfigAction(false, '', null, businessDate);
    status('messageStatus', `Đã áp dụng bảng giá cho ${viDate(businessDate)}. Đang tính lại tin…`, 'ok');
    return saveMessage();
  }

  async function prepareConfigForMessageDate() {
    const partnerId = currentPartnerId();
    const businessDate = $('messageDate').value;
    if (!partnerId || !businessDate) return;
    $('effectiveDate').value = businessDate;
    const template = await nearestConfigTemplate(partnerId, businessDate);
    if (template) {
      applyConfig(template);
      $('effectiveDate').value = businessDate;
      status('configStatus', `Ngày ${viDate(businessDate)} chưa có thiết lập. Đã nạp bảng giá gần nhất từ ${viDate(template.effective_from_date)} làm mẫu; kiểm tra rồi bấm Lưu cấu hình.`, 'warn');
    } else {
      resetConfigForm();
      $('effectiveDate').value = businessDate;
      status('configStatus', `Chưa có bảng giá nào cho đối tác này. Nhập tỷ lệ rồi bấm Lưu cấu hình từ ${viDate(businessDate)}.`, 'warn');
    }
    const btn = document.querySelector('.nav button[data-pane="config"]');
    if (btn) btn.click();
  }

  async function loadConfigForDate() {
    const partnerId = currentPartnerId();
    if (!partnerId) { resetConfigForm(); return; }
    const date = $('effectiveDate').value || today();
    try {
      const cfg = await store.resolveConfigForDate(partnerId, date);
      applyConfig(cfg);
      loadedConfigPartnerId = partnerId;
      loadedConfigDate = date;
      setConfigDirty(false);
      status('configStatus', configNeedsMtPricing(cfg)
        ? `Cấu hình v${cfg.version} là dữ liệu cũ chưa có bảng giá Miền Trung riêng. MT đang để 0; kiểm tra rồi Lưu cấu hình trước khi tính MT.`
        : `Đang xem cấu hình v${cfg.version} hiệu lực từ ${cfg.effective_from_date}.`, configNeedsMtPricing(cfg) ? 'warn' : 'ok');
    } catch (e) {
      if (String(e.message || e).includes('NO_CONFIG')) {
        const template = await nearestConfigTemplate(partnerId, date);
        if (template) {
          applyConfig(template);
          $('effectiveDate').value = date;
          loadedConfigPartnerId = partnerId;
          loadedConfigDate = date;
          setConfigDirty(false);
          status('configStatus', `Ngày ${viDate(date)} chưa có thiết lập. Đã nạp bảng giá gần nhất từ ${viDate(template.effective_from_date)} làm mẫu; kiểm tra rồi bấm Lưu cấu hình.`, 'warn');
        } else {
          resetConfigForm();
          $('effectiveDate').value = date;
          loadedConfigPartnerId = partnerId;
          loadedConfigDate = date;
          setConfigDirty(false);
          status('configStatus', 'Chưa có bảng giá nào cho đối tác này. Nhập tỷ lệ rồi bấm Lưu cấu hình.', 'warn');
        }
      } else status('configStatus', String(e.message || e), 'err');
    }
  }

  async function saveConfig() {
    const partnerId = currentPartnerId();
    const button = $('saveConfig');
    if (!partnerId) return status('configStatus', 'Chưa chọn đối tác.', 'err');
    const effective = $('effectiveDate').value;
    if (!effective) return status('configStatus', 'Chọn ngày bắt đầu áp dụng.', 'err');
    if (savingConfig) return status('configStatus', 'Cấu hình trước đang được lưu. Vui lòng chờ hoàn tất.', 'warn');
    savingConfig = true;
    const originalLabel = button ? button.textContent : '';
    const saveDraftSignature = configEditorSignature();
    const savePartnerName = selectedPartner() ? selectedPartner().name : partnerId;
    if (button) { button.disabled = true; button.textContent = 'Đang lưu…'; }
    try {
      const checked = configValidation.validate({
        commission_type: $('commissionType').value,
        region_terms: regionTermsFromForm(),
        region_pricing: priceInputsToObject()
      });
      const terms = checked.region_terms;
      const cfg = await store.saveConfig({
        partner_id: partnerId,
        effective_from_date: effective,
        commission_type: checked.commission_type,
        region_terms: terms,
        total_percent: terms.mn.total_percent,
        refund_percent: terms.mn.refund_percent,
        dat_hit_mode: terms.mn.dat_hit_mode,
        dax_hit_mode: terms.mn.dax_hit_mode,
        mb_xien_234: $('allowMbXien').checked,
        tinh_ui: $('allowUi').checked,
        region_pricing: checked.region_pricing
      });
      const recalculated = await pipeline.recalculatePartnerFromDate(partnerId, effective);
      const sameConfigView =
        currentPartnerId() === partnerId &&
        String($('effectiveDate').value || '') === effective &&
        configEditorSignature() === saveDraftSignature;
      if (sameConfigView) {
        loadedConfigPartnerId = partnerId;
        loadedConfigDate = effective;
        setConfigDirty(false);
      }
      status('configStatus',
        `Đã lưu v${cfg.version} cho ${savePartnerName}, áp dụng từ ${cfg.effective_from_date}. Ngày trước giữ rule cũ · đã rà lại ${recalculated.length} phạm vi có tin.${sameConfigView ? '' : ' Bạn đã đổi đối tác/ngày hoặc sửa tiếp; màn hình hiện tại không bị đánh dấu đã lưu.'}`,
        sameConfigView ? 'ok' : 'warn');
    } catch (e) {
      status('configStatus', String(e.message || e), 'err');
    } finally {
      savingConfig = false;
      if (button) { button.disabled = false; button.textContent = originalLabel || 'Lưu cấu hình từ ngày đã chọn'; }
    }
  }

  function renderParsedPreview(message) {
    const host = $('messageParsedPreview');
    if (!host) return;
    if (!message || !message.canonical_payload) { host.innerHTML = ''; host.classList.add('hidden'); return; }
    const history = global.KTS_SETTLEMENT_MESSAGE_HISTORY;
    let summary = '';
    if (history && typeof history.canonicalSummary === 'function') summary = history.canonicalSummary(message);
    if (!summary) {
      const legs = Array.isArray(message.canonical_payload.legs) ? message.canonical_payload.legs : [];
      summary = legs.map(leg => {
        const stations = Array.isArray(leg.station_codes) && leg.station_codes.length ? leg.station_codes.join('+').toUpperCase() + ' · ' : '';
        const values = Array.isArray(leg.values) ? leg.values.join(' ') : '';
        return `${stations}${values} ${String(leg.code || '')} · ${String(leg.stake || '')}n`;
      }).filter(Boolean).join(' | ');
    }
    host.innerHTML = summary ? `<b>Hệ thống đã đọc:</b> ${esc(summary)}` : '';
    host.classList.toggle('hidden', !summary);
  }

  async function saveMessage() {
    const partnerId = currentPartnerId();
    const raw = $('messageText').value.trim();
    const button = $('saveMessage');
    if (!partnerId) return status('messageStatus', 'Chưa chọn đối tác.', 'err');
    if (!raw) return status('messageStatus', 'Chưa có tin.', 'err');
    if (savingMessage) return status('messageStatus', 'Tin trước đang được lưu. Chờ hoàn tất để tránh gửi trùng.', 'warn');

    const businessDate = $('messageDate').value;
    const region = String($('messageRegion').value || '').toLowerCase();
    const saveScope = Object.freeze({ partner_id: partnerId, business_date: businessDate, region });
    const sameSaveScope = () =>
      currentPartnerId() === saveScope.partner_id &&
      String($('messageDate').value || '') === saveScope.business_date &&
      String($('messageRegion').value || '').toLowerCase() === saveScope.region;
    try {
      await store.resolveConfigForDate(partnerId, businessDate);
      setMissingConfigAction(false, '', null, businessDate);
    } catch (e) {
      if (String(e.message || e).includes('NO_CONFIG')) {
        const template = await nearestConfigTemplate(partnerId, businessDate);
        setMissingConfigAction(true, template
          ? `Có bảng giá từ ${viDate(template.effective_from_date)}. Bạn có thể áp dụng cho ngày ${viDate(businessDate)} rồi tính ngay.`
          : 'Đối tác này chưa có bảng giá nào.', template, businessDate);
        status('messageStatus', `Chưa có thiết lập giá áp dụng cho ${viDate(businessDate)}. Tin chưa được lưu để tránh tính sai.`, 'warn');
        return null;
      }
      status('messageStatus', 'Không kiểm tra được thiết lập giá. Vui lòng thử lại.', 'err');
      return null;
    }

    savingMessage = true;
    const originalLabel = button ? button.textContent : '';
    if (button) { button.disabled = true; button.textContent = 'Đang lưu…'; }
    renderParsedPreview(null);
    status('messageStatus', 'Đang đọc cú pháp…', '');
    const slowParserNotice = global.setTimeout ? global.setTimeout(() => {
      if (savingMessage) status('messageStatus', 'Máy chủ đang khởi động/kết nối · vẫn tiếp tục đọc tin, không cần bấm Lưu lần nữa.', 'warn');
    }, 3000) : null;
    try {
      const outcome = await pipeline.parseAndSaveMessage({
        partner_id: partnerId,
        business_date: saveScope.business_date,
        region: saveScope.region,
        raw_text: raw,
        parser_provider: parserProvider
      });
      if (outcome.status === 'parser_error') {
        renderParsedPreview(null);
        status('messageStatus', `${friendlyParserError(outcome.error)} Tin lỗi được giữ trong lịch sử để kiểm tra và đang chặn phạm vi cho đến khi hủy/sửa.`, 'err');
        return outcome;
      }

      const editorStillMatches = sameSaveScope() && String($('messageText').value || '').trim() === raw;
      if (editorStillMatches) renderParsedPreview(outcome.message);
      else renderParsedPreview(null);

      // Start automatic KQXS tracking only after a canonical message is durable.
      // Missing config / parser errors never create a background polling job.
      if (typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') {
        global.dispatchEvent(new global.CustomEvent('kts:settlement-message-saved', { detail: {
          message_id: outcome.message && outcome.message.id,
          scope: { business_date: saveScope.business_date, region: saveScope.region }
        }}));
      }

      // Canonical message was accepted and is already durable. Clear the editor
      // so a fast second tap cannot accidentally create another identical bet.
      // Intentionally retyping/pasting the same line after this completes still
      // creates a new message, because identical real bets are valid business data.
      if (editorStillMatches) {
        $('messageText').value = '';
        $('messageText').focus();
      }

      if (outcome.status === 'parsed_waiting_result') {
        status('messageStatus', `Đã parse tin ${outcome.message.id} cho ${saveScope.region.toUpperCase()} ${viDate(saveScope.business_date)}. Chờ KQXS trước khi tính tiền.${editorStillMatches ? '' : ' Bạn đã đổi phạm vi hoặc ô nhập; nội dung hiện tại được giữ nguyên.'}`, 'warn');
        return outcome;
      }
      if (outcome.status === 'blocked') {
        const reason = outcome.settlement && outcome.settlement.reason ? String(outcome.settlement.reason) : '';
        status('messageStatus', reason.includes('NO_CONFIG') ? 'Thiếu thiết lập giá cho ngày này. Mở Thiết lập để kiểm tra.' : 'Tin chưa thể tính. Kiểm tra phần cảnh báo bên dưới.', 'err');
        return outcome;
      }
      status('messageStatus', `Đã lưu + tính tin ${outcome.message.id} cho ${saveScope.region.toUpperCase()} ${viDate(saveScope.business_date)} · ${outcome.status === 'provisional' ? 'TẠM TÍNH' : 'chờ đối chiếu HIOSKT'}.${editorStillMatches ? '' : ' Bạn đã đổi phạm vi hoặc ô nhập; nội dung hiện tại được giữ nguyên.'}`, outcome.status === 'provisional' ? 'warn' : 'ok');
      return outcome;
    } catch (e) {
      status('messageStatus', String(e.message || e), 'err');
      return null;
    } finally {
      if (slowParserNotice != null && global.clearTimeout) global.clearTimeout(slowParserNotice);
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
    const partner = partners.concat(inactivePartners).find(p => p.id === partnerId) || { id: partnerId };
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
    const configPane = $('pane-config');
    if (configPane) {
      for (const eventName of ['input','change']) configPane.addEventListener(eventName, event => {
        if (isConfigEditableControl(event.target)) setConfigDirty(true);
      });
    }
    $('partnerSelect').addEventListener('change', async () => {
      const next = currentPartnerId();
      if (loadedConfigPartnerId && next !== loadedConfigPartnerId && !confirmDiscardConfigChanges()) {
        $('partnerSelect').value = loadedConfigPartnerId;
        updatePartnerView();
        return;
      }
      setConfigDirty(false);
      updatePartnerView();
      $('reportPartner').value = currentPartnerId();
      await loadConfigForDate();
    });
    $('effectiveDate').addEventListener('change', async () => {
      const nextDate = $('effectiveDate').value;
      if (loadedConfigDate && nextDate !== loadedConfigDate && !confirmDiscardConfigChanges()) {
        $('effectiveDate').value = loadedConfigDate;
        return;
      }
      setConfigDirty(false);
      await loadConfigForDate();
    });
    $('addPartner').addEventListener('click', addPartner);
    $('copyPartner').addEventListener('click', copyPartner);
    $('deactivatePartner').addEventListener('click', deactivatePartner);
    $('restorePartner').addEventListener('click', restorePartner);
    $('copyRates').addEventListener('click', copyRatesFromUi);
    $('saveConfig').addEventListener('click', saveConfig);
    $('saveMessage').addEventListener('click', saveMessage);
    $('messageText').addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        saveMessage();
      }
    });
    $('clearMessage').addEventListener('click', () => { $('messageText').value = ''; status('messageStatus', '', ''); setMissingConfigAction(false, ''); });
    $('applyConfigForMessageDate').addEventListener('click', () => { applyNearestConfigForMessageDate().catch(e => status('messageStatus', 'Không áp dụng được bảng giá. Vui lòng mở Thiết lập để kiểm tra.', 'err')); });
    $('openConfigForMessageDate').addEventListener('click', () => { prepareConfigForMessageDate().catch(e => status('messageStatus', String(e.message || e), 'err')); });
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
