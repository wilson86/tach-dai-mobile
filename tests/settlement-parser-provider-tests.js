'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const localStorage = new Map();
const ctx = {
  console,
  URL,
  location: { href: 'https://example.test/app/settlement.html' },
  localStorage: {
    getItem: key => localStorage.has(key) ? localStorage.get(key) : null,
    setItem: (key, value) => localStorage.set(key, String(value))
  },
  globalThis: null
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('app/settlement-parser-provider.js', 'utf8'), ctx, { filename: 'settlement-parser-provider.js' });
const P = ctx.KTS_SETTLEMENT_PARSER_PROVIDER;

assert.strictEqual(P.endpoint(), '/api/settlement/parse');
assert.strictEqual(P.setEndpoint('/kts-api/settlement/parse'), '/kts-api/settlement/parse');
assert.strictEqual(P.endpoint(), '/kts-api/settlement/parse');
assert.throws(() => P.setEndpoint('javascript:bad'), /PARSER_ENDPOINT/);

const H = 'a'.repeat(64), G = 'b'.repeat(64), S = 'c'.repeat(64), B = 'd'.repeat(64);
const normalized = P.normalizeCanonicalPayload({
  parser_version: 'grammar_v3',
  parser_identity: { parser_version:'grammar_v3', identity_sha256:H, parser_source_sha256:S, grammar_sha256:G, business_engine_sha256:B },
  canonical_payload: {
    raw_text: '92 61 44 da 1n', region: 'mb',
    legs: [{ code: 'DAT', values: ['92', '61', '44'], stake: '1', action: 'da' }]
  }
}, 'mb');
assert.strictEqual(normalized.region, 'mb');
assert.strictEqual(normalized.parser_version, 'grammar_v3');
assert.strictEqual(normalized.parser_identity.identity_sha256, H);
assert.strictEqual(normalized.parser_identity.parser_source_sha256, S);
assert.deepStrictEqual(Array.from(normalized.legs[0].values), ['92', '61', '44']);
assert.strictEqual(normalized.legs[0].stake, '1');

// Older backend responses remain readable; identity is optional for backwards compatibility.
const legacy = P.normalizeCanonicalPayload({ region:'mb', parser_version:'legacy', legs:[{code:'2CB',values:['92'],stake:'1'}] }, 'mb');
assert.strictEqual(legacy.parser_identity, null);

assert.throws(() => P.normalizeCanonicalPayload({
  region:'mb', legs:[{code:'2CB',values:['92'],stake:'1'}],
  parser_identity:{identity_sha256:'bad'}
}, 'mb'), /PARSER_IDENTITY_INVALID:identity_sha256/);
assert.throws(() => P.normalizeCanonicalPayload({ region: 'mb', legs: [] }, 'mb'), /PARSER_NO_LEGS/);
console.log('settlement parser provider tests PASS');
