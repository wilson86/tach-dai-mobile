'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const ctx = { console, globalThis: null };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('app/settlement-regression-review.js', 'utf8'), ctx, { filename: 'settlement-regression-review.js' });
const R = ctx.KTS_SETTLEMENT_REGRESSION_REVIEW;
assert.strictEqual(R.version, 'settlement-regression-review-v1');

function candidate(id, date, region, role, delta, categories, totals, state) {
  return {
    id,
    state: state || 'pending',
    created_at: `${date}T18:30:00Z`,
    final_delta: String(delta),
    case: {
      partner_role: role,
      scope: { partner_id: id.includes('2') ? 'p2' : 'p1', business_date: date, region },
      expected_comparison: {
        categories: categories || [],
        totals: totals || {}
      }
    }
  };
}

const datMismatch = [{
  code: 'DAT', status: 'MISMATCH', fields: {
    qua_co: { status: 'MISMATCH', delta: 1 },
    payout: { status: 'MISMATCH', delta: -650 },
    xac: { status: 'MATCH_EXACT', delta: 0 }
  }
}];
const bMismatch = [{
  code: '2CB', status: 'MISMATCH', fields: {
    xac: { status: 'MISMATCH', delta: 18 }
  }
}];

const c1 = candidate('c1', '2026-09-22', 'mn', 'customer', -649, datMismatch, { final_net: { status: 'MISMATCH' } });
const c2 = candidate('c2', '2026-09-23', 'mn', 'customer', -650, datMismatch, { final_net: { status: 'MISMATCH' } });
const c3 = candidate('c3', '2026-09-23', 'mb', 'customer', 18, bMismatch, { final_net: { status: 'MISMATCH' } });
const c4 = candidate('c4', '2026-09-24', 'mn', 'owner', 650, datMismatch, { final_net: { status: 'MISMATCH' } });
const dismissed = candidate('c5', '2026-09-25', 'mn', 'customer', 999, datMismatch, {}, 'dismissed');

const shape = R.candidateIssueShape(c1);
assert.strictEqual(shape.region, 'mn');
assert.strictEqual(shape.partner_role, 'customer');
assert.deepStrictEqual(Array.from(shape.categories), ['DAT:payout,qua_co']);
assert(R.signatureForCandidate(c1).includes('mn|customer|CAT=DAT:payout,qua_co'));
assert.strictEqual(R.signatureForCandidate(c1), R.signatureForCandidate(c2));
assert.notStrictEqual(R.signatureForCandidate(c1), R.signatureForCandidate(c3));
assert.notStrictEqual(R.signatureForCandidate(c1), R.signatureForCandidate(c4));

const groups = R.summarizeCandidates([c1, c2, c3, c4, dismissed]);
assert.strictEqual(groups.length, 3);
assert.strictEqual(groups[0].count, 2);
assert.deepStrictEqual(Array.from(groups[0].dates), ['2026-09-22', '2026-09-23']);
assert.strictEqual(groups[0].partners.length, 2);
assert.strictEqual(groups[0].total_abs_delta, 1299);
assert.strictEqual(groups[0].max_abs_delta, 650);
assert.deepStrictEqual(Array.from(groups[0].candidate_ids), ['c1', 'c2']);
assert(!groups.some(g => g.candidate_ids.includes('c5')));

const totalOnly = candidate('c6', '2026-09-26', 'mt', 'customer', 1, [], {
  total_qua_co: { status: 'MISMATCH' },
  total_xac: { status: 'MATCH_EXACT' },
  final_net: { status: 'MATCH_DISPLAY' }
});
const sig = R.signatureForCandidate(totalOnly);
assert(sig.includes('mt|customer|TOTAL=final_net:MATCH_DISPLAY|total_qua_co:MISMATCH'));

console.log('settlement-regression-review-tests: PASS');