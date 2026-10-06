(function (global) {
  'use strict';

  const STORAGE_KEY = 'kts_settlement_parser_endpoint_v1';
  const DEFAULT_ENDPOINT = '/api/settlement/parse';
  const SHA256_RE = /^[0-9a-f]{64}$/i;
  const IDENTITY_HASH_FIELDS = Object.freeze(['identity_sha256','parser_source_sha256','grammar_sha256','business_engine_sha256']);

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
      throw new Error('PARSER_ENDPOINT_MUST_BE_HTTP_OR_SAME_ORIGIN_PATH');
    }
    try {
      if (global.localStorage) global.localStorage.setItem(STORAGE_KEY, next);
    } catch (_) {}
    return next;
  }

  function normalizeLeg(input) {
    if (!input || typeof input !== 'object') throw new Error('PARSER_LEG_INVALID');
    const code = String(input.code || '').trim().toUpperCase();
    const values = Array.isArray(input.values) ? input.values.map(v => String(v)) : [];
    const stake = String(input.stake == null ? '' : input.stake).replace(',', '.');
    if (!code) throw new Error('PARSER_LEG_CODE_REQUIRED');
    if (!values.length) throw new Error('PARSER_LEG_VALUES_REQUIRED');
    if (!/^\d+(?:\.5)?$/.test(stake)) throw new Error('PARSER_LEG_STAKE_INVALID');
    return {
      code,
      values,
      stake,
      action: String(input.action || '').toLowerCase(),
      position: input.position == null ? null : String(input.position).toLowerCase(),
      station_codes: Array.isArray(input.station_codes) ? input.station_codes.map(x => String(x).toLowerCase()) : [],
      inherited_values: Boolean(input.inherited_values)
    };
  }

  function normalizeParserIdentity(input, parserVersion) {
    if (input == null) return null;
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('PARSER_IDENTITY_INVALID');
    const out = { parser_version: String(input.parser_version || parserVersion || '') };
    for (const field of IDENTITY_HASH_FIELDS) {
      const raw = input[field];
      if (raw == null || raw === '') { out[field] = null; continue; }
      const value = String(raw).toLowerCase();
      if (!SHA256_RE.test(value)) throw new Error('PARSER_IDENTITY_INVALID:' + field);
      out[field] = value;
    }
    if (out.identity_sha256 == null) throw new Error('PARSER_IDENTITY_INVALID:identity_sha256');
    return out;
  }

  function normalizeCanonicalPayload(payload, requestedRegion) {
    if (!payload || typeof payload !== 'object') throw new Error('PARSER_INVALID_JSON');
    const body = payload.canonical_payload || payload.data || payload;
    const region = String(body.region || requestedRegion || '').toLowerCase();
    if (!['mn', 'mt', 'mb'].includes(region)) throw new Error('PARSER_REGION_INVALID');
    const legs = Array.isArray(body.legs) ? body.legs.map(normalizeLeg) : [];
    if (!legs.length) throw new Error('PARSER_NO_LEGS');
    const parserVersion = String(body.parser_version || payload.parser_version || 'canonical-settlement-v1');
    const identityInput = body.parser_identity == null ? payload.parser_identity : body.parser_identity;
    return {
      raw_text: String(body.raw_text || ''),
      region,
      parser_version: parserVersion,
      parser_identity: normalizeParserIdentity(identityInput, parserVersion),
      legs
    };
  }

  async function fetchCanonical(rawText, region, businessDate) {
    const raw = String(rawText || '').trim();
    const r = String(region || '').toLowerCase();
    const d = String(businessDate || '').slice(0, 10);
    if (!raw) throw new Error('PARSER_MESSAGE_REQUIRED');
    if (!['mn', 'mt', 'mb'].includes(r)) throw new Error('PARSER_REGION_REQUIRED');
    if (r !== 'mb' && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('PARSER_BUSINESS_DATE_REQUIRED');

    const url = new URL(endpoint(), global.location && global.location.href ? global.location.href : 'https://localhost/');
    const response = await global.fetch(url.toString(), {
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ raw_text: raw, region: r, business_date: d || null })
    });
    if (!response.ok) {
      let code = 'PARSER_HTTP_' + response.status;
      try {
        const body = await response.json();
        if (body && body.error) code += ':' + String(body.error);
      } catch (_) {}
      throw new Error(code);
    }
    return normalizeCanonicalPayload(await response.json(), r);
  }

  global.KTS_SETTLEMENT_PARSER_PROVIDER = Object.freeze({
    STORAGE_KEY,
    DEFAULT_ENDPOINT,
    IDENTITY_HASH_FIELDS,
    endpoint,
    setEndpoint,
    normalizeParserIdentity,
    normalizeCanonicalPayload,
    fetchCanonical
  });
})(typeof window !== 'undefined' ? window : globalThis);
