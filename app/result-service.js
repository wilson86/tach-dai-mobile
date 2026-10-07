(function (global) {
  'use strict';

  const DEFAULT_INTERVAL_MS = 90000;

  const PRIZE_COUNTS = Object.freeze({
    mn: Object.freeze({ G8: 1, G7: 1, G6: 3, G5: 1, G4: 7, G3: 2, G2: 1, G1: 1, DB: 1 }),
    mt: Object.freeze({ G8: 1, G7: 1, G6: 3, G5: 1, G4: 7, G3: 2, G2: 1, G1: 1, DB: 1 }),
    mb: Object.freeze({ G7: 4, G6: 3, G5: 6, G4: 4, G3: 6, G2: 2, G1: 1, DB: 1 })
  });

  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
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
    const computedComplete = stationComplete(region, { prizes });
    const complete = computedComplete && station.complete !== false;
    return {
      code: String(station.code).toLowerCase(),
      name: String(station.name || station.code),
      prizes,
      complete
    };
  }

  function normalizeExpectedStationCodes(input) {
    const raw = Array.isArray(input && input.expected_station_codes) ? input.expected_station_codes : [];
    const codes = raw.map(x => String(x || '').trim().toLowerCase()).filter(Boolean);
    if (new Set(codes).size !== codes.length) throw new Error('RESULT_EXPECTED_STATIONS_DUPLICATE');
    return codes;
  }

  function stationCoverage(expectedStationCodes, stations) {
    if (!expectedStationCodes.length) return true;
    const actual = stations.map(s => String(s.code || '').toLowerCase());
    if (new Set(actual).size !== actual.length) throw new Error('RESULT_STATION_DUPLICATE');
    if (actual.length !== expectedStationCodes.length) return false;
    const actualSet = new Set(actual);
    return expectedStationCodes.every(code => actualSet.has(code));
  }

  function normalizeVerification(input, complete) {
    let status = String(input && input.verification_status || '').toLowerCase();
    if (input && input.verified === true) status = 'verified';
    if (!['unverified', 'verified', 'conflict'].includes(status)) status = 'unverified';
    if (!complete && status === 'verified') status = 'unverified';
    return status;
  }

  function normalizeSnapshot(input) {
    const businessDate = String(input && input.business_date || '').slice(0, 10);
    const region = String(input && input.region || '').toLowerCase();
    if (!validDateOnly(businessDate)) throw new Error('RESULT_DATE_REQUIRED');
    if (!PRIZE_COUNTS[region]) throw new Error('RESULT_REGION_REQUIRED');
    const stations = (input.stations || []).map(s => normalizeStation(region, s));
    if (!stations.length) throw new Error('RESULT_STATIONS_REQUIRED');
    if (new Set(stations.map(s => s.code)).size !== stations.length) throw new Error('RESULT_STATION_DUPLICATE');
    const expectedStationCodes = normalizeExpectedStationCodes(input);
    const coverageComplete = expectedStationCodes.length > 0 && stationCoverage(expectedStationCodes, stations);
    const complete = coverageComplete && stations.every(s => s.complete);
    const status = complete ? 'complete' : 'partial';
    const verificationSources = Array.isArray(input.verification_sources) ? input.verification_sources.map(String) : [];
    const verificationReason = input.verification_reason == null ? null : String(input.verification_reason);
    const verificationConflicts = Array.isArray(input.verification_conflicts) ? input.verification_conflicts.map(String) : [];
    let verificationStatus = normalizeVerification(input, complete);
    const distinctVerificationSources = new Set(verificationSources.map(x => String(x || '').trim()).filter(Boolean));
    if (verificationConflicts.length > 0) {
      // Conflict evidence is authoritative even if a malformed/upstream payload
      // also claims verified=true. Never downgrade an explicit conflict to merely
      // "unverified", because settlement must fail closed on conflicting sources.
      verificationStatus = 'conflict';
    } else if (verificationStatus === 'verified' && distinctVerificationSources.size < 2) {
      verificationStatus = 'unverified';
    }
    const verified = complete && verificationStatus === 'verified';
    const core = {
      business_date: businessDate,
      region,
      expected_station_codes: expectedStationCodes,
      stations,
      complete,
      status,
      verification_status: verificationStatus,
      verification_sources: verificationSources,
      verification_reason: verificationReason,
      verification_conflicts: verificationConflicts
    };
    return {
      id: input.id || `${businessDate}:${region}`,
      business_date: businessDate,
      region,
      source: String(input.source || 'unknown'),
      fetched_at: input.fetched_at || nowIso(),
      status,
      complete,
      coverage_complete: coverageComplete,
      verified,
      verification_status: verificationStatus,
      verification_sources: verificationSources,
      verification_reason: verificationReason,
      verification_conflicts: verificationConflicts,
      expected_station_codes: expectedStationCodes,
      stations,
      fingerprint: stableStringify(core),
      provider_revision: input.provider_revision == null ? null : String(input.provider_revision)
    };
  }

  function verificationPending(snapshot) {
    return Boolean(snapshot) &&
      String(snapshot.verification_status || '').toLowerCase() === 'unverified' &&
      snapshot.verified !== true;
  }

  function createPoller(options) {
    if (!options || typeof options.fetchSnapshot !== 'function') throw new Error('FETCH_SNAPSHOT_REQUIRED');
    const fetchSnapshot = options.fetchSnapshot;
    const store = options.store || null;
    const onUpdate = typeof options.onUpdate === 'function' ? options.onUpdate : function () {};
    const onStatus = typeof options.onStatus === 'function' ? options.onStatus : function () {};
    const intervalMs = Number(options.intervalMs == null ? DEFAULT_INTERVAL_MS : options.intervalMs);
    if (!Number.isFinite(intervalMs) || intervalMs < 60000 || intervalMs > 120000) throw new Error('POLL_INTERVAL_MUST_BE_60_TO_120_SECONDS');
    const completeConfirmations = Number(options.completeConfirmations == null ? 1 : options.completeConfirmations);
    if (!Number.isInteger(completeConfirmations) || completeConfirmations < 1 || completeConfirmations > 10) throw new Error('COMPLETE_CONFIRMATIONS_MUST_BE_1_TO_10');

    let timer = null;
    let running = false;
    let lastSnapshot = null;
    let scope = null;
    let completeStreak = 0;
    let lastCompleteFingerprint = null;

    async function runOnce() {
      if (!scope) throw new Error('POLL_SCOPE_REQUIRED');
      onStatus({ state: 'fetching', scope: clone(scope), last_snapshot: clone(lastSnapshot) });
      try {
        const raw = await fetchSnapshot(clone(scope));
        let snapshot = normalizeSnapshot(Object.assign({}, raw, scope));
        let changed = !lastSnapshot || lastSnapshot.fingerprint !== snapshot.fingerprint;
        let previous = lastSnapshot;
        let staleIgnored = false;

        if (store && typeof store.saveResultSnapshot === 'function') {
          const saved = await store.saveResultSnapshot(snapshot);
          changed = saved.changed;
          previous = saved.previous;
          staleIgnored = Boolean(saved.stale_ignored);
          // saveResultSnapshot is the freshness authority. If it rejected an
          // older concurrent response, continue UI/status/settlement with the
          // canonical stored snapshot rather than the stale fetch object.
          if (saved.snapshot) snapshot = normalizeSnapshot(saved.snapshot);
        }

        lastSnapshot = snapshot;
        if (snapshot.complete) {
          if (lastCompleteFingerprint === snapshot.fingerprint) completeStreak += 1;
          else {
            lastCompleteFingerprint = snapshot.fingerprint;
            completeStreak = 1;
          }
        } else {
          completeStreak = 0;
          lastCompleteFingerprint = null;
        }

        const confirmedComplete = snapshot.complete && completeStreak >= completeConfirmations;
        onUpdate(clone(snapshot), {
          changed,
          previous: clone(previous),
          provisional: !snapshot.complete,
          complete: snapshot.complete,
          coverage_complete: snapshot.coverage_complete,
          complete_confirmations: completeStreak,
          complete_confirmations_required: completeConfirmations,
          complete_confirmed: confirmedComplete,
          verified: snapshot.verified,
          verification_status: snapshot.verification_status,
          final: snapshot.verified,
          stale_ignored: staleIgnored
        });

        if (snapshot.verification_status === 'conflict') {
          onStatus({ state: 'conflict', scope: clone(scope), snapshot: clone(snapshot), complete_confirmations: completeStreak });
        } else if (snapshot.verified && confirmedComplete) {
          onStatus({ state: 'verified', scope: clone(scope), snapshot: clone(snapshot), complete_confirmations: completeStreak });
          stop();
        } else if (snapshot.verified) {
          onStatus({ state: 'complete_waiting_confirmation', scope: clone(scope), snapshot: clone(snapshot), complete_confirmations: completeStreak, complete_confirmations_required: completeConfirmations });
        } else if (confirmedComplete && verificationPending(snapshot)) {
          onStatus({ state: 'verification_pending', scope: clone(scope), snapshot: clone(snapshot), complete_confirmations: completeStreak });
        } else if (confirmedComplete) {
          onStatus({ state: 'complete', scope: clone(scope), snapshot: clone(snapshot), complete_confirmations: completeStreak });
          stop();
        } else if (snapshot.complete) {
          onStatus({ state: 'complete_waiting_confirmation', scope: clone(scope), snapshot: clone(snapshot), complete_confirmations: completeStreak, complete_confirmations_required: completeConfirmations });
        } else {
          onStatus({ state: 'waiting', scope: clone(scope), snapshot: clone(snapshot), complete_confirmations: 0 });
        }
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
      completeStreak = 0;
      lastCompleteFingerprint = null;
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
      getState: () => ({
        running,
        scope: clone(scope),
        last_snapshot: clone(lastSnapshot),
        interval_ms: intervalMs,
        complete_confirmations: completeStreak,
        complete_confirmations_required: completeConfirmations
      })
    });
  }

  global.KTS_RESULT_SERVICE = Object.freeze({
    DEFAULT_INTERVAL_MS,
    PRIZE_COUNTS,
    stableStringify,
    normalizePrizeMap,
    stationComplete,
    normalizeStation,
    normalizeExpectedStationCodes,
    stationCoverage,
    normalizeSnapshot,
    verificationPending,
    createPoller
  });
})(typeof window !== 'undefined' ? window : globalThis);
