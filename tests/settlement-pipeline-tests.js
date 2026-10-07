'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

function loadContext(fakeStore) {
  const ctx = { console, globalThis: null, KTS_SETTLEMENT_STORE: fakeStore };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const file of [
    'app/settlement-engine.js', 'app/settlement-mb-rules.js', 'app/settlement-evaluator.js',
    'app/settlement-feature-gates.js', 'app/settlement-runtime.js', 'app/settlement-pipeline.js'
  ]) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  return ctx;
}

function makeResult(complete = true) {
  return {
    id: '2026-09-22:mb', business_date: '2026-09-22', region: 'mb', complete,
    stations: [{ code: 'mb', prizes: {
      DB: ['31922'], G1: ['12361'], G2: ['10001','20002'], G3: ['30003','40004','50005','60006','70007','80008'],
      G4: ['90009','11110','22211','33312'], G5: ['44592','55514','66615','77716','88817','99918'],
      G6: ['192','319','561'], G7: ['92','20','30','40']
    }}]
  };
}

function config() {
  const p = () => ({ commission: '0.76', win: '1' });
  return {
    partner_id: 'p1', version: 1, effective_from_date: '2026-01-01', commission_type: 'ratio',
    total_percent: '100', refund_percent: '0', mb_xien_234: false, tinh_ui: false,
    region_terms: { mb:{ total_percent:'50', refund_percent:'0' } },
    region_pricing: { mb: { '2CB': p(), '2CD': p(), '2CB8': p(), DAT: p(), '3CB': p(), '3CB7': p(), '3CDD': p(), '4C': p(), MB_XIEN2: { commission: '56', win: '1000' }, UI: { commission: '0', win: '10' } } }
  };
}

function fakeStore(messages) {
  const state = { messages: messages.map(x => ({ ...x })), settlements: [], results: [makeResult(true)], partners: [{ id: 'p1', name: 'Test', role: 'customer' }] };
  const STORES = { messages: 'messages', settlements: 'settlements', results: 'results', partners: 'partners' };
  return {
    STORES, state,
    async getAll(name) { return (state[name] || []).map(x => ({ ...x })); },
    async get(name, key) { return (state[name] || []).find(x => x.id === key) || null; },
    async resolveConfigForDate() { return config(); },
    async saveSettlement(row) {
      const i = state.settlements.findIndex(x => x.id === row.id);
      if (i >= 0) state.settlements[i] = { ...row }; else state.settlements.push({ ...row });
      return { ...row };
    },
    async saveMessage(row) {
      const i = state.messages.findIndex(x => x.id === row.id);
      if (i >= 0) state.messages[i] = { ...row }; else state.messages.push({ ...row });
      return { ...row };
    }
  };
}

(async () => {
  const approx = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
  const baseMessages = [
    { id: 'm1', partner_id: 'p1', business_date: '2026-09-22', region: 'mb', raw_text: '92 b 1n', status: 'parsed_waiting_result', canonical_payload: { region: 'mb', legs: [{ code: '2CB', values: ['92'], stake: '1' }] } },
    { id: 'm2', partner_id: 'p1', business_date: '2026-09-22', region: 'mb', raw_text: '92 61 da 1n', status: 'parsed_waiting_result', canonical_payload: { region: 'mb', legs: [{ code: 'DAT', values: ['92','61'], stake: '1' }] } }
  ];
  const store = fakeStore(baseMessages);
  const ctx = loadContext(store);
  const P = ctx.KTS_SETTLEMENT_PIPELINE;
  const out = await P.settleScope({ partner_id: 'p1', business_date: '2026-09-22', region: 'mb' });
  assert.strictEqual(out.status, 'complete_unverified');
  assert.strictEqual(out.settlement.id, 'scope:p1:2026-09-22:mb');
  assert.deepStrictEqual(Array.from(out.settlement.message_ids), ['m1','m2']);
  assert.strictEqual(out.settlement.result_snapshot.total_xac, 81);
  approx(out.settlement.result_snapshot.total_qua_co, 61.56);
  // 2CB 92 hits 3 times; DAT 92-61 uses fixed nhiều-cặp min(3,2)=2 => total 5.
  assert.strictEqual(out.settlement.result_snapshot.total_payout, 5);
  approx(out.settlement.result_snapshot.final_net, 28.28);
  assert.strictEqual(out.settlement.message_breakdown.length, 2);

  store.state.messages.push({ id: 'm3', partner_id: 'p1', business_date: '2026-09-22', region: 'mb', raw_text: 'bad', status: 'parser_error', canonical_payload: null });
  const blocked = await P.settleScope({ partner_id: 'p1', business_date: '2026-09-22', region: 'mb' });
  assert.strictEqual(blocked.status, 'blocked');
  assert.match(blocked.reason, /PENDING_PARSER/);
  assert.strictEqual(store.state.settlements.length, 1, 'deterministic scope upsert must replace stale money');
  assert.strictEqual(store.state.settlements[0].result_snapshot.total_xac, 0);

  const cancelBad = await P.cancelMessage('m3');
  assert.strictEqual(cancelBad.status, 'cancelled');
  assert.strictEqual(store.state.messages.find(x => x.id === 'm3').status, 'cancelled');
  assert.strictEqual(cancelBad.settlement.status, 'complete_unverified');
  assert.strictEqual(cancelBad.settlement.settlement.result_snapshot.total_xac, 81);

  await P.cancelMessage('m1');
  const onlyM2 = store.state.settlements[0];
  assert.deepStrictEqual(Array.from(onlyM2.message_ids), ['m2']);
  assert.strictEqual(onlyM2.result_snapshot.total_xac, 54);
  assert.strictEqual(onlyM2.result_snapshot.total_payout, 2);

  const lastCancelled = await P.cancelMessage('m2');
  assert.strictEqual(lastCancelled.settlement.status, 'empty');
  assert.strictEqual(lastCancelled.settlement.settlement.scope_status, 'empty');
  assert.strictEqual(lastCancelled.settlement.settlement.result_snapshot.total_xac, 0);
  assert.deepStrictEqual(Array.from(lastCancelled.settlement.settlement.message_ids), []);

  const restored = await P.restoreMessage('m2');
  assert.strictEqual(restored.status, 'restored');
  assert.strictEqual(restored.settlement.status, 'complete_unverified');
  assert.deepStrictEqual(Array.from(restored.settlement.settlement.message_ids), ['m2']);
  assert.strictEqual(store.state.messages.find(x => x.id === 'm2').status, 'settled_unverified');

  const active = await P.findScopeMessages('p1', '2026-09-22', 'mb');
  assert.deepStrictEqual(Array.from(active.map(x => x.id)), ['m2']);

  const xienStore = fakeStore([{ id: 'x1', partner_id: 'p1', business_date: '2026-09-22', region: 'mb', raw_text: '92 61 xien 1n', status: 'parsed_waiting_result', canonical_payload: { region: 'mb', legs: [{ code: 'MB_XIEN2', values: ['92','61'], stake: '1' }] } }]);
  const xctx = loadContext(xienStore);
  const xout = await xctx.KTS_SETTLEMENT_PIPELINE.settleScope({ partner_id: 'p1', business_date: '2026-09-22', region: 'mb' });
  assert.strictEqual(xout.status, 'blocked');
  assert.match(xout.reason, /MB_XIEN_234_NOT_ALLOWED/);
  console.log('settlement pipeline tests PASS');
})().catch(err => { console.error(err); process.exit(1); });
