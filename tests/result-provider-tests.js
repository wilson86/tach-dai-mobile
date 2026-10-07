'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const code = fs.readFileSync(path.join(__dirname, '..', 'app', 'result-provider.js'), 'utf8');
const mem = new Map();
let requested = null;
const sandbox = {
  globalThis: {},
  URL,
  Date,
  location: { href: 'https://example.test/app/settlement.html' },
  localStorage: {
    getItem: k => mem.has(k) ? mem.get(k) : null,
    setItem: (k, v) => mem.set(k, String(v))
  },
  fetch: async (url, options) => {
    requested = { url, options };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        source: 'fixture',
        expected_station_codes: ['bt', 'vt', 'bli'],
        verified: false,
        verification_status: 'conflict',
        verification_sources: ['source-a', 'source-b'],
        verification_reason: 'KQXS_SOURCE_CONFLICT',
        verification_conflicts: ['bli:G8'],
        stations: [{ code: 'bli', name: 'Bạc Liêu', prizes: { G8: ['90'] } }]
      })
    };
  }
};
Object.assign(sandbox.globalThis, sandbox);
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const P = sandbox.globalThis.KTS_RESULT_PROVIDER;

assert.strictEqual(P.endpoint(), '/api/kqxs');
sandbox.globalThis.KTS_SETTLEMENT_RUNTIME_ENDPOINTS={kqxs_endpoint:'https://runtime.example/api/kqxs'};
assert.strictEqual(P.runtimeEndpoint(),'https://runtime.example/api/kqxs');
assert.strictEqual(P.endpoint(),'https://runtime.example/api/kqxs');
delete sandbox.globalThis.KTS_SETTLEMENT_RUNTIME_ENDPOINTS;
assert.strictEqual(P.setEndpoint('/kts-api/kqxs'), '/kts-api/kqxs');
assert.strictEqual(P.endpoint(), '/kts-api/kqxs');
assert.throws(() => P.setEndpoint('javascript:alert(1)'), /KQXS_ENDPOINT/);

assert.throws(() => P.normalizeProviderPayload({
  business_date:'2026-10-04', region:'mn',
  expected_station_codes:['bt'], stations:[{code:'bt',prizes:{G8:['01']}}]
}, {business_date:'2026-10-05',region:'mn'}), /KQXS_PROVIDER_SCOPE_MISMATCH:DATE/);
assert.throws(() => P.normalizeProviderPayload({
  business_date:'2026-10-05', region:'mt',
  expected_station_codes:['dl'], stations:[{code:'dl',prizes:{G8:['01']}}]
}, {business_date:'2026-10-05',region:'mn'}), /KQXS_PROVIDER_SCOPE_MISMATCH:REGION/);
assert.throws(() => P.normalizeProviderPayload({
  business_date:'2026-10-05', region:'mn',
  stations:[{code:'bt',prizes:{G8:['01']}}]
}, {business_date:'2026-10-05',region:'mn'}), /KQXS_PROVIDER_EXPECTED_STATIONS_REQUIRED/);
assert.throws(() => P.normalizeProviderPayload({
  business_date:'2026-10-05', region:'mn',
  expected_station_codes:['bt','bt'], stations:[{code:'bt',prizes:{G8:['01']}}]
}, {business_date:'2026-10-05',region:'mn'}), /KQXS_PROVIDER_EXPECTED_STATIONS_DUPLICATE/);


(async () => {
  const out = await P.fetchSnapshot({ business_date: '2026-10-05', region: 'mn' });
  assert.strictEqual(out.business_date, '2026-10-05');
  assert.strictEqual(out.region, 'mn');
  assert.strictEqual(out.source, 'fixture');
  assert.strictEqual(out.stations[0].code, 'bli');
  assert.deepStrictEqual(Array.from(out.expected_station_codes), ['bt', 'vt', 'bli']);
  assert.strictEqual(out.verification_status, 'conflict');
  assert.deepStrictEqual(Array.from(out.verification_sources), ['source-a', 'source-b']);
  assert.strictEqual(out.verification_reason, 'KQXS_SOURCE_CONFLICT');
  assert.deepStrictEqual(Array.from(out.verification_conflicts), ['bli:G8']);
  assert(requested.url.includes('date=2026-10-05'));
  assert(requested.url.includes('region=mn'));
  assert.strictEqual(requested.options.cache, 'no-store');
  assert.strictEqual(requested.options.credentials, 'omit');
  assert(!JSON.stringify(requested.options).toLowerCase().includes('api-key'));
  
})().catch(err => { console.error(err); process.exit(1); });

assert.throws(() => P.normalizeProviderPayload({
  region:'mn', expected_station_codes:['bt'], stations:[{code:'bt'}]
}, {business_date:'2026-10-05',region:'mn'}), /KQXS_PROVIDER_SCOPE_REQUIRED:DATE/);
assert.throws(() => P.normalizeProviderPayload({
  business_date:'2026-10-05', expected_station_codes:['bt'], stations:[{code:'bt'}]
}, {business_date:'2026-10-05',region:'mn'}), /KQXS_PROVIDER_SCOPE_REQUIRED:REGION/);
assert(source.includes('async function fetchWithTimeout('));
assert(source.includes("30000, 'KQXS_REQUEST_TIMEOUT'"));
console.log('result-provider-tests: PASS');
