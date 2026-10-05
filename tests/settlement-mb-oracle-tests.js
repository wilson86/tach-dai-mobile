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
assert.strictEqual(M.mbXacUnits('3CB', { number_count: 1 }), 23);
assert.strictEqual(M.mbXacUnits('3CB7', { number_count: 1 }), 7);
assert.strictEqual(M.mbXacUnits('4C', { number_count: 1 }), 20);

{
  const r = E.settle([
    row('MB_2CB', 27, 3, 75),
    row('MB_2CD', 5, 1, 75),
    row('MB_2CB8', 8, 1, 75),
    row('MB_DAT', 54, 2, 650),
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
assert.deepStrictEqual(Array.from(M.mbSelectors('3CB')), ['G6:*', 'G5:*', 'G4:*', 'G3:*', 'G2:*', 'G1:*', 'DB:*']);
assert.deepStrictEqual(Array.from(M.mbSelectors('4C')), ['G5:*', 'G4:*', 'G3:*', 'G2:*', 'G1:*', 'DB:*']);

for (const code of ['2CD', '2CB8', '3CB7', '3CXC']) {
  assert.throws(() => M.mbSelectors(code), /UNVERIFIED_MB_SELECTOR_CATEGORY/);
}

console.log('settlement-mb-oracle-tests: PASS');
