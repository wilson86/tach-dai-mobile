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
assert.throws(() => M.mbXacUnits('DAT', { number_count: 3 }), /MB_DAT_REQUIRES_EXACTLY_2_NUMBERS/);
assert.strictEqual(M.mbDatHitUnits(1, 1), 1);
assert.strictEqual(M.mbDatHitUnits(3, 2), 1);
assert.strictEqual(M.mbDatHitUnits(0, 2), 0);
assert.strictEqual(M.mbDatHitUnits(2, 0), 0);
assert.strictEqual(M.mbXacUnits('3CB', { number_count: 1 }), 23);
assert.strictEqual(M.mbXacUnits('3CB7', { number_count: 1 }), 7);
assert.strictEqual(M.mbXacUnits('4C', { number_count: 1 }), 20);
assert.strictEqual(M.mbXacUnits('3CXC', { number_count: 3, position: 'dau' }), 9);
assert.strictEqual(M.mbXacUnits('3CXC', { number_count: 1, position: 'duoi' }), 1);

// Target KTS business rule: MB đá is straight-only, so the 92-61 pair
// contributes one hit unit even when the underlying lô numbers repeat.
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
  assert.strictEqual(r.total_payout, 8475);
  assert(Math.abs(r.final_net - (-8362.52)) < 1e-9);
  assert.strictEqual(E.display1(r.final_net), '-8362.5');
}

assert.deepStrictEqual(Array.from(M.mbSelectors('2CB')), ['G7:*', 'G6:*', 'G5:*', 'G4:*', 'G3:*', 'G2:*', 'G1:*', 'DB:*']);
assert.deepStrictEqual(Array.from(M.mbSelectors('2CD', { position: 'dau' })), ['G7:*']);
assert.deepStrictEqual(Array.from(M.mbSelectors('2CD', { position: 'duoi' })), ['DB:0']);
assert.deepStrictEqual(Array.from(M.mbSelectors('2CB8')), ['G6:*', 'G7:*', 'DB:0']);
assert.deepStrictEqual(Array.from(M.mbSelectors('3CB')), ['G6:*', 'G5:*', 'G4:*', 'G3:*', 'G2:*', 'G1:*', 'DB:*']);
assert.deepStrictEqual(Array.from(M.mbSelectors('3CB7')), ['G6:*', 'G5:3', 'G5:4', 'G5:5', 'DB:0']);
assert.deepStrictEqual(Array.from(M.mbSelectors('3CXC', { position: 'dau' })), ['G6:*']);
assert.deepStrictEqual(Array.from(M.mbSelectors('3CXC', { position: 'duoi' })), ['DB:0']);
assert.deepStrictEqual(Array.from(M.mbSelectors('4C')), ['G5:*', 'G4:*', 'G3:*', 'G2:*', 'G1:*', 'DB:*']);
assert.throws(() => M.mbXacUnits('3CXC', {}), /UNVERIFIED_MB_3CXC_POSITION/);

console.log('settlement-mb-oracle-tests: PASS');
