'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const ctx = { console, globalThis: null };
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const file of ['app/settlement-engine.js', 'app/settlement-mb-rules.js', 'app/settlement-evaluator.js']) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
}

const E = ctx.KTS_SETTLEMENT_EVALUATOR;
const engine = ctx.KTS_SETTLEMENT_ENGINE;
const approx = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

const result = {
  business_date: '2026-09-22', region: 'mb', complete: true,
  stations: [{
    code: 'mb', name: 'Miền Bắc', prizes: {
      DB: ['31922'], G1: ['12361'], G2: ['10001', '20002'],
      G3: ['30003', '40004', '50005', '60006', '70007', '80008'],
      G4: ['90009', '11110', '22211', '33312'],
      G5: ['44592', '55514', '66615', '77716', '88817', '99918'],
      G6: ['192', '319', '561'], G7: ['92', '20', '30', '40']
    }
  }]
};

function priceRow() { return { commission: '0.76', win: '1' }; }
const config = {
  commission_type: 'ratio', total_percent: '100', refund_percent: '0', mb_xien_234: false, tinh_ui: false,
  region_pricing: { mb: {
    '2CB': priceRow(), '2CD': priceRow(), '2CB8': priceRow(), DAT: priceRow(),
    '3CB': priceRow(), '3CB7': priceRow(), '3CDD': priceRow(), '4C': priceRow(), UI: { commission: '0', win: '10' }
  } }
};

const canonical = { region: 'mb', legs: [
  { code: '2CB', values: ['92'], stake: '1' },
  { code: '2CD', values: ['92'], stake: '1' },
  { code: '2CB8', values: ['92'], stake: '1' },
  { code: 'DAT', values: ['92', '61'], stake: '1' },
  { code: '3CB', values: ['922'], stake: '1' },
  { code: '3CB7', values: ['922'], stake: '1' },
  { code: '3CXC', position: 'dau', values: ['319'], stake: '1' },
  { code: '3CXC', position: 'duoi', values: ['922'], stake: '1' },
  { code: '4C', values: ['1922'], stake: '1' }
] };

const evaluated = E.evaluateCanonicalMessage({ canonical_payload: canonical, config_snapshot: config, result_snapshot: result });
assert.strictEqual(evaluated.category_inputs.length, 9);
const settled = engine.settle(evaluated.category_inputs, { partner_role: 'customer', total_percent: 100, refund_percent: 0 });
assert.strictEqual(settled.total_xac, 148);
approx(settled.total_qua_co, 112.48);
// 92 has 3 occurrences and 61 has 2, so MB fixed `nhiều cặp` DAT contributes 2 hits.
assert.strictEqual(settled.total_payout, 13);
assert.ok(evaluated.detail_rows.some(x => x.code === 'DAT' && x.numbers === '92-61' && x.hit_units === 2));
assert.ok(evaluated.detail_rows.some(x => x.code === '3CXC' && x.selector === '3CXC:dau' && x.hit_units === 1));

const dat3 = E.evaluateCanonicalMessage({
  canonical_payload: { region: 'mb', legs: [{ code: 'DAT', values: ['92', '61', '40'], stake: '1' }] },
  config_snapshot: config,
  result_snapshot: result
});
assert.strictEqual(dat3.category_inputs[0].xac, 162);
// Pair hits: 92-61=2, 92-40=1, 61-40=1 => total 4.
assert.strictEqual(dat3.category_inputs[0].hit_units, 4);
assert.strictEqual(dat3.detail_rows.length, 3);

assert.throws(() => E.evaluateCanonicalMessage({ canonical_payload: { region: 'xx', legs: [] }, config_snapshot: config, result_snapshot: result }), /SETTLEMENT_REGION_REQUIRED/);
console.log('settlement evaluator tests PASS');
