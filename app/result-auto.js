(function (global) {
  'use strict';

  const VIEW_MODE_KEY = 'kts_kqxs_view_mode_v1';

  function validScope(scope) {
    return Boolean(scope && /^\d{4}-\d{2}-\d{2}$/.test(String(scope.business_date || '')) && ['mn','mt','mb'].includes(String(scope.region || '').toLowerCase()));
  }
  function localToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function scopeKey(scope) { return `${scope.business_date}:${String(scope.region).toLowerCase()}`; }
  function sameScope(a, b) {
    return Boolean(a && b && String(a.business_date) === String(b.business_date) && String(a.region).toLowerCase() === String(b.region).toLowerCase());
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }
  function normalizeViewMode(value) { return value === 'date' ? 'date' : 'realtime'; }
  function readViewMode() {
    try { return normalizeViewMode(global.localStorage && global.localStorage.getItem(VIEW_MODE_KEY)); }
    catch (_) { return 'realtime'; }
  }
  function writeViewMode(value) {
    const mode = normalizeViewMode(value);
    try { if (global.localStorage) global.localStorage.setItem(VIEW_MODE_KEY, mode); } catch (_) {}
    return mode;
  }

  function createManager(options) {
    const o = options || {};
    const resultService = o.resultService;
    const provider = o.provider;
    const store = o.store;
    const pipeline = o.pipeline;
    const intervalMs = Number(o.intervalMs || 90000);
    const today = typeof o.today === 'function' ? o.today : localToday;
    if (!resultService || typeof resultService.createPoller !== 'function') throw new Error('AUTO_RESULT_SERVICE_REQUIRED');
    if (!provider || typeof provider.fetchSnapshot !== 'function') throw new Error('AUTO_RESULT_PROVIDER_REQUIRED');
    if (!store || typeof store.saveResultSnapshot !== 'function') throw new Error('AUTO_RESULT_STORE_REQUIRED');
    if (!pipeline || typeof pipeline.recalculateDateRegion !== 'function') throw new Error('AUTO_RESULT_PIPELINE_REQUIRED');

    const jobs = new Map();

    function emit(name, detail) {
      if (typeof global.dispatchEvent !== 'function' || typeof global.CustomEvent !== 'function') return;
      try { global.dispatchEvent(new global.CustomEvent(name, { detail })); } catch (_) {}
    }

    async function ensureScope(input) {
      const scope = { business_date: String(input && input.business_date || ''), region: String(input && input.region || '').toLowerCase() };
      if (!validScope(scope)) throw new Error('AUTO_RESULT_SCOPE_REQUIRED');
      const key = scopeKey(scope);
      const existing = jobs.get(key);
      if (existing && existing.poller.getState().running) return existing.poller.getState();

      const confirmations = scope.business_date === today() ? 3 : 1;
      const poller = resultService.createPoller({
        fetchSnapshot: provider.fetchSnapshot,
        store,
        intervalMs,
        completeConfirmations: confirmations,
        onUpdate: (snapshot, meta) => {
          emit('kts:auto-result-update', { snapshot, meta, rows: null });
          Promise.resolve(pipeline.recalculateDateRegion({
            business_date: snapshot.business_date,
            region: snapshot.region,
            result_snapshot: snapshot
          })).then(rows => emit('kts:auto-result-recalculated', { snapshot, meta, rows })).catch(error => emit('kts:auto-result-error', { scope, error: String(error && error.message || error) }));
        },
        onStatus: info => emit('kts:auto-result-status', info)
      });
      jobs.set(key, { scope, poller });
      await poller.start(scope);
      return poller.getState();
    }

    function stopScope(input) {
      if (!validScope(input)) return false;
      const key = scopeKey(input);
      const job = jobs.get(key);
      if (!job) return false;
      job.poller.stop();
      jobs.delete(key);
      return true;
    }

    function stopAll() {
      for (const job of jobs.values()) job.poller.stop();
      jobs.clear();
    }

    function states() {
      return [...jobs.values()].map(job => ({ scope: Object.assign({}, job.scope), state: job.poller.getState() }));
    }

    return Object.freeze({ ensureScope, stopScope, stopAll, states });
  }

  function install() {
    const doc = global.document;
    const resultService = global.KTS_RESULT_SERVICE;
    const provider = global.KTS_RESULT_PROVIDER;
    const store = global.KTS_SETTLEMENT_STORE;
    const pipeline = global.KTS_SETTLEMENT_PIPELINE;
    if (!doc || !resultService || !provider || !store || !pipeline) return;
    if (global.KTS_RESULT_AUTO_MANAGER) return;

    const manager = createManager({ resultService, provider, store, pipeline, intervalMs: 90000 });
    global.KTS_RESULT_AUTO_MANAGER = manager;

    const messageStatus = doc.getElementById('messageStatus');
    let autoStatus = doc.getElementById('autoResultStatus');
    if (!autoStatus && messageStatus) {
      autoStatus = doc.createElement('div');
      autoStatus.id = 'autoResultStatus';
      autoStatus.className = 'status';
      messageStatus.insertAdjacentElement('afterend', autoStatus);
    }

    function setAutoStatus(text, kind) {
      if (!autoStatus) return;
      autoStatus.textContent = text || '';
      autoStatus.className = 'status ' + (kind || '');
    }

    function setResultStatus(text, kind) {
      const el = doc.getElementById('resultStatus');
      if (!el) return;
      el.textContent = text || '';
      el.className = 'status ' + (kind || '');
    }

    function currentScope() {
      const date = doc.getElementById('resultDate');
      const region = doc.getElementById('resultRegion');
      return { business_date: date ? String(date.value || '') : '', region: region ? String(region.value || '').toLowerCase() : '' };
    }

    function currentViewMode() {
      const select = doc.getElementById('resultViewMode');
      return normalizeViewMode(select ? select.value : readViewMode());
    }

    function renderSnapshot(snapshot, meta) {
      if (!snapshot || !snapshot.business_date || !snapshot.region) return;
      const scope = currentScope();
      const table = doc.getElementById('resultTable');
      if (!table || !sameScope(scope, snapshot)) return;

      const verified = snapshot.verified === true || snapshot.verification_status === 'verified';
      const badge = verified
        ? '<span class="tag ok">ĐÃ XÁC MINH</span>'
        : snapshot.complete
          ? '<span class="tag warn">ĐÃ ĐỦ KQ · CHỜ ĐỐI CHIẾU</span>'
          : '<span class="tag warn">TẠM TÍNH</span>';
      const modeBadge = currentViewMode() === 'realtime' ? '<span class="tag">THỜI GIAN THẬT</span>' : `<span class="tag">NGÀY ${esc(snapshot.business_date)}</span>`;
      const parts = [`<div class="row" style="justify-content:space-between"><div>${badge} ${modeBadge} <span class="hint">${esc(snapshot.source)} · ${esc(snapshot.fetched_at)}</span></div></div>`];
      const order = snapshot.region === 'mb' ? ['DB','G1','G2','G3','G4','G5','G6','G7'] : ['G8','G7','G6','G5','G4','G3','G2','G1','DB'];
      for (const station of (snapshot.stations || [])) {
        parts.push(`<h3 style="margin:12px 0 4px">${esc(station.name || station.code)}</h3><table><thead><tr><th>Giải</th><th>Kết quả</th></tr></thead><tbody>`);
        for (const prize of order) parts.push(`<tr><td><b>${prize}</b></td><td>${esc(((station.prizes || {})[prize] || []).join(' · '))}</td></tr>`);
        parts.push('</tbody></table>');
      }
      if (meta && meta.changed && meta.previous) parts.push('<div class="status warn">Nguồn KQXS vừa thay đổi so với snapshot trước. Đã lưu lịch sử sửa và tính lại settlement liên quan.</div>');
      table.innerHTML = parts.join('');
    }

    async function renderStoredSelected(options) {
      const o = options || {};
      const scope = currentScope();
      const table = doc.getElementById('resultTable');
      if (!validScope(scope)) return null;
      const snapshot = await store.get(store.STORES.results, scopeKey(scope));
      if (snapshot) {
        renderSnapshot(snapshot, { cached: true });
        if (o.status !== false) {
          const label = snapshot.complete ? 'Đã nạp KQXS đã lưu.' : 'Đã nạp snapshot KQXS tạm đã lưu.';
          setResultStatus(`${label} ${scope.region.toUpperCase()} ${scope.business_date}.`, snapshot.complete ? 'ok' : 'warn');
        }
        return snapshot;
      }
      if (table) table.innerHTML = '<div class="hint">Chưa có dữ liệu cho ngày/miền này.</div>';
      if (o.status !== false) setResultStatus(`Chưa có KQXS đã lưu cho ${scope.region.toUpperCase()} ${scope.business_date}.`, 'warn');
      return null;
    }

    async function hasMessagesForScope(scope) {
      if (!validScope(scope)) return false;
      const all = await store.getAll(store.STORES.messages);
      return all.some(m => String(m.business_date) === scope.business_date && String(m.region || '').toLowerCase() === scope.region);
    }

    let realtimeDisplayActive = false;
    let realtimeViewScope = null;

    async function releaseViewScope(scope) {
      if (!validScope(scope)) return;
      try {
        if (!(await hasMessagesForScope(scope))) manager.stopScope(scope);
      } catch (_) {}
    }

    async function startRealtimeView() {
      const date = doc.getElementById('resultDate');
      if (date) date.value = localToday();
      const next = currentScope();
      if (!validScope(next)) return setResultStatus('Chưa chọn đủ ngày/miền KQXS.', 'err');
      const previous = realtimeViewScope;
      realtimeViewScope = Object.assign({}, next);
      realtimeDisplayActive = true;
      if (previous && !sameScope(previous, next)) await releaseViewScope(previous);
      await renderStoredSelected({ status: false });
      setResultStatus(`THỜI GIAN THẬT · ${next.region.toUpperCase()} ${next.business_date} · tự cập nhật 90 giây/lần.`, 'warn');
      try { await manager.ensureScope(next); }
      catch (error) { setResultStatus(`Không bắt đầu được KQXS thời gian thật: ${String(error && error.message || error)}`, 'err'); }
    }

    async function stopRealtimeView() {
      const scope = realtimeViewScope || currentScope();
      realtimeDisplayActive = false;
      realtimeViewScope = null;
      const keepBackground = await hasMessagesForScope(scope).catch(() => false);
      if (!keepBackground) manager.stopScope(scope);
      setResultStatus(keepBackground
        ? 'Đã dừng hiển thị thời gian thật. Theo dõi nền vẫn chạy vì còn tin settlement dùng KQXS này.'
        : 'Đã dừng theo dõi KQXS thời gian thật.', '');
    }

    async function fetchSelectedDateOnce() {
      const scope = currentScope();
      if (!validScope(scope)) return setResultStatus('Chưa chọn đủ ngày/miền KQXS.', 'err');
      realtimeDisplayActive = false;
      setResultStatus(`Đang tải KQXS ${scope.region.toUpperCase()} ${scope.business_date} một lần…`, '');
      try {
        const raw = await provider.fetchSnapshot(scope);
        const snapshot = resultService.normalizeSnapshot(Object.assign({}, raw, scope));
        const saved = await store.saveResultSnapshot(snapshot);
        renderSnapshot(saved.snapshot || snapshot, saved);
        const rows = await pipeline.recalculateDateRegion({
          business_date: snapshot.business_date,
          region: snapshot.region,
          result_snapshot: saved.snapshot || snapshot
        });
        const blocked = rows.filter(x => x && x.status === 'blocked').length;
        if (snapshot.complete) {
          setResultStatus(`Theo ngày chọn · đã tải đủ KQXS ${scope.region.toUpperCase()} ${scope.business_date}. ${rows.length} phạm vi settlement đã rà lại${blocked ? ` · ${blocked} đang fail-closed` : ''}.`, blocked ? 'warn' : 'ok');
        } else {
          setResultStatus(`Theo ngày chọn · snapshot này chưa đủ giải. Không tự polling; bấm “Tải ngày đã chọn” để kiểm tra lại.`, 'warn');
        }
      } catch (error) {
        await renderStoredSelected({ status: false }).catch(() => {});
        setResultStatus(`Không tải được KQXS ngày chọn: ${String(error && error.message || error)}. Nếu có snapshot cũ thì vẫn giữ nguyên.`, 'err');
      }
    }

    function installViewModeUi() {
      const pane = doc.getElementById('pane-result');
      const date = doc.getElementById('resultDate');
      const region = doc.getElementById('resultRegion');
      const start = doc.getElementById('startResults');
      const stop = doc.getElementById('stopResults');
      if (!pane || !date || !region || !start || !stop) return;

      let selector = doc.getElementById('resultViewMode');
      if (!selector) {
        const card = pane.querySelector('.card');
        const controls = card && card.querySelector('.grid3');
        if (card && controls) {
          const wrap = doc.createElement('div');
          wrap.className = 'grid';
          wrap.id = 'resultViewChooser';
          wrap.style.marginBottom = '8px';
          wrap.innerHTML = '<div><label>Hiển thị KQXS</label><select id="resultViewMode"><option value="realtime">Thời gian thật</option><option value="date">Theo ngày chọn</option></select></div><div><label>Chế độ</label><input id="resultViewModeInfo" readonly></div>';
          card.insertBefore(wrap, controls);
          selector = doc.getElementById('resultViewMode');
        }
      }
      if (!selector) return;
      selector.value = readViewMode();

      const cycle = pane.querySelector('.grid3 input[readonly]');
      const info = doc.getElementById('resultViewModeInfo');

      async function applyMode(startNow) {
        const mode = writeViewMode(selector.value);
        selector.value = mode;
        if (mode === 'realtime') {
          date.value = localToday();
          date.disabled = true;
          start.textContent = 'Theo dõi thời gian thật';
          stop.disabled = false;
          if (cycle) cycle.value = '90 giây';
          if (info) info.value = 'Hôm nay · tự cập nhật';
          if (startNow) await startRealtimeView();
          else await renderStoredSelected({ status: false });
        } else {
          const previous = realtimeViewScope;
          realtimeDisplayActive = false;
          realtimeViewScope = null;
          if (previous) await releaseViewScope(previous);
          date.disabled = false;
          start.textContent = 'Tải ngày đã chọn';
          stop.disabled = true;
          if (cycle) cycle.value = '1 lần / yêu cầu';
          if (info) info.value = 'Lịch sử · chọn ngày';
          await renderStoredSelected();
        }
      }

      selector.addEventListener('change', () => applyMode(true).catch(error => setResultStatus(String(error && error.message || error), 'err')));
      date.addEventListener('change', () => {
        if (currentViewMode() === 'date') renderStoredSelected().catch(() => {});
      });
      region.addEventListener('change', () => {
        if (currentViewMode() === 'realtime') startRealtimeView().catch(() => {});
        else renderStoredSelected().catch(() => {});
      });

      start.addEventListener('click', event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (currentViewMode() === 'realtime') startRealtimeView().catch(error => setResultStatus(String(error && error.message || error), 'err'));
        else fetchSelectedDateOnce().catch(error => setResultStatus(String(error && error.message || error), 'err'));
      }, true);
      stop.addEventListener('click', event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (currentViewMode() === 'realtime') stopRealtimeView().catch(() => {});
      }, true);

      for (const button of doc.querySelectorAll('.nav button[data-pane="result"]')) {
        button.addEventListener('click', () => {
          if (currentViewMode() === 'realtime') startRealtimeView().catch(() => {});
          else renderStoredSelected().catch(() => {});
        });
      }

      applyMode(false).catch(() => {});
    }

    const save = doc.getElementById('saveMessage');
    if (save) save.addEventListener('click', () => {
      const date = doc.getElementById('messageDate');
      const region = doc.getElementById('messageRegion');
      const raw = doc.getElementById('messageText');
      const partner = doc.getElementById('partnerSelect');
      if (!date || !region || !date.value || !region.value || !raw || !raw.value.trim() || !partner || !partner.value) return;
      setAutoStatus(`KQXS ${String(region.value).toUpperCase()} ${date.value}: đang tự theo dõi 90 giây/lần…`, 'warn');
      manager.ensureScope({ business_date: date.value, region: region.value }).catch(error => {
        if (typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') {
          global.dispatchEvent(new global.CustomEvent('kts:auto-result-error', { detail: { scope: { business_date: date.value, region: region.value }, error: String(error && error.message || error) } }));
        }
      });
    });

    if (typeof global.addEventListener === 'function') {
      global.addEventListener('kts:auto-result-status', event => {
        const info = event.detail || {};
        const scope = info.scope || {};
        const label = `${String(scope.region || '').toUpperCase()} ${scope.business_date || ''}`.trim();
        if (info.state === 'fetching') setAutoStatus(`KQXS ${label}: đang cập nhật…`, '');
        else if (info.state === 'waiting') setAutoStatus(`KQXS ${label}: chưa đủ giải · tự kiểm tra lại sau 90 giây.`, 'warn');
        else if (info.state === 'complete_waiting_confirmation') setAutoStatus(`KQXS ${label}: đã đủ giải lần ${info.complete_confirmations}/${info.complete_confirmations_required} · đang xác nhận lại để bắt sửa kết quả.`, 'warn');
        else if (info.state === 'complete') setAutoStatus(`KQXS ${label}: đã đủ và ổn định qua ${info.complete_confirmations || 1} lần lấy · chờ đối chiếu độc lập.`, 'ok');
        else if (info.state === 'verified') setAutoStatus(`KQXS ${label}: đã xác minh.`, 'ok');
        else if (info.state === 'error') setAutoStatus(`KQXS ${label}: lỗi ${info.error} · giữ dữ liệu gần nhất và sẽ thử lại.`, 'err');

        if (currentViewMode() === 'realtime' && realtimeDisplayActive && sameScope(scope, currentScope())) {
          if (info.state === 'fetching') setResultStatus('THỜI GIAN THẬT · đang lấy KQXS…', '');
          else if (info.state === 'waiting') setResultStatus('THỜI GIAN THẬT · chưa đủ giải · tự kiểm tra lại sau 90 giây.', 'warn');
          else if (info.state === 'complete_waiting_confirmation') setResultStatus(`THỜI GIAN THẬT · đủ giải lần ${info.complete_confirmations}/${info.complete_confirmations_required} · đang xác nhận lại.`, 'warn');
          else if (info.state === 'complete') setResultStatus('THỜI GIAN THẬT · kết quả đã đủ và ổn định · chờ đối chiếu độc lập.', 'ok');
          else if (info.state === 'verified') setResultStatus('THỜI GIAN THẬT · kết quả đã xác minh.', 'ok');
          else if (info.state === 'error') setResultStatus(`THỜI GIAN THẬT · lỗi ${info.error} · giữ snapshot gần nhất.`, 'err');
        }
      });
      global.addEventListener('kts:auto-result-update', event => {
        const detail = event.detail || {};
        if (!detail.snapshot) return;
        if (currentViewMode() === 'date' || (realtimeDisplayActive && sameScope(detail.snapshot, currentScope()))) renderSnapshot(detail.snapshot, detail.meta || {});
      });
      global.addEventListener('kts:auto-result-error', event => {
        const detail = event.detail || {};
        setAutoStatus(`KQXS đã lưu nhưng tính lại settlement lỗi: ${detail.error || 'UNKNOWN'}`, 'err');
      });
      global.addEventListener('beforeunload', () => manager.stopAll());
    }

    installViewModeUi();
  }

  global.KTS_RESULT_AUTO = Object.freeze({
    version: 'result-auto-v4',
    VIEW_MODE_KEY,
    createManager,
    validScope,
    normalizeViewMode
  });
  if (global.document && global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})(typeof window !== 'undefined' ? window : globalThis);