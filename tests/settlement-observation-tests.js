'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const code = fs.readFileSync(path.join(__dirname, '..', 'app', 'settlement-observation.js'), 'utf8');
const sandbox = { globalThis: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const O = sandbox.globalThis.KTS_SETTLEMENT_OBSERVATION;

function scope(date, region, comparison, extra) {
  return Object.assign({
    id: `scope:p1:${date}:${region}`,
    partner_id: 'p1',
    business_date: date,
    region,
    scope_status: 'complete_unverified',
    comparison_status: comparison,
    settlement_result: { final_net: 1 }
  }, extra || {});
}

{
  const rows = [
    scope('2026-10-01', 'mn', 'MATCH_EXACT'),
    scope('2026-10-01', 'mb', 'MATCH_EXACT'),
    scope('2026-10-02', 'mn', 'MATCH_EXACT'),
    scope('2026-10-02', 'mb', 'MATCH_EXACT'),
    scope('2026-10-03', 'mn', 'MATCH_EXACT')
  ];
  const s = O.buildObservation(rows, { from_date: '2026-10-01', to_date: '2026-10-03', required_observation_days: 3 });
  assert.strictEqual(s.counts.total, 5);
  assert.strictEqual(s.counts.exact, 5);
  assert.strictEqual(s.exact_days, 3);
  assert.strictEqual(s.promotion_ready, true);
  assert.deepStrictEqual(Array.from(s.blockers), []);
}

{
  const rows = [
    scope('2026-10-01', 'mn', 'MATCH_EXACT'),
    scope('2026-10-02', 'mn', 'MATCH_DISPLAY_ONLY'),
    scope('2026-10-03', 'mn', 'MISMATCH'),
    scope('2026-10-04', 'mn', 'unverified'),
    scope('2026-10-05', 'mn', 'MATCH_EXACT', { scope_status: 'provisional' }),
    scope('2026-10-06', 'mn', 'MATCH_EXACT', { scope_status: 'blocked' })
  ];
  const s = O.buildObservation(rows, { required_observation_days: 2 });
  assert.strictEqual(s.counts.exact, 1);
  assert.strictEqual(s.counts.display_only, 1);
  assert.strictEqual(s.counts.mismatch, 1);
  assert.strictEqual(s.counts.unverified, 1);
  assert.strictEqual(s.counts.provisional, 1);
  assert.strictEqual(s.counts.blocked, 1);
  assert.strictEqual(s.promotion_ready, false);
  assert(s.blockers.some(x => x.startsWith('MISMATCH:')));
  assert(s.blockers.some(x => x.startsWith('DISPLAY_ONLY:')));
}

{
  const rows = [scope('2026-10-01', 'mn', 'MATCH_EXACT')];
  const s = O.buildObservation(rows, {});
  assert.strictEqual(s.all_scopes_exact, true);
  assert.strictEqual(s.duration_gate_configured, false);
  assert.strictEqual(s.promotion_ready, false);
  assert(s.blockers.includes('OBSERVATION_DURATION_NOT_CONFIGURED'));
}

{
  const nested = scope('2026-10-01', 'mn', '', {
    comparison_status: '',
    reference_app_snapshot: { comparison: { status: 'MATCH_EXACT' } }
  });
  assert.strictEqual(O.comparisonStatus(nested), 'MATCH_EXACT');
}

assert.throws(() => O.buildObservation([], { from_date: '2026-10-03', to_date: '2026-10-01' }), /DATE_RANGE/);
assert.throws(() => O.buildObservation([], { required_observation_days: -1 }), /REQUIRED_OBSERVATION_DAYS/);

console.log('settlement-observation-tests: PASS');
