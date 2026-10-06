'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const initialReference = {
  source: 'HIOSKT_MANUAL',
  totals: { xac: 10, qua_co: 7.6, payout: 0, final: 7.6 },
  categories: [{ code: 'DAT', xac: 10, qua_co: 7.6, hit_units: 0, payout: 0 }],
  comparison: { status: 'MATCH_EXACT' }
};

const state = {
  settlements: [{
    id: 'scope:p1:2026-09-22:mb', partner_id: 'p1', business_date: '2026-09-22', region: 'mb',
    scope_status: 'complete_unverified', comparison_status: 'MATCH_EXACT', blocked_reasons: [],
    lottery_result_snapshot: { complete: true, verification_status: 'unverified' },
    settlement_result: { total_xac: 10, total_qua_co: 7.6, total_payout: 0, refund_amount: 0, final_net: 7.6 },
    result_snapshot: { total_xac: 10, total_qua_co: 7.6, total_payout: 0, refund_amount: 0, final_net: 7.6 },
    category_rows: [{ code: 'DAT', xac: 10, qua_co: 7.6, hit_units: 0, payout: 0 }],
    message_breakdown: [{ message_id: 'm1', category_rows: [{ code: 'DAT', xac: 10, qua_co: 7.6, hit_units: 0, payout: 0 }] }],
    reference_app_snapshot: JSON.parse(JSON.stringify(initialReference)),
    created_at: '2026-09-22T10:00:00Z'
  }],
  messages: [{ id: 'm1', raw_text: '92 61 da 1n', status: 'settled_unverified' }]
};

const store = {
  STORES: { settlements: 'settlements', messages: 'messages' },
  async getAll(name) { return (state[name] || []).map(x => JSON.parse(JSON.stringify(x))); },
  async get(name, id) { const row = (state[name] || []).find(x => x.id === id); return row ? JSON.parse(JSON.stringify(row)) : null; },
  async saveSettlement(row) {
    const copy = JSON.parse(JSON.stringify(row));
    const i = state.settlements.findIndex(x => x.id === copy.id);
    if (i >= 0) state.settlements[i] = copy; else state.settlements.push(copy);
    return JSON.parse(JSON.stringify(copy));
  }
};

function makeSettlement(snapshot) {
  const xac = Number(snapshot.test_xac == null ? 11 : snapshot.test_xac);
  const qua = xac * 0.76;
  const complete = snapshot.complete !== false;
  return {
    id: 'scope:p1:2026-09-22:mb', partner_id: 'p1', business_date: '2026-09-22', region: 'mb',
    scope_status: complete ? 'complete_unverified' : 'provisional',
    comparison_status: complete ? 'unverified' : 'provisional', blocked_reasons: [],
    lottery_result_snapshot: JSON.parse(JSON.stringify(snapshot)),
    settlement_result: { total_xac: xac, total_qua_co: qua, total_payout: 0, refund_amount: 0, final_net: qua },
    result_snapshot: { total_xac: xac, total_qua_co: qua, total_payout: 0, refund_amount: 0, final_net: qua },
    category_rows: [{ code: 'DAT', xac, qua_co: qua, hit_units: 0, payout: 0 }],
    message_breakdown: [{ message_id: 'm1', category_rows: [{ code: 'DAT', xac, qua_co: qua, hit_units: 0, payout: 0 }] }],
    created_at: '2026-09-22T10:00:00Z'
  };
}

const basePipeline = {
  version: 'base-test',
  async recalculateDateRegion(input) {
    const row = makeSettlement(input.result_snapshot || {});
    await store.saveSettlement(row); // Simulates the old pipeline overwriting reference_app_snapshot.
    return [{ status: row.scope_status, settlement: row }];
  },
  async settleScope(input) { return (await this.recalculateDateRegion({ result_snapshot: input.result_snapshot || {} }))[0]; },
  async recalculatePartnerFromDate() { return []; },
  async parseAndSaveMessage() { return { status: 'parsed_waiting_result', message: { id: 'm2' }, settlement: null }; },
  async cancelMessage() { return { status: 'cancelled', settlement: null }; },
  async restoreMessage() { return { status: 'restored', settlement: null }; }
};

const ctx = { console, globalThis: null, KTS_SETTLEMENT_STORE: store, KTS_SETTLEMENT_PIPELINE: basePipeline };
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const file of ['app/settlement-shadow.js', 'app/settlement-shadow-runtime.js', 'app/settlement-shadow-guard.js']) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
}

(async () => {
  const P = ctx.KTS_SETTLEMENT_PIPELINE;
  assert.strictEqual(P.__shadow_guarded, true);

  // A KQXS correction/recalculation must not erase the saved HIOSKT oracle.
  let out = await P.recalculateDateRegion({ business_date: '2026-09-22', region: 'mb', result_snapshot: { complete: true, verification_status: 'unverified', test_xac: 11 } });
  assert.strictEqual(out[0].settlement.comparison_status, 'MISMATCH');
  assert.strictEqual(state.settlements[0].reference_app_snapshot.source, 'HIOSKT_MANUAL');
  assert.strictEqual(state.settlements[0].reference_app_snapshot.comparison.status, 'MISMATCH');
  assert.strictEqual(state.settlements[0].category_rows[0].xac, 11);

  // A cross-source conflict is fail-closed even though the primary result can still be displayed/calculated.
  out = await P.recalculateDateRegion({ business_date: '2026-09-22', region: 'mb', result_snapshot: { complete: true, verification_status: 'conflict', verification_conflicts: ['mb:G7'], test_xac: 10 } });
  assert.strictEqual(out[0].status, 'blocked');
  assert.strictEqual(out[0].settlement.comparison_status, 'blocked');
  assert(state.settlements[0].blocked_reasons.includes('KQXS_SOURCE_CONFLICT'));
  assert.strictEqual(state.settlements[0].reference_app_snapshot.comparison, undefined, 'stale comparison must be cleared while blocked');

  // When the sources agree again, the conflict reason is removed and HIOSKT is re-compared automatically.
  out = await P.recalculateDateRegion({ business_date: '2026-09-22', region: 'mb', result_snapshot: { complete: true, verification_status: 'verified', test_xac: 10 } });
  assert.strictEqual(out[0].status, 'complete_unverified');
  assert.strictEqual(out[0].settlement.comparison_status, 'MATCH_EXACT');
  assert(!state.settlements[0].blocked_reasons.includes('KQXS_SOURCE_CONFLICT'));
  assert.strictEqual(state.settlements[0].reference_app_snapshot.comparison.status, 'MATCH_EXACT');

  // Partial/live results keep the oracle but deliberately invalidate the old comparison until results are complete again.
  out = await P.recalculateDateRegion({ business_date: '2026-09-22', region: 'mb', result_snapshot: { complete: false, verification_status: 'unverified', test_xac: 5 } });
  assert.strictEqual(out[0].status, 'provisional');
  assert.strictEqual(out[0].settlement.comparison_status, 'provisional');
  assert.strictEqual(state.settlements[0].reference_app_snapshot.source, 'HIOSKT_MANUAL');
  assert.strictEqual(state.settlements[0].reference_app_snapshot.comparison, undefined);
  assert.strictEqual(state.settlements[0].reference_app_snapshot.stale_reason, 'KQXS_PROVISIONAL');

  console.log('settlement shadow guard tests PASS');
})().catch(err => { console.error(err); process.exit(1); });
