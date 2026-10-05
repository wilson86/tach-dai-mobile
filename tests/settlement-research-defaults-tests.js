'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const sandbox = { globalThis: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app', 'settlement-engine.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app', 'settlement-research-defaults.js'), 'utf8'), sandbox);

const E = sandbox.globalThis.KTS_SETTLEMENT_ENGINE;
const R = sandbox.globalThis.KTS_SETTLEMENT_RESEARCH_DEFAULTS;

{
  const ui = R.uiPayoutRow(4, 10);
  const result = E.settle([ui], { partner_role: 'customer' });
  assert.strictEqual(result.total_xac, 0);
  assert.strictEqual(result.total_qua_co, 0);
  assert.strictEqual(result.total_payout, 40);
  assert.strictEqual(result.final_net, -40);
}

assert.strictEqual(E.isUiNeighbor(1, 0), true);
assert.strictEqual(E.isUiNeighbor(98, 99), true);
assert.strictEqual(E.isUiNeighbor(99, 0), false);
assert.strictEqual(E.isUiNeighbor(0, 99), false);

assert.strictEqual(R.display1HalfExpand(13.05), '13.1');
assert.strictEqual(R.display1HalfExpand(-13.05), '-13.1');

console.log('settlement-research-defaults-tests: PASS');
