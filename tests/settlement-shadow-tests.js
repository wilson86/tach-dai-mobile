'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const ctx = { console, globalThis: null };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('app/settlement-shadow.js', 'utf8'), ctx, { filename: 'settlement-shadow.js' });
const S = ctx.KTS_SETTLEMENT_SHADOW;

const local = {
  settlement_result: {
    total_xac: 288,
    total_qua_co: 218.88,
    total_payout: 4650,
    refund_amount: 0,
    final_net: -4431.12
  },
  category_rows: [
    { code: 'DAT', xac: 72, qua_co: 54.72, hit_units: 4, payout: 3000 },
    { code: 'DAX', xac: 216, qua_co: 164.16, hit_units: 3, payout: 1650 }
  ]
};

const exact = S.compareSettlement(local, {
  totals: { xac: 288, qua_co: 218.88, payout: 4650, final: -4431.12 },
  categories: [
    { code: 'DAT', xac: 72, qua_co: 54.72, hit_units: 4, payout: 3000 },
    { code: 'DAX', xac: 216, qua_co: 164.16, hit_units: 3, payout: 1650 }
  ]
});
assert.strictEqual(exact.status, 'MATCH_EXACT');
assert.strictEqual(exact.safe_to_promote, true);

const displayOnly = S.compareSettlement(local, { totals: { final: -4431.1 } }, { display_digits: 1 });
assert.strictEqual(displayOnly.status, 'MATCH_DISPLAY_ONLY');
assert.strictEqual(displayOnly.safe_to_promote, false);

const mismatch = S.compareSettlement(local, { totals: { xac: 288, qua_co: 219.88, final: -4430.12 } });
assert.strictEqual(mismatch.status, 'MISMATCH');
assert.strictEqual(mismatch.safe_to_promote, false);
assert.strictEqual(mismatch.totals.total_qua_co.status, 'MISMATCH');

const incomplete = S.compareSettlement(local, {});
assert.strictEqual(incomplete.status, 'INCOMPLETE_REFERENCE');
assert.strictEqual(incomplete.safe_to_promote, false);

console.log('settlement shadow tests PASS');
