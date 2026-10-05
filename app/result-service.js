(function (global) {
  'use strict';

  const DEFAULT_INTERVAL_MS = 90000;

  const PRIZE_COUNTS = Object.freeze({
    mn: Object.freeze({ G8: 1, G7: 1, G6: 3, G5: 1, G4: 7, G3: 2, G2: 1, G1: 1, DB: 1 }),
    mt: Object.freeze({ G8: 1, G7: 1, G6: 3, G5: 1, G4: 7, G3: 2, G2: 1, G1: 1, DB: 1 }),
    mb: Object.freeze({ G7: 4, G6: 3, G5: 6, G4: 4, G3: 6, G2: 2, G1: 1, DB: 1 })
  });

  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function nowIso() { return new Date().toISOString(); }
  function validDateOnly(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')); }

  function stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
  }

  function normalizePrizeMap(prizes) {
    const out = {};
    for (const [key, values] of Object.entries(prizes || {})) {
      out[String(key).toUpperCase()] = (Array.isArray(values) ? values : [values])
        .filter(v => v != null && String(v).trim() !== '')
        .map(v => String(v).trim());
    }
    return out;
  }

  function stationComplete(region, station) {
    const expected = PRIZE_COUNTS[region];
    if (!expected) throw new Error('INVALID_REGION:' + region);
    const prizes = normalizePrizeMap(station && station.prizes);
    return Object.entries(expected).every(([prize, count]) => (prizes[prize] || []).length === count);
  }

  function normalizeStation(region, station) {
    if (!station || !station.code) throw new Error('RESULT_STATION_CODE_REQUIRED');
    const prizes = normalizePrizeMap(station.prizes);
    const complete = station.complete == null ? stationComplete(region, { prizes }) : Boolean(station.complete);
    return {
      code: String(station.code).toLowerCase(),
      name: String(station.name || station.code),
      prizes,
      complete
    };
  }

  function normalizeSnapshot(input) {
    const businessDate = String(input && input.business_date || '').slice(0, 10);
    const region = String(input && input.region || '').toLowerCase();
    if (!validDateOnly(businessDate)) throw new Error('RESULT_DATE_REQUIRED');
    if (!PRIZE_COUNTS[region]) throw new Error('RESULT_REGION_REQUIRED');
    const stations = (input.stations || []).map(s => normalizeStation(region, s));
    if (!stations.length) throw new Error('RESULT_STATIONS_REQUIRED');
    const complete = stations.every(s => s.complete);
    const status = complete ? 'complete' : 'partial';
    const core = { business_date: businessDate, region, stations, complete, status };
    return {
      id: input.id || `${businessDate}:${region}`,
      business_date: businessDate,
      region,
      source: String(input.source || 'unknown'),
      fetched_at: input.fetched_at || nowIso(),
      status,
      complete,
      stations,
      fingerprint: stableStringify(core),
      provider_revision: input.provider_revision == null ? null : String(input.provider_revision)
    };
  }

  function createPoller(options) {
    if (!options || typeof options.fetchSnapshot !== 'function') throw new Error('FETCH_SNAPSHOT_REQUIRED');
    const fetchSnapshot = options.fetchSnapshot;
    const store = options.store || null;
    const onUpdate = typeof options.onUpdate === 'function' ? options.onUpdate : function () {};
    const onStatus = typeof options.onStatus === 'function' ? options.onStatus : function () {};
    const intervalMs = Number(options.intervalMs == null ? DEFAULT_INTERVAL_MS : options.intervalMs);
    if (!Number.isFinite(intervalMs) || intervalMs < 60000 || intervalMs > 120000) throw new Error('POLL_INTERVAL_MUST_BE_60_TO_120_SECONDS');

    let timer = null;
    let running = false;
    let lastSnapshot = null;
    let scope = null;

    async function runOnce() {
      if (!scope) throw new Error('POLL_SCOPE_REQUIRED');
      onStatus({ state: 'fetching', scope: clone(scope), last_snapshot: clone(lastSnapshot) });
      try {
        const raw = await fetchSnapshot(clone(scope));
        const snapshot = normalizeSnapshot(Object.assign({}, raw, scope));
        let changed = !lastSnapshot || lastSnapshot.fingerprint !== snapshot.fingerprint;
        let previous = lastSnapshot;

        if (store && typeof store.saveResultSnapshot === 'function') {
          const saved = await store.saveResultSnapshot(snapshot);
          changed = saved.changed;
          previous = saved.previous;
        }

        lastSnapshot = snapshot;
        onUpdate(clone(snapshot), {
          changed,
          previous: clone(previous),
          provisional: !snapshot.complete,
          final: snapshot.complete
        });
        onStatus({ state: snapshot.complete ? 'complete' : 'waiting', scope: clone(scope), snapshot: clone(snapshot) });
        if (snapshot.complete) stop();
        return snapshot;
      } catch (error) {
        onStatus({ state: 'error', scope: clone(scope), error: String(error && error.message || error), last_snapshot: clone(lastSnapshot) });
        throw error;
      }
    }

    function schedule() {
      if (!running) return;
      timer = global.setTimeout(async () => {
        try { await runOnce(); } catch (_) { /* retain last snapshot and retry */ }
        if (running) schedule();
      }, intervalMs);
    }

    async function start(nextScope) {
      if (!nextScope || !validDateOnly(nextScope.business_date) || !PRIZE_COUNTS[String(nextScope.region || '').toLowerCase()]) {
        throw new Error('INVALID_POLL_SCOPE');
      }
      stop();
      scope = { business_date: String(nextScope.business_date), region: String(nextScope.region).toLowerCase() };
      running = true;
      try { await runOnce(); } catch (_) { /* keep polling after transient failure */ }
      if (running) schedule();
    }

    function stop() {
      running = false;
      if (timer != null) global.clearTimeout(timer);
      timer = null;
    }

    return Object.freeze({
      start,
      stop,
      runOnce,
      getState: () => ({ running, scope: clone(scope), last_snapshot: clone(lastSnapshot), interval_ms: intervalMs })
    });
  }

  global.KTS_RESULT_SERVICE = Object.freeze({
    DEFAULT_INTERVAL_MS,
    PRIZE_COUNTS,
    stableStringify,
    normalizePrizeMap,
    stationComplete,
    normalizeStation,
    normalizeSnapshot,
    createPoller
  });
})(typeof window !== 'undefined' ? window : globalThis);
