'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const sandbox = { globalThis: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app', 'settlement-feature-gates.js'), 'utf8'), sandbox);
const G = sandbox.globalThis.KTS_SETTLEMENT_FEATURE_GATES;

assert.strictEqual(G.UI_CONFIRMED, false);
assert.strictEqual(G.uiEnabled({ tinh_ui: false }), false);
assert.strictEqual(G.uiEnabled({ tinh_ui: true }), false, 'imported/legacy true must not unlock unconfirmed UI');
assert.strictEqual(G.materializeUiRow({ code: 'UI', hit_units: 4, payout: 40 }, { tinh_ui: false }), null);
assert.strictEqual(G.materializeUiRow({ code: 'UI', hit_units: 4, payout: 40 }, { tinh_ui: true }), null);

assert.throws(
  () => G.assertCategoryAllowed('MB_XIEN2', { mb_xien_234: false }),
  /MB_XIEN_234_NOT_ALLOWED/
);
assert.throws(
  () => G.assertCategoryAllowed('MB_XIEN4', {}),
  /MB_XIEN_234_NOT_ALLOWED/
);
assert.strictEqual(G.assertCategoryAllowed('MB_XIEN3', { mb_xien_234: true }), true);
assert.strictEqual(G.assertCategoryAllowed('2CB', { mb_xien_234: false }), true);

const guarded = G.guardCategoryRows([
  { code: '2CB', xac: 18 },
  { code: 'UI', hit_units: 4, payout: 40 }
], { tinh_ui: false, mb_xien_234: false });
assert.deepStrictEqual(Array.from(guarded, x => x.code), ['2CB']);

const guardedLegacyUi = G.guardCategoryRows([
  { code: '2CB', xac: 18 },
  { code: 'UI', hit_units: 4, payout: 40 }
], { tinh_ui: true, mb_xien_234: false });
assert.deepStrictEqual(Array.from(guardedLegacyUi, x => x.code), ['2CB'], 'legacy true must remain fail-closed');

assert.throws(
  () => G.guardCategoryRows([{ code: 'MB_XIEN2', xac: 1 }], { mb_xien_234: false }),
  /MB_XIEN_234_NOT_ALLOWED/
);

console.log('settlement-feature-gates-tests: PASS');
