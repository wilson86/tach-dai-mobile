'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const state = {
  partners: [
    { id: 'p-hien', name: 'Hiền', role: 'customer' },
    { id: 'p-truc', name: 'Trúc', role: 'owner' }
  ],
  settlements: {
    'scope:p-hien:2026-09-22:mn': {
      id: 'scope:p-hien:2026-09-22:mn', partner_id: 'p-hien', business_date: '2026-09-22', region: 'mn', scope_status: 'complete_unverified',
      settlement_result: { total_xac: 288, total_qua_co: 218.88, total_payout: 4650, refund_amount: 0, final_net: -4431.12 }
    },
    'scope:p-truc:2026-09-22:mb': {
      id: 'scope:p-truc:2026-09-22:mb', partner_id: 'p-truc', business_date: '2026-09-22', region: 'mb', scope_status: 'complete_unverified',
      settlement_result: { total_xac: 148, total_qua_co: 112.48, total_payout: 9125, refund_amount: 0, final_net: 9012.52 }
    },
    'scope:p-hien:2026-09-23:mn': {
      id: 'scope:p-hien:2026-09-23:mn', partner_id: 'p-hien', business_date: '2026-09-23', region: 'mn', scope_status: 'blocked',
      settlement_result: { total_xac: 1, total_qua_co: 1, total_payout: 0, refund_amount: 0, final_net: 1 }
    }
  },
  writes: [],
  failScope: null,
  unsafe: false,
  forged: false
};

function refNumber(ref, key) {
  const t = ref && ref.totals || {};
  const v = t[key];
  return v == null ? null : Number(v);
}
const shadow = {
  compareSettlement(settlement, ref) {
    const local = settlement.settlement_result || {};
    const map = { xac: 'total_xac', qua_co: 'total_qua_co', payout: 'total_payout', hoi: 'refund_amount', final: 'final_net' };
    let mismatch = false;
    for (const [rk, lk] of Object.entries(map)) {
      const rv = refNumber(ref, rk);
      if (rv == null) continue;
      if (Math.abs(Number(local[lk]) - rv) > 1e-9) mismatch = true;
    }
    const names = { total_xac: 'xac', total_qua_co: 'qua_co', total_payout: 'payout', final_net: 'final' };
    const totals = Object.fromEntries(Object.entries(names).map(([field, key]) => [
      field, { status: mismatch ? 'MISMATCH' : 'MATCH_EXACT',
        local: Number(local[field]), reference: refNumber(ref, key) }
    ]));
    return { status: mismatch ? 'MISMATCH' : 'MATCH_EXACT',
      exact: !mismatch, required_totals_exact: !mismatch,
      compared_fields: 4, safe_to_promote: !mismatch && !state.unsafe,
      totals: state.forged && !mismatch ? { final_net: totals.final_net } : totals, categories: [] };
  }
};
const store = {
  STORES: { partners: 'partners', settlements: 'settlements' },
  async getAll(name) { return name === 'partners' ? JSON.parse(JSON.stringify(state.partners)) : []; },
  async get(name, id) { return name === 'settlements' ? JSON.parse(JSON.stringify(state.settlements[id] || null)) : null; }
};
const runtime = {
  async compareAndSave(input) {
    const id = `scope:${input.partner_id}:${input.business_date}:${input.region}`;
    if (state.failScope === id) throw new Error('SIMULATED_SAVE_FAILURE');
    const settlement = state.settlements[id];
    if (!settlement) throw new Error('SETTLEMENT_SCOPE_NOT_FOUND');
    const comparison = shadow.compareSettlement(settlement, input.reference_snapshot);
    state.writes.push(JSON.parse(JSON.stringify(input)));
    return { comparison };
  }
};

const ctx = { console, globalThis: null, KTS_SETTLEMENT_STORE: store, KTS_SETTLEMENT_SHADOW_RUNTIME: runtime, KTS_SETTLEMENT_SHADOW: shadow };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('app/settlement-shadow-batch.js', 'utf8'), ctx, { filename: 'settlement-shadow-batch.js' });
const B = ctx.KTS_SETTLEMENT_SHADOW_BATCH;

(async () => {
  assert.strictEqual(B.version, 'settlement-shadow-batch-v2-stale-guard');

  const tsv = [
    'business_date\tpartner\tregion\txac\tqua_co\tpayout\thoi\tfinal',
    '2026-09-22\tHiền\tmn\t288\t218.88\t4650\t0\t-4431.12',
    '2026-09-22\tp-truc\tmb\t148\t112.48\t9125\t0\t9011.52'
  ].join('\n');
  const parsed = B.parseInput(tsv);
  assert.strictEqual(parsed.length, 2);
  assert.strictEqual(parsed[0]._row, 2);
  assert.strictEqual(parsed[0].partner, 'Hiền');

  const preview = await B.preview(tsv);
  assert.strictEqual(preview.format, 'kts-shadow-batch-preview-v2-stale-guard');
  assert.strictEqual(preview.ready, true);
  assert.strictEqual(preview.counts.total, 2);
  assert.strictEqual(preview.counts.exact, 1);
  assert.strictEqual(preview.counts.mismatch, 1);
  assert.strictEqual(preview.rows[0].partner_id, 'p-hien');
  assert.strictEqual(preview.rows[0].reference_snapshot.totals.qua_co, '218.88');
  assert.strictEqual(preview.rows[1].comparison.status, 'MISMATCH');
  assert(preview.rows[0].settlement_fingerprint);
  assert.strictEqual(state.writes.length, 0, 'preview must not persist comparisons');

  state.unsafe = true;
  const unsafePreview = await B.preview(tsv);
  assert.strictEqual(unsafePreview.rows[0].comparison.status, 'MATCH_EXACT');
  assert.strictEqual(unsafePreview.rows[0].comparison.safe_to_promote, false);
  assert.strictEqual(unsafePreview.counts.exact, 0, 'unsafe exact status must not count as exact');
  assert.strictEqual(unsafePreview.counts.incomplete, 1);
  assert.strictEqual(B.displayComparisonStatus(unsafePreview.rows[0].comparison), 'INCOMPLETE_REFERENCE');
  state.unsafe = false;

  // A forged promotion flag cannot convert an incomplete four-total proof into an exact badge.
  state.forged = true;
  const forgedPreview = await B.preview(tsv);
  assert.strictEqual(forgedPreview.rows[0].comparison.status, 'MATCH_EXACT');
  assert.strictEqual(forgedPreview.rows[0].comparison.safe_to_promote, true);
  assert.strictEqual(forgedPreview.counts.exact, 0);
  assert.strictEqual(forgedPreview.counts.incomplete, 1);
  assert.strictEqual(B.displayComparisonStatus(forgedPreview.rows[0].comparison), 'INCOMPLETE_REFERENCE');
  const forgedApplied = await B.apply(forgedPreview);
  assert.strictEqual(forgedApplied.exact, 0);
  assert.strictEqual(forgedApplied.incomplete, 1);
  assert.strictEqual(forgedApplied.results[0].comparison_status, 'INCOMPLETE_REFERENCE');
  assert.strictEqual(forgedApplied.results[0].safe_to_promote, false);
  state.writes.length = 0; // Reset isolated synthetic writes before normal-path assertions.
  state.forged = false;
  // Malformed exact evidence cannot be promoted simply by setting safe_to_promote=true.
  const real = (await B.preview(tsv)).rows[0].comparison;
  for (const broken of [
    {...real, exact: false},
    {...real, required_totals_exact: false},
    {...real, compared_fields: 1},
    {...real, totals: {...real.totals, total_xac: {status:'MATCH_EXACT',local:[],reference:288}}},
    {...real, totals: {...real.totals, final_net: {status:'MATCH_EXACT',local:10}}}
  ]) {
    assert.strictEqual(B.exactProofUsable(broken), false);
    assert.strictEqual(B.displayComparisonStatus(broken), 'INCOMPLETE_REFERENCE');
  }

  const applied = await B.apply(preview);
  assert.strictEqual(applied.format, 'kts-shadow-batch-apply-v2-stale-guard');
  assert.strictEqual(applied.total, 2);
  assert.strictEqual(applied.exact, 1);
  assert.strictEqual(applied.mismatch, 1);
  assert.strictEqual(state.writes.length, 2);
  assert.strictEqual(state.writes[0].trigger, 'BATCH_COMPARE');
  assert.strictEqual(state.writes[0].reason, 'operator:shadow-batch');
  assert.strictEqual(state.writes[0].reference_snapshot.source, 'HIOSKT_BATCH');

  const jsonPreview = await B.preview(JSON.stringify([{
    business_date: '2026-09-22', partner_name: 'HIỀN', region: 'mn',
    totals: { xac: '288', qua_co: '218.88', payout: '4650', final: '-4431.12' },
    categories: [{ code: 'DAT', xac: 72, qua_co: 54.72, hit_units: 4, payout: 3000 }]
  }]));
  assert.strictEqual(jsonPreview.ready, true);
  assert.strictEqual(jsonPreview.rows[0].reference_snapshot.totals.hoi, '0');
  assert.strictEqual(jsonPreview.rows[0].reference_snapshot.categories.length, 1);

  // An invalid or decorated business date must never silently be truncated into a real scope.
  for (const badDate of ['2026-02-30', '2026-09-22T00:00:00Z', '2026-13-22', '2025-02-29']) {
    const bad = await B.preview(JSON.stringify([{business_date:badDate,partner:'Hiền',region:'mn',
      totals:{xac:'288',qua_co:'218.88',payout:'4650',final:'-4431.12'}}]));
    assert.strictEqual(bad.ready, false, badDate);
    assert(bad.errors[0].error.includes('BATCH_DATE_REQUIRED'), badDate);
  }
  // Arrays/objects/booleans are never valid financial amounts, even if JS String() looks numeric.
  for (const value of [[288], [], {}, true, false]) {
    const bad = await B.preview(JSON.stringify([{business_date:'2026-09-22',partner:'Hiền',region:'mn',
      totals:{xac:value,qua_co:'218.88',payout:'4650',final:'-4431.12'}}]));
    assert.strictEqual(bad.ready, false);
    assert(bad.errors[0].error.includes('BATCH_TOTAL_INVALID:xac') ||
      bad.errors[0].error.includes('BATCH_TOTAL_REQUIRED:xac'));
  }
  for (const malformedTotals of [[1,2], 'not-an-object']) {
    const bad = await B.preview(JSON.stringify([{business_date:'2026-09-22',partner:'Hiền',region:'mn',
      totals:malformedTotals,xac:'288',qua_co:'218.88',payout:'4650',final:'-4431.12'}]));
    assert.strictEqual(bad.ready, false);
    assert(bad.errors[0].error.includes('BATCH_TOTALS_OBJECT_REQUIRED'));
  }

  const duplicate = await B.preview([
    'business_date\tpartner\tregion\txac\tqua_co\tpayout\tfinal',
    '2026-09-22\tHiền\tmn\t288\t218.88\t4650\t-4431.12',
    '2026-09-22\tp-hien\tmn\t288\t218.88\t4650\t-4431.12'
  ].join('\n'));
  assert.strictEqual(duplicate.ready, false);
  assert.strictEqual(duplicate.errors.length, 1);
  assert(duplicate.errors[0].error.includes('BATCH_SCOPE_DUPLICATE'));

  const blocked = await B.preview([
    'business_date\tpartner\tregion\txac\tqua_co\tpayout\tfinal',
    '2026-09-23\tHiền\tmn\t1\t1\t0\t1'
  ].join('\n'));
  assert.strictEqual(blocked.ready, false);
  assert(blocked.errors[0].error.includes('BATCH_SETTLEMENT_BLOCKED'));
  await assert.rejects(() => B.apply(blocked), /BATCH_PREVIEW_REQUIRED/);

  const unknown = await B.preview([
    'business_date\tpartner\tregion\txac\tqua_co\tpayout\tfinal',
    '2026-09-22\tKhông Có\tmn\t1\t1\t0\t1'
  ].join('\n'));
  assert.strictEqual(unknown.ready, false);
  assert(unknown.errors[0].error.includes('BATCH_PARTNER_NOT_FOUND'));

  await assert.rejects(() => B.preview([
    'business_date\tpartner\tregion\txac\tqua_co\tpayout\tfinal',
    '2026-09-22\tHiền\tmn\t288\t218,88\t4650\t-4431.12'
  ].join('\n')).then(r => { if (r.ready) throw new Error('expected invalid comma'); else throw new Error(r.errors[0].error); }), /BATCH_DECIMAL_COMMA_UNSUPPORTED/);

  // KQXS/config/tin may recalculate money while the operator is reviewing preview.
  // No row may be written until every scope still matches the preview fingerprint.
  const stale = await B.preview(tsv);
  const writesBeforeStale = state.writes.length;
  state.settlements['scope:p-truc:2026-09-22:mb'].settlement_result.final_net = 9000;
  await assert.rejects(() => B.apply(stale), /BATCH_PREVIEW_STALE_SCOPE:scope:p-truc:2026-09-22:mb/);
  assert.strictEqual(state.writes.length, writesBeforeStale, 'stale preflight must reject before first write');
  state.settlements['scope:p-truc:2026-09-22:mb'].settlement_result.final_net = 9012.52;

  // Unexpected persistence failures after preflight cannot be rolled back by this module;
  // they must be surfaced explicitly as PARTIAL rather than pretending the whole batch succeeded.
  const partial = await B.preview(tsv);
  const writesBeforePartial = state.writes.length;
  state.failScope = 'scope:p-truc:2026-09-22:mb';
  let partialError = null;
  try { await B.apply(partial); } catch (error) { partialError = error; }
  assert(partialError);
  assert(String(partialError.message).includes('BATCH_APPLY_PARTIAL:1/2:SIMULATED_SAVE_FAILURE'));
  assert.strictEqual(partialError.failed_scope_id, 'scope:p-truc:2026-09-22:mb');
  assert.strictEqual(partialError.applied_results.length, 1);
  assert.strictEqual(state.writes.length, writesBeforePartial + 1);
  state.failScope = null;

  console.log('settlement-shadow-batch-tests: PASS');
})().catch(error => { console.error(error); process.exit(1); });
