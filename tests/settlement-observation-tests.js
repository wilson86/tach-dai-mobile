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
assert.strictEqual(O.version, 'settlement-observation-v5-strict-kqxs-promotion');

function fullPrizes(region,prefix) {
  const counts=region==='mb'?{G7:4,G6:3,G5:6,G4:4,G3:6,G2:2,G1:1,DB:1}:{G8:1,G7:1,G6:3,G5:1,G4:7,G3:2,G2:1,G1:1,DB:1};
  return Object.fromEntries(Object.entries(counts).map(([k,n])=>[k,Array.from({length:n},(_,i)=>String(prefix)+'-'+k+'-'+String(i+1))]));
}
function verifiedKqxs(date,region) {
  const code=region==='mb'?'mb':region==='mt'?'dn':'bt';
  return {
    business_date:date,region,complete:true,coverage_complete:true,verified:true,verification_status:'verified',
    verification_sources:['primary','secondary'],verification_conflicts:[],expected_station_codes:[code],
    stations:[{code,complete:true,prizes:fullPrizes(region,code)}]
  };
}
function scope(date, region, comparison, extra) {
  return Object.assign({
    id: `scope:p1:${date}:${region}`,
    partner_id: 'p1',
    business_date: date,
    region,
    scope_status: 'complete_unverified',
    comparison_status: comparison,
    settlement_result: { final_net: 1 },
    lottery_result_snapshot: verifiedKqxs(date,region)
  }, extra || {});
}
function message(id, date, region, status, partner) {
  return { id, partner_id: partner || 'p1', business_date: date, region, status: status || 'settled_unverified' };
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
  assert.strictEqual(s.regression_gate.enabled, false);
  assert.strictEqual(s.candidate_gate.enabled, false);
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

// KQXS/shadow guard can block via comparison_status while the accounting scope itself remains complete.
{
  const guarded = scope('2026-10-01', 'mb', 'blocked', {
    scope_status: 'complete_unverified',
    blocked_reasons: ['KQXS_SOURCE_CONFLICT']
  });
  assert.strictEqual(O.comparisonStatus(guarded), 'BLOCKED');
  const s = O.buildObservation([guarded], { required_observation_days: 1 });
  assert.strictEqual(s.counts.blocked, 1);
  assert.strictEqual(s.promotion_ready, false);
  assert(s.blockers.includes('BLOCKED:1'));
}

// Metadata saying "verified" is insufficient when prize evidence is incomplete.
{
  const bad = scope('2026-10-01','mn','MATCH_EXACT',{
    lottery_result_snapshot:{
      business_date:'2026-10-01',region:'mn',complete:true,verified:true,verification_status:'verified',
      verification_sources:['primary','secondary'],verification_conflicts:[],expected_station_codes:['bt'],
      stations:[{code:'bt',prizes:{G8:['10']}}]
    }
  });
  const s=O.buildObservation([bad],{required_observation_days:1});
  assert.strictEqual(s.promotion_ready,false);
  assert.strictEqual(s.kqxs_gate.met,false);
  assert.strictEqual(s.kqxs_gate.verified,0);
  assert(s.blockers.some(x=>x.startsWith('KQXS_NOT_FULLY_VERIFIED:')));
  assert.strictEqual(s.scopes[0].result_verification_reason,'KQXS_PRIZE_DATA_INCOMPLETE');
}

// Wrong-date KQXS evidence also cannot contribute an exact observation day.
{
  const bad = scope('2026-10-01','mn','MATCH_EXACT',{
    lottery_result_snapshot:verifiedKqxs('2026-09-30','mn')
  });
  const s=O.buildObservation([bad],{required_observation_days:1});
  assert.strictEqual(s.exact_days,0);
  assert.strictEqual(s.promotion_ready,false);
  assert.strictEqual(s.scopes[0].result_verification_reason,'KQXS_SCOPE_MISMATCH');
}

// A day is not clean if there is an active message scope without a settlement.
{
  const rows = [scope('2026-10-01', 'mn', 'MATCH_EXACT')];
  const messages = [
    message('m1', '2026-10-01', 'mn'),
    message('m2', '2026-10-01', 'mb')
  ];
  const s = O.buildObservation(rows, { required_observation_days: 1, messages });
  assert.strictEqual(s.coverage.enabled, true);
  assert.strictEqual(s.coverage.expected_scopes, 2);
  assert.strictEqual(s.coverage.present_scopes, 1);
  assert.strictEqual(s.coverage.missing_scopes.length, 1);
  assert.strictEqual(s.coverage.missing_scopes[0].region, 'mb');
  assert.strictEqual(s.counts.missing_scopes, 1);
  assert.strictEqual(s.exact_days, 0);
  assert.strictEqual(s.promotion_ready, false);
  assert(s.blockers.includes('MISSING_SCOPE:1'));
}

// Multiple messages in one partner/date/region still form one expected scope.
{
  const rows = [scope('2026-10-01', 'mn', 'MATCH_EXACT')];
  const messages = [message('m1', '2026-10-01', 'mn'), message('m2', '2026-10-01', 'mn')];
  const s = O.buildObservation(rows, { required_observation_days: 1, messages });
  assert.strictEqual(s.coverage.expected_scopes, 1);
  assert.strictEqual(s.coverage.missing_scopes.length, 0);
  assert.strictEqual(s.exact_days, 1);
  assert.strictEqual(s.promotion_ready, true);
}

// Cancelled-only scopes and stale empty settlements do not poison qualification.
{
  const rows = [
    scope('2026-10-01', 'mn', 'MATCH_EXACT'),
    scope('2026-10-01', 'mb', 'empty', { scope_status: 'empty', settlement_result: { final_net: 0 } })
  ];
  const messages = [message('m1', '2026-10-01', 'mn'), message('m2', '2026-10-01', 'mb', 'cancelled')];
  const s = O.buildObservation(rows, { required_observation_days: 1, messages });
  assert.strictEqual(s.counts.total, 1);
  assert.strictEqual(s.coverage.expected_scopes, 1);
  assert.strictEqual(s.coverage.missing_scopes.length, 0);
  assert.strictEqual(s.promotion_ready, true);
}

// Local pinned regression failures block promotion even when all shadow scopes are exact.
{
  const rows = [scope('2026-10-01', 'mn', 'MATCH_EXACT')];
  const s = O.buildObservation(rows, {
    required_observation_days: 1,
    regression_summary: { total: 3, passed: 2, failed: 1 }
  });
  assert.strictEqual(s.all_scopes_exact, true);
  assert.strictEqual(s.duration_gate_met, true);
  assert.strictEqual(s.regression_gate.enabled, true);
  assert.strictEqual(s.regression_gate.met, false);
  assert.strictEqual(s.promotion_ready, false);
  assert(s.blockers.includes('REGRESSION_FAILED:1/3'));
}

// Passing pinned regressions do not block a clean shadow window.
{
  const rows = [scope('2026-10-01', 'mn', 'MATCH_EXACT')];
  const s = O.buildObservation(rows, {
    required_observation_days: 1,
    regression_summary: { total: 2, passed: 2, failed: 0 }
  });
  assert.strictEqual(s.regression_gate.enabled, true);
  assert.strictEqual(s.regression_gate.met, true);
  assert.strictEqual(s.promotion_ready, true);
}

// An unexplained historical mismatch candidate blocks promotion until it is reviewed.
{
  const rows = [scope('2026-10-01', 'mn', 'MATCH_EXACT')];
  const s = O.buildObservation(rows, {
    required_observation_days: 1,
    regression_summary: { total: 1, passed: 1, failed: 0 },
    candidate_summary: { pending: 1, promoted: 0, dismissed: 0 }
  });
  assert.strictEqual(s.all_scopes_exact, true);
  assert.strictEqual(s.candidate_gate.enabled, true);
  assert.strictEqual(s.candidate_gate.met, false);
  assert.strictEqual(s.candidate_gate.pending, 1);
  assert.strictEqual(s.promotion_ready, false);
  assert(s.blockers.includes('REGRESSION_CANDIDATE_PENDING:1'));
}

// Reviewed candidates no longer block; promoted cases are then governed by regression replay.
{
  const rows = [scope('2026-10-01', 'mn', 'MATCH_EXACT')];
  const s = O.buildObservation(rows, {
    required_observation_days: 1,
    regression_summary: { total: 1, passed: 1, failed: 0 },
    candidate_summary: { pending: 0, promoted: 1, dismissed: 1 }
  });
  assert.strictEqual(s.candidate_gate.enabled, true);
  assert.strictEqual(s.candidate_gate.met, true);
  assert.strictEqual(s.promotion_ready, true);
}

assert.throws(() => O.buildObservation([], { from_date: '2026-10-03', to_date: '2026-10-01' }), /DATE_RANGE/);
assert.throws(() => O.buildObservation([], { required_observation_days: -1 }), /REQUIRED_OBSERVATION_DAYS/);
assert.throws(() => O.buildObservation([], { regression_summary: { total: 1, passed: 1, failed: 1 } }), /INVALID_REGRESSION_SUMMARY/);
assert.throws(() => O.buildObservation([], { candidate_summary: { pending: -1 } }), /INVALID_REGRESSION_CANDIDATE_SUMMARY/);

console.log('settlement-observation-tests: PASS');
