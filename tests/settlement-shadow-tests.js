'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const ctx = { console, globalThis: null };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('app/settlement-shadow.js', 'utf8'), ctx, { filename: 'settlement-shadow.js' });
const S = ctx.KTS_SETTLEMENT_SHADOW;
assert.strictEqual(S.version, 'settlement-shadow-v4-exact-decimal');
assert.strictEqual(S.decimalCanonical('0013.0500'), '13.05');

const local = {
  settlement_result: {
    total_xac: 288,
    total_qua_co: 218.88,
    total_payout: 4650,
    refund_amount: 0,
    final_net: -4431.12,
    exact: {
      total_xac: '288', total_qua_co: '218.88', total_payout: '4650', refund_amount: '0', final_net: '-4431.12'
    }
  },
  category_rows: [
    { code: 'DAT', xac: 72, qua_co: 54.72, hit_units: 4, payout: 3000, exact:{xac:'72',qua_co:'54.72',hit_units:'4',payout:'3000'} },
    { code: 'DAX', xac: 216, qua_co: 164.16, hit_units: 3, payout: 1650, exact:{xac:'216',qua_co:'164.16',hit_units:'3',payout:'1650'} }
  ],
  message_breakdown: [
    { message_id: 'm-dat', category_rows: [{ code: 'DAT', xac: 72, qua_co: 54.72, hit_units: 4, payout: 3000 }] },
    { message_id: 'm-dax', category_rows: [{ code: 'DAX', xac: 216, qua_co: 164.16, hit_units: 3, payout: 1650 }] }
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
assert.strictEqual(exact.totals.final_net.local_exact, '-4431.12');
assert.strictEqual(exact.totals.final_net.reference_exact, '-4431.12');
assert.strictEqual(S.buildMismatchDiagnostics(local, exact).category_issues.length, 0);

const displayOnly = S.compareSettlement(local, { totals: { final: -4431.1 } }, { display_digits: 1 });
assert.strictEqual(displayOnly.status, 'MATCH_DISPLAY_ONLY');
assert.strictEqual(displayOnly.safe_to_promote, false);

const mismatch = S.compareSettlement(local, {
  totals: { xac: 288, qua_co: 219.88, payout: 4650, final: -4430.12 },
  categories: [
    { code: 'DAT', xac: 72, qua_co: 55.72, hit_units: 4, payout: 3000 },
    { code: 'DAX', xac: 216, qua_co: 164.16, hit_units: 3, payout: 1650 }
  ]
});
assert.strictEqual(mismatch.status, 'MISMATCH');
assert.strictEqual(mismatch.safe_to_promote, false);
assert.strictEqual(mismatch.totals.total_qua_co.status, 'MISMATCH');
const diag = S.buildMismatchDiagnostics(local, mismatch);
assert.strictEqual(diag.category_reference_missing, false);
assert.strictEqual(diag.has_actionable_category_issue, true);
assert.strictEqual(diag.category_issues.length, 1);
assert.strictEqual(diag.category_issues[0].code, 'DAT');
assert.deepStrictEqual(Array.from(diag.category_issues[0].message_ids), ['m-dat']);
assert.strictEqual(diag.category_issues[0].fields[0].field, 'qua_co');
assert.strictEqual(diag.category_issues[0].fields[0].delta, -1);
assert(diag.total_issues.some(x => x.field === 'total_qua_co'));

const noCategoryRef = S.compareSettlement(local, { totals: { xac: 288, qua_co: 219.88, final: -4430.12 } });
const noCategoryDiag = S.buildMismatchDiagnostics(local, noCategoryRef);
assert.strictEqual(noCategoryDiag.category_reference_missing, true);
assert.strictEqual(noCategoryDiag.category_issues.length, 0);

const incomplete = S.compareSettlement(local, {});
assert.strictEqual(incomplete.status, 'INCOMPLETE_REFERENCE');
assert.strictEqual(incomplete.safe_to_promote, false);

// Binary floating drift must not downgrade a genuinely exact decimal amount.
{
  const drift = {
    settlement_result: {
      total_xac: 1,
      total_qua_co: 0.30000000000000004,
      total_payout: 0,
      final_net: 0.30000000000000004,
      exact: { total_xac:'1', total_qua_co:'0.3', total_payout:'0', final_net:'0.3' }
    }
  };
  const c = S.compareSettlement(drift, { totals:{ xac:'1.0', qua_co:'0.30', payout:'0', final:'0.300' } });
  assert.strictEqual(c.status, 'MATCH_EXACT');
  assert.strictEqual(c.safe_to_promote, true);
}

// Once exact evidence exists, tolerance must not falsely promote different money.
{
  const almost = {
    settlement_result: {
      total_xac: 1,
      total_qua_co: 1.000000001,
      total_payout: 0,
      final_net: 1.000000001,
      exact: { total_xac:'1', total_qua_co:'1.000000001', total_payout:'0', final_net:'1.000000001' }
    }
  };
  const c = S.compareSettlement(almost, { totals:{ xac:'1', qua_co:'1', payout:'0', final:'1' } }, { tolerance: 1e-8, display_digits: 1 });
  assert.strictEqual(c.status, 'MATCH_DISPLAY_ONLY');
  assert.strictEqual(c.safe_to_promote, false);
  assert.strictEqual(c.totals.total_qua_co.local_exact, '1.000000001');
  assert.strictEqual(c.totals.total_qua_co.reference_exact, '1');
}

console.log('settlement shadow tests PASS');
