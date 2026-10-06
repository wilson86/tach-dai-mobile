'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const sandbox = { globalThis: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app', 'settlement-engine.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app', 'settlement-mb-rules.js'), 'utf8'), sandbox);

const E = sandbox.globalThis.KTS_SETTLEMENT_ENGINE;
const M = sandbox.globalThis.KTS_SETTLEMENT_MB_RULES;

function row(code, xac, hit_units, win_rate, commission_value = 0.76) {
  return { code, xac, hit_units, win_rate, commission_value, commission_type: 'ratio' };
}

assert.strictEqual(M.mbXacUnits('2CB', { number_count: 1 }), 27);
assert.strictEqual(M.mbXacUnits('2CD', { number_count: 1 }), 5);
assert.strictEqual(M.mbXacUnits('2CB8', { number_count: 1 }), 8);
assert.strictEqual(M.mbXacUnits('DAT', { number_count: 2 }), 54);
assert.strictEqual(M.mbXacUnits('DAT', { number_count: 2, stake: 2 }), 108);
assert.strictEqual(M.mbXacUnits('DAT', { number_count: 3 }), 162);
assert.strictEqual(M.mbXacUnits('DAT', { number_count: 4 }), 324);
assert.throws(() => M.mbXacUnits('DAT', { number_count: 1 }), /MB_DAT_REQUIRES_AT_LEAST_2_NUMBERS/);

// MB đá thẳng has one fixed hit mode: nhiều cặp = min(hitsA, hitsB).
assert.strictEqual(M.mbDatHitUnits(1, 1), 1);
assert.strictEqual(M.mbDatHitUnits(3, 2), 2);
assert.strictEqual(M.mbDatHitUnits(5, 3), 3);
assert.strictEqual(M.mbDatHitUnits(0, 2), 0);
assert.strictEqual(M.mbDatHitUnits(2, 0), 0);

// 92 61 44 da 1n => hidden selected pairs 92-61, 92-44, 61-44.
// If their occurrence counts are 3,2,1 then hit units are 2+1+1 = 4.
assert.strictEqual(M.mbDatTotalHitUnits([3, 2, 1]), 4);
// Only first + third hit => one winning selected pair, one unit.
assert.strictEqual(M.mbDatTotalHitUnits([3, 0, 1]), 1);
assert.strictEqual(M.mbDatTotalHitUnits([0, 0, 1]), 0);
assert.throws(() => M.mbDatTotalHitUnits([1]), /MB_DAT_REQUIRES_AT_LEAST_2_NUMBERS/);

assert.strictEqual(M.mbXacUnits('3CB', { number_count: 1 }), 23);
assert.strictEqual(M.mbXacUnits('3CB7', { number_count: 1 }), 7);
assert.strictEqual(M.mbXacUnits('4C', { number_count: 1 }), 20);
assert.strictEqual(M.mbXacUnits('3CXC', { number_count: 3, position: 'dau' }), 9);
assert.strictEqual(M.mbXacUnits('3CXC', { number_count: 1, position: 'duoi' }), 1);

// 2026-09-22 reference oracle: 92 appeared 3 times, 61 appeared 2 times,
// therefore MB DAT hit units = min(3,2)=2.
{
  const r = E.settle([
    row('MB_2CB', 27, 3, 75),
    row('MB_2CD', 5, 1, 75),
    row('MB_2CB8', 8, 1, 75),
    row('MB_DAT', 54, M.mbDatHitUnits(3, 2), 650),
    row('MB_3CB', 23, 1, 650),
    row('MB_3CB7', 7, 1, 650),
    row('MB_3CXC', 4, 1, 650),
    row('MB_4C', 20, 1, 5500)
  ], { partner_role: 'customer' });

  assert.strictEqual(r.total_xac, 148);
  assert(Math.abs(r.total_qua_co - 112.48) < 1e-9);
  assert.strictEqual(r.total_payout, 9125);
  assert(Math.abs(r.final_net - (-9012.52)) < 1e-9);
  assert.strictEqual(E.display1(r.final_net), '-9012.5');
}

assert.deepStrictEqual(Array.from(M.mbSelectors('2CB')), ['G7:*', 'G6:*', 'G5:*', 'G4:*', 'G3:*', 'G2:*', 'G1:*', 'DB:*']);
// HIOSKT 2026-09-25 detail labels: DB tail is `dau`; G7×4 are `duoi`.
assert.deepStrictEqual(Array.from(M.mbSelectors('2CD', { position: 'dau' })), ['DB:0']);
assert.deepStrictEqual(Array.from(M.mbSelectors('2CD', { position: 'duoi' })), ['G7:*']);
assert.deepStrictEqual(Array.from(M.mbSelectors('2CB8')), ['G6:*', 'G7:*', 'DB:0']);
assert.deepStrictEqual(Array.from(M.mbSelectors('3CB')), ['G6:*', 'G5:*', 'G4:*', 'G3:*', 'G2:*', 'G1:*', 'DB:*']);
assert.deepStrictEqual(Array.from(M.mbSelectors('3CB7')), ['G6:*', 'G5:3', 'G5:4', 'G5:5', 'DB:0']);
assert.deepStrictEqual(Array.from(M.mbSelectors('3CXC', { position: 'dau' })), ['G6:*']);
assert.deepStrictEqual(Array.from(M.mbSelectors('3CXC', { position: 'duoi' })), ['DB:0']);
assert.deepStrictEqual(Array.from(M.mbSelectors('4C')), ['G5:*', 'G4:*', 'G3:*', 'G2:*', 'G1:*', 'DB:*']);
assert.throws(() => M.mbXacUnits('3CXC', {}), /UNVERIFIED_MB_3CXC_POSITION/);

console.log('settlement-mb-oracle-tests: PASS');
