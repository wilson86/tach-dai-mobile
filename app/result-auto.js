(function (global) {
  'use strict';

  function validScope(scope) {
    return Boolean(scope && /^\d{4}-\d{2}-\d{2}$/.test(String(scope.business_date || '')) && ['mn','mt','mb'].includes(String(scope.region || '').toLowerCase()));
  }
  function localToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function scopeKey(scope) { return `${scope.business_date}:${String(scope.region).toLowerCase()}`; }
  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
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

    function renderSnapshot(snapshot) {
      if (!snapshot || !snapshot.business_date || !snapshot.region) return;
      const date = doc.getElementById('resultDate');
      const region = doc.getElementById('resultRegion');
      const table = doc.getElementById('resultTable');
      if (!date || !region || !table) return;
      if (date.value !== snapshot.business_date || String(region.value).toLowerCase() !== String(snapshot.region).toLowerCase()) return;

      const verified = snapshot.verified === true || snapshot.verification_status === 'verified';
      const badge = verified
        ? '<span class="tag ok">ĐÃ XÁC MINH</span>'
        : snapshot.complete
          ? '<span class="tag warn">ĐÃ ĐỦ KQ · CHỜ ĐỐI CHIẾU</span>'
          : '<span class="tag warn">TẠM TÍNH</span>';
      const parts = [`<div class="row" style="justify-content:space-between"><div>${badge} <span class="hint">${esc(snapshot.source)} · ${esc(snapshot.fetched_at)}</span></div></div>`];
      const order = snapshot.region === 'mb' ? ['DB','G1','G2','G3','G4','G5','G6','G7'] : ['G8','G7','G6','G5','G4','G3','G2','G1','DB'];
      for (const station of (snapshot.stations || [])) {
        parts.push(`<h3 style="margin:12px 0 4px">${esc(station.name || station.code)}</h3><table><thead><tr><th>Giải</th><th>Kết quả</th></tr></thead><tbody>`);
        for (const prize of order) parts.push(`<tr><td><b>${prize}</b></td><td>${esc(((station.prizes || {})[prize] || []).join(' · '))}</td></tr>`);
        parts.push('</tbody></table>');
      }
      table.innerHTML = parts.join('');
    }

    async function renderStoredSelected() {
      const date = doc.getElementById('resultDate');
      const region = doc.getElementById('resultRegion');
      if (!date || !region || !date.value || !region.value) return;
      const snapshot = await store.get(store.STORES.results, `${date.value}:${String(region.value).toLowerCase()}`);
      if (snapshot) renderSnapshot(snapshot);
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
      });
      global.addEventListener('kts:auto-result-update', event => {
        const detail = event.detail || {};
        if (detail.snapshot) renderSnapshot(detail.snapshot);
      });
      global.addEventListener('kts:auto-result-error', event => {
        const detail = event.detail || {};
        setAutoStatus(`KQXS đã lưu nhưng tính lại settlement lỗi: ${detail.error || 'UNKNOWN'}`, 'err');
      });
      global.addEventListener('beforeunload', () => manager.stopAll());
    }

    const resultDate = doc.getElementById('resultDate');
    const resultRegion = doc.getElementById('resultRegion');
    if (resultDate) resultDate.addEventListener('change', () => renderStoredSelected().catch(() => {}));
    if (resultRegion) resultRegion.addEventListener('change', () => renderStoredSelected().catch(() => {}));
    for (const button of doc.querySelectorAll('.nav button[data-pane="result"]')) {
      button.addEventListener('click', () => renderStoredSelected().catch(() => {}));
    }
  }

  global.KTS_RESULT_AUTO = Object.freeze({ version: 'result-auto-v3', createManager, validScope });
  if (global.document && global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})(typeof window !== 'undefined' ? window : globalThis);
