'use strict';

const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const code = fs.readFileSync(require('path').join(__dirname, '..', 'app', 'settlement-engine.js'), 'utf8');
const sandbox = { globalThis: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const E = sandbox.globalThis.KTS_SETTLEMENT_ENGINE;

function row(code, xac, hit_units, win_rate, commission_value = 0.76, commission_type = 'ratio') {
  return { code, xac, hit_units, win_rate, commission_value, commission_type };
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

assert.strictEqual(E.datHitUnits(3, 1, 'one_time'), 1);
assert.strictEqual(E.datHitUnits(3, 1, 'multi_pair'), 1);
assert.strictEqual(E.datHitUnits(3, 1, 'ky_ruoi'), 2);
assert.strictEqual(E.datHitUnits(2, 2, 'one_time'), 1);
assert.strictEqual(E.datHitUnits(2, 2, 'multi_pair'), 2);
assert.strictEqual(E.datHitUnits(2, 2, 'ky_ruoi'), 2);
assert.strictEqual(E.datHitUnits(2, 1, 'ky_ruoi'), 1.5);
assert.strictEqual(E.datHitUnits(0, 3, 'multi_pair'), 0);

assert.strictEqual(E.daxHitUnits([[3, 2], [2, 1], [0, 3]], 'ky_ruoi'), 4);
assert.strictEqual(E.daxHitUnits([[2, 2]], 'one_time'), 1);
assert.strictEqual(E.daxHitUnits([[2, 2]], 'multi_pair'), 2);

{
  const r = E.settle([
    row('DAT', 72, 4, 750),
    row('DAX', 216, 3, 550)
  ], { partner_role: 'customer' });
  assert.strictEqual(r.total_xac, 288);
  assert(Math.abs(r.total_qua_co - 218.88) < 1e-9);
  assert.strictEqual(r.total_payout, 4650);
  assert(Math.abs(r.final_net - (-4431.12)) < 1e-9);
  assert.strictEqual(E.display1(r.final_net), '-4431.1');
}

{
  const r = E.settle([
    row('2CB', 18, 0, 75)
  ], { partner_role: 'customer', total_percent: 80, refund_percent: 5 });
  assert(Math.abs(r.total_qua_co - 13.68) < 1e-9);
  assert(Math.abs(r.gross_net - 13.68) < 1e-9);
  assert(Math.abs(r.refund_amount - 0.5472) < 1e-9);
  assert(Math.abs(r.final_net - 10.3968) < 1e-9);
  assert.strictEqual(E.display1(r.final_net), '10.4');
}

{
  const r = E.settle([
    row('2CB', 18, 0, 75, 10, 'amount')
  ], { partner_role: 'customer' });
  assert.strictEqual(r.total_qua_co, 1.8);
  assert.strictEqual(r.final_net, 1.8);
}

{
  const r = E.settle([
    row('TEST', 10000, 0, 0, 1, 'ratio')
  ], { partner_role: 'owner', refund_percent: 5 });
  assert.strictEqual(r.gross_net, -10000);
  assert.strictEqual(r.refund_amount, 500);
  assert.strictEqual(r.final_net, -9500);
}

assert.strictEqual(E.mnMtXacUnits('2CB', { number_count: 1, stake: 1 }), 18);
assert.strictEqual(E.mnMtXacUnits('2CD', { number_count: 2, stake: 1 }), 4);
assert.strictEqual(E.mnMtXacUnits('2CB7', { number_count: 7, stake: 1 }), 49);
assert.strictEqual(E.mnMtXacUnits('3CB', { number_count: 1, stake: 1 }), 17);
assert.strictEqual(E.mnMtXacUnits('3CB7', { number_count: 10, stake: 1 }), 70);
assert.strictEqual(E.mnMtXacUnits('3CXC', { number_count: 1, stake: 1 }), 2);
assert.strictEqual(E.mnMtXacUnits('4C', { number_count: 1, stake: 1 }), 16);
assert.strictEqual(E.mnMtXacUnits('DAT', { number_count: 3, stake: 1 }), 108);
assert.strictEqual(E.mnMtXacUnits('DAX', { number_count: 2, station_count: 3, stake: 1 }), 216);

assert.deepStrictEqual(Array.from(E.mnMtSelectors('2CB7')), ['G8:0', 'G7:0', 'G6:0', 'G6:1', 'G6:2', 'G5:0', 'DB:0']);
assert.deepStrictEqual(Array.from(E.mnMtSelectors('3CB7')), ['G7:0', 'G6:0', 'G6:1', 'G6:2', 'G5:0', 'G4:0', 'DB:0']);
assert.deepStrictEqual(Array.from(E.mnMtSelectors('2CD')), ['G8:0', 'DB:0']);
assert.deepStrictEqual(Array.from(E.mnMtSelectors('3CXC')), ['G7:0', 'DB:0']);

{
  const r = E.settle([
    row('3CXC', 2, 1, 700)
  ], { partner_role: 'customer' });
  assert.strictEqual(r.total_payout, 700);
  assert(Math.abs(r.final_net - (-698.48)) < 1e-9);
  assert.strictEqual(E.display1(r.final_net), '-698.5');
}

{
  const rows = [
    E.mbXienCategory(2, 1, 1, 56, 1000),
    E.mbXienCategory(3, 1, 1, 52, 4000),
    E.mbXienCategory(4, 1, 1, 45, 10000)
  ];
  const r = E.settle(rows, { partner_role: 'customer' });
  assert.strictEqual(r.total_xac, 3);
  assert.strictEqual(r.total_qua_co, 153);
  assert.strictEqual(r.total_payout, 15000);
  assert.strictEqual(r.final_net, -14847);
}

assert.strictEqual(E.isUiNeighbor(89, 90), true);
assert.strictEqual(E.isUiNeighbor(91, 90), true);
assert.strictEqual(E.isUiNeighbor(36, 37), true);
assert.strictEqual(E.isUiNeighbor(38, 37), true);
assert.strictEqual(E.isUiNeighbor(88, 90), false);

console.log('settlement-engine-tests: PASS');
