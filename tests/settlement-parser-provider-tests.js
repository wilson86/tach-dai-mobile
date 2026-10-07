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

(async()=>{
  assert.strictEqual(P.version, 'settlement-parser-provider-v2-live-identity');
  assert.strictEqual(P.endpoint(), '/api/settlement/parse');
  ctx.KTS_SETTLEMENT_RUNTIME_ENDPOINTS={parser_endpoint:'https://runtime.example/api/settlement/parse'};
  assert.strictEqual(P.runtimeEndpoint(),'https://runtime.example/api/settlement/parse');
  assert.strictEqual(P.endpoint(),'https://runtime.example/api/settlement/parse');
  assert.strictEqual(P.identityEndpoint(),'https://runtime.example/api/settlement/parser-identity');
  delete ctx.KTS_SETTLEMENT_RUNTIME_ENDPOINTS;
  assert.strictEqual(P.identityEndpoint(), 'https://example.test/api/settlement/parser-identity');
  assert.strictEqual(P.setEndpoint('/kts-api/settlement/parse'), '/kts-api/settlement/parse');
  assert.strictEqual(P.endpoint(), '/kts-api/settlement/parse');
  assert.strictEqual(P.identityEndpoint(), 'https://example.test/kts-api/settlement/parser-identity');
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

  // Older backend responses remain readable; identity is optional for message history compatibility.
  const legacy = P.normalizeCanonicalPayload({ region:'mb', parser_version:'legacy', legs:[{code:'2CB',values:['92'],stake:'1'}] }, 'mb');
  assert.strictEqual(legacy.parser_identity, null);

  assert.throws(() => P.normalizeCanonicalPayload({
    region:'mb', legs:[{code:'2CB',values:['92'],stake:'1'}],
    parser_identity:{identity_sha256:'bad'}
  }, 'mb'), /PARSER_IDENTITY_INVALID:identity_sha256/);
  assert.throws(() => P.normalizeCanonicalPayload({ region: 'mb', legs: [] }, 'mb'), /PARSER_NO_LEGS/);

  const backendPayload={
    ok:true, api_version:'kts-settlement-api-v1', identity_contract:'kts-parser-identity-v1',
    identities:{
      mb:{parser_version:'mb-v1',identity_sha256:H,parser_source_sha256:S,grammar_sha256:G,business_engine_sha256:B},
      mn_mt:{parser_version:'mn-v1',identity_sha256:'e'.repeat(64),parser_source_sha256:S,grammar_sha256:G,business_engine_sha256:B}
    }
  };
  const backend=P.normalizeBackendIdentityPayload(backendPayload);
  assert.strictEqual(backend.identities.mb.identity_sha256,H);
  assert.strictEqual(backend.identities.mn_mt.identity_sha256,'e'.repeat(64));
  assert.throws(()=>P.normalizeBackendIdentityPayload({...backendPayload,identity_contract:'wrong'}),/PARSER_BACKEND_IDENTITY_CONTRACT_INVALID/);

  let requested=null;
  ctx.fetch=async(url,options)=>{requested={url,options};return {ok:true,status:200,async json(){return backendPayload;}};};
  const live=await P.fetchIdentity();
  assert.strictEqual(requested.url,'https://example.test/kts-api/settlement/parser-identity');
  assert.strictEqual(requested.options.method,'GET');
  assert.strictEqual(requested.options.cache,'no-store');
  assert.strictEqual(live.identities.mb.identity_sha256,H);

  console.log('settlement parser provider tests PASS');
})().catch(e=>{console.error(e);process.exit(1);});
