'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const state = { metadata: null, pinned: [], history: {} };
const store = {
  STORES: { metadata: 'metadata' },
  async get(name, key) { return name === 'metadata' && state.metadata && state.metadata.key === key ? JSON.parse(JSON.stringify(state.metadata)) : null; },
  async saveMetadata(key, row) { state.metadata = JSON.parse(JSON.stringify(Object.assign({}, row, { key }))); return state.metadata; }
};
const runtime = {
  async getHistory(scope) {
    const key = `${scope.partner_id}:${scope.business_date}:${scope.region}`;
    return JSON.parse(JSON.stringify(state.history[key] || []));
  }
};
const regression = {
  async caseFromEvidence(event, options) {
    return {
      format: 'kts-shadow-regression-case-v1',
      source_event_id: String(event.id),
      scope: { scope_id: event.scope_id, partner_id: event.partner_id, business_date: event.business_date, region: event.region },
      partner_role: 'customer',
      config_snapshot: { total_percent: '100', refund_percent: '0' },
      lottery_result_snapshot: { business_date: event.business_date, region: event.region, stations: [] },
      messages: [{ id: 'm1', raw_text: 'test', canonical_payload: { legs: [{ code: '2CB', values: ['12'], stake: '1' }] } }],
      expected_reference: JSON.parse(JSON.stringify(event.reference_snapshot)),
      note: options && options.note || ''
    };
  },
  async pinCase(c) { state.pinned.push(JSON.parse(JSON.stringify(c))); return c; }
};

const ctx = { console, globalThis: null, KTS_SETTLEMENT_STORE: store, KTS_SETTLEMENT_SHADOW_RUNTIME: runtime, KTS_SETTLEMENT_REGRESSION_CASES: regression };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('app/settlement-regression-candidates.js', 'utf8'), ctx, { filename: 'settlement-regression-candidates.js' });
const C = ctx.KTS_SETTLEMENT_REGRESSION_CANDIDATES;

function event(id, status, date = '2026-09-22', region = 'mn') {
  return {
    id,
    scope_id: `scope:p1:${date}:${region}`,
    partner_id: 'p1', business_date: date, region,
    observed_at: '2026-10-06T10:00:00.000Z',
    comparison_status: status,
    local_snapshot: { settlement_result: { final_net: -4430.12, exact: { final_net: '-4430.12' } } },
    reference_snapshot: { totals: { xac: '288', qua_co: '218.88', payout: '4650', hoi: '0', final: '-4431.12' } },
    comparison: { status, totals: { final_net: { local: -4430.12, reference: -4431.12, delta: 1 } } }
  };
}

(async () => {
  assert.strictEqual(C.version, 'settlement-regression-candidates-v1');
  assert.deepStrictEqual(Array.from(C.mismatchScopesFromSavedDetail({ comparison_status: 'MATCH_EXACT', partner_id: 'p1', business_date: '2026-09-22', region: 'mn' })), []);
  const manualScopes = C.mismatchScopesFromSavedDetail({ comparison_status: 'MISMATCH', partner_id: 'p1', business_date: '2026-09-22', region: 'mn' });
  assert.strictEqual(manualScopes.length, 1);
  const batchScopes = C.mismatchScopesFromSavedDetail({ batch: true, results: [
    { partner_id: 'p1', business_date: '2026-09-22', region: 'mn', comparison_status: 'MISMATCH' },
    { partner_id: 'p2', business_date: '2026-09-22', region: 'mb', comparison_status: 'MATCH_EXACT' }
  ] });
  assert.strictEqual(batchScopes.length, 1);
  assert.strictEqual(batchScopes[0].region, 'mn');

  const ev1 = event('ev1', 'MISMATCH');
  const c1 = await C.captureEvidence(ev1);
  assert.strictEqual(c1.state, 'pending');
  assert.strictEqual(c1.id, 'candidate:ev1');
  assert.strictEqual(c1.local_final, '-4430.12');
  assert.strictEqual(c1.reference_final, '-4431.12');
  assert.strictEqual(c1.final_delta, '1');
  assert.strictEqual((await C.listCandidates({ state: 'pending' })).length, 1);

  // Same evidence is deduplicated by source event id.
  await C.captureEvidence(ev1);
  assert.strictEqual((await C.listCandidates()).length, 1);
  await assert.rejects(() => C.captureEvidence(event('ev-exact', 'MATCH_EXACT')), /REGRESSION_CANDIDATE_MISMATCH_ONLY/);

  await assert.rejects(() => C.confirmAndPin(c1.id, {}), /REFERENCE_CONFIRMATION_REQUIRED/);
  assert.strictEqual(state.pinned.length, 0);
  const promoted = await C.confirmAndPin(c1.id, { reference_confirmed: true, note: 'reference checked' });
  assert.strictEqual(promoted.state, 'promoted');
  assert.strictEqual(state.pinned.length, 1);
  assert.strictEqual((await C.listCandidates({ state: 'pending' })).length, 0);
  assert.strictEqual((await C.listCandidates({ state: 'promoted' })).length, 1);

  const ev2 = event('ev2', 'MISMATCH', '2026-09-23', 'mb');
  state.history['p1:2026-09-23:mb'] = [event('ev-old-exact', 'MATCH_EXACT', '2026-09-23', 'mb'), ev2];
  const captured = await C.captureScope({ partner_id: 'p1', business_date: '2026-09-23', region: 'mb' });
  assert.strictEqual(captured.id, 'candidate:ev2');
  const dismissed = await C.dismissCandidate(captured.id, 'bad HIOSKT transcription');
  assert.strictEqual(dismissed.state, 'dismissed');
  await assert.rejects(() => C.confirmAndPin(captured.id, { reference_confirmed: true }), /CANDIDATE_DISMISSED/);

  const ev3 = event('ev3', 'MISMATCH', '2026-09-24', 'mt');
  state.history['p1:2026-09-24:mt'] = [ev3];
  const auto = await C.captureFromSavedDetail({ batch: true, results: [
    { partner_id: 'p1', business_date: '2026-09-24', region: 'mt', comparison_status: 'MISMATCH' },
    { partner_id: 'p1', business_date: '2026-09-24', region: 'mn', comparison_status: 'MATCH_EXACT' }
  ] });
  assert.strictEqual(auto.length, 1);
  assert.strictEqual(auto[0].candidate.id, 'candidate:ev3');
  assert.strictEqual((await C.listCandidates({ state: 'pending' })).length, 1);

  console.log('settlement-regression-candidates-tests: PASS');
})().catch(error => { console.error(error); process.exit(1); });
