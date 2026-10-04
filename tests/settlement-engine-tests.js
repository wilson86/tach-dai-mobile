'use strict';

const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const code = fs.readFileSync(require('path').join(__dirname, '..', 'app', 'settlement-engine.js'), 'utf8');
const sandbox = { globalThis: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const E = sandbox.globalThis.KTS_SETTLEMENT_ENGINE;

function row(code, xac, hit_units, win_rate, commission_ratio = 0.76) {
  return { code, xac, hit_units, win_rate, commission_ratio };
}

{
  const r = E.settle([
    row('2CB', 18, 2, 75),
    row('2CD', 4, 2, 75),
    row('DAT', 36, 1.5, 750),
    row('DAX', 72, 2, 550),
    row('4C', 16, 1, 5500)
  ], { partner_role: 'customer' });
  assert.strictEqual(r.total_xac, 146);
  assert(Math.abs(r.total_qua_co - 110.96) < 1e-9);
  assert(Math.abs(r.total_payout - 8025) < 1e-9);
  assert(Math.abs(r.final_net - (-7914.04)) < 1e-9);
  assert.strictEqual(r.direction, 'BU');
  assert.strictEqual(E.display1(r.final_net), '-7914');
}

assert.strictEqual(E.datHitUnits(1, 1, 'ky_ruoi'), 1);
assert.strictEqual(E.datHitUnits(2, 1, 'ky_ruoi'), 1.5);
assert.strictEqual(E.datHitUnits(2, 2, 'ky_ruoi'), 2);
assert.strictEqual(E.datHitUnits(3, 1, 'ky_ruoi'), 2);
assert.throws(() => E.datHitUnits(2, 1, 'one_time'), /UNVERIFIED_DAT_MODE/);
assert.throws(() => E.datHitUnits(2, 1, 'multi_pair'), /UNVERIFIED_DAT_MODE/);

{
  const r = E.settle([row('TEST', 647, 0, 0)], { partner_role: 'customer', refund_percent: 5 });
  assert(Math.abs(r.final_net - 467.134) < 1e-9);
}

{
  const r = E.settle([row('TEST', 10000, 0, 0, 1)], { partner_role: 'owner', refund_percent: 5 });
  assert.strictEqual(r.final_net, -9500);
}

console.log('settlement-engine-tests: PASS');
