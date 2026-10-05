(function (global) {
  'use strict';

  const STORAGE_KEY = 'kts_kqxs_endpoint_v1';
  const DEFAULT_ENDPOINT = '/api/kqxs';

  function endpoint() {
    try {
      const saved = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
      return String(saved || DEFAULT_ENDPOINT).trim() || DEFAULT_ENDPOINT;
    } catch (_) {
      return DEFAULT_ENDPOINT;
    }
  }

  function setEndpoint(value) {
    const next = String(value || '').trim() || DEFAULT_ENDPOINT;
    if (!/^https?:\/\//i.test(next) && !next.startsWith('/')) {
      throw new Error('KQXS_ENDPOINT_MUST_BE_HTTP_OR_SAME_ORIGIN_PATH');
    }
    try {
      if (global.localStorage) global.localStorage.setItem(STORAGE_KEY, next);
    } catch (_) {}
    return next;
  }

  function normalizeProviderPayload(payload, scope) {
    if (!payload || typeof payload !== 'object') throw new Error('KQXS_PROVIDER_INVALID_JSON');
    const body = payload.data && typeof payload.data === 'object' ? payload.data : payload;
    const stations = body.stations || body.results || [];
    if (!Array.isArray(stations) || !stations.length) throw new Error('KQXS_PROVIDER_STATIONS_REQUIRED');
    return {
      business_date: scope.business_date,
      region: scope.region,
      source: String(body.source || payload.source || 'kqxs-proxy'),
      fetched_at: body.fetched_at || payload.fetched_at || new Date().toISOString(),
      provider_revision: body.provider_revision == null ? null : String(body.provider_revision),
      verified: body.verified === true,
      verification_status: body.verification_status || (body.verified === true ? 'verified' : 'unverified'),
      verification_sources: Array.isArray(body.verification_sources) ? body.verification_sources.map(String) : [],
      stations
    };
  }

  async function fetchSnapshot(scope) {
    if (!scope || !/^\d{4}-\d{2}-\d{2}$/.test(String(scope.business_date || ''))) {
      throw new Error('KQXS_DATE_REQUIRED');
    }
    const region = String(scope.region || '').toLowerCase();
    if (!['mn', 'mt', 'mb'].includes(region)) throw new Error('KQXS_REGION_REQUIRED');

    const base = endpoint();
    const url = new URL(base, global.location && global.location.href ? global.location.href : 'https://localhost/');
    url.searchParams.set('date', String(scope.business_date));
    url.searchParams.set('region', region);
    const response = await global.fetch(url.toString(), {
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) {
      let code = 'KQXS_HTTP_' + response.status;
      try {
        const body = await response.json();
        if (body && body.error) code += ':' + String(body.error);
      } catch (_) {}
      throw new Error(code);
    }
    return normalizeProviderPayload(await response.json(), { business_date: String(scope.business_date), region });
  }

  global.KTS_RESULT_PROVIDER = Object.freeze({
    STORAGE_KEY,
    DEFAULT_ENDPOINT,
    endpoint,
    setEndpoint,
    normalizeProviderPayload,
    fetchSnapshot
  });
})(typeof window !== 'undefined' ? window : globalThis);
