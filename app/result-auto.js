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
          Promise.resolve(pipeline.recalculateDateRegion({
            business_date: snapshot.business_date,
            region: snapshot.region,
            result_snapshot: snapshot
          })).then(rows => emit('kts:auto-result-update', { snapshot, meta, rows })).catch(error => emit('kts:auto-result-error', { scope, error: String(error && error.message || error) }));
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

    const save = doc.getElementById('saveMessage');
    if (save) save.addEventListener('click', () => {
      const date = doc.getElementById('messageDate');
      const region = doc.getElementById('messageRegion');
      if (!date || !region || !date.value || !region.value) return;
      manager.ensureScope({ business_date: date.value, region: region.value }).catch(error => {
        if (typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') {
          global.dispatchEvent(new global.CustomEvent('kts:auto-result-error', { detail: { scope: { business_date: date.value, region: region.value }, error: String(error && error.message || error) } }));
        }
      });
    });

    if (typeof global.addEventListener === 'function') global.addEventListener('beforeunload', () => manager.stopAll());
  }

  global.KTS_RESULT_AUTO = Object.freeze({ version: 'result-auto-v1', createManager, validScope });
  if (global.document && global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})(typeof window !== 'undefined' ? window : globalThis);
