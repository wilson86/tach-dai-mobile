'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const sandbox = { globalThis: {} };
vm.createContext(sandbox);
for (const file of [
  'settlement-engine.js',
  'settlement-feature-gates.js',
  'settlement-research-defaults.js',
  'settlement-runtime.js'
]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app', file), 'utf8'), sandbox);
}
const R = sandbox.globalThis.KTS_SETTLEMENT_RUNTIME;

const baseConfig = { total_percent: 100, refund_percent: 0, mb_xien_234: false, tinh_ui: false };
const regionalConfig = Object.assign({}, baseConfig, { region_terms: { mn:{total_percent:'80',refund_percent:'10'}, mt:{total_percent:'50',refund_percent:'0'}, mb:{total_percent:'25',refund_percent:'0'} } });
assert.strictEqual(R.regionTerms(regionalConfig,'mn').total_percent,'80');
assert.strictEqual(R.regionTerms(regionalConfig,'mt').total_percent,'50');
assert.strictEqual(R.regionTerms(regionalConfig,'mb').total_percent,'25');

assert.throws(
  () => R.mbXienCategoryWithConfig(2, 1, 1, 56, 1000, baseConfig),
  /MB_XIEN_234_NOT_ALLOWED/
);
const x2 = R.mbXienCategoryWithConfig(2, 1, 1, 56, 1000, Object.assign({}, baseConfig, { mb_xien_234: true }));
assert.strictEqual(x2.code, 'MB_XIEN2');
assert.strictEqual(x2.qua_co, 56);
assert.strictEqual(x2.payout, 1000);

assert.strictEqual(R.uiPayoutRowWithConfig(4, 10, baseConfig), null);
assert.strictEqual(
  R.uiPayoutRowWithConfig(4, 10, Object.assign({}, baseConfig, { tinh_ui: true })),
  null,
  'legacy/config true must not unlock unconfirmed UI'
);

const settledNoUi = R.settleWithConfig([
  { code: '2CB', xac: 18, commission_value: 0.76, commission_type: 'ratio', hit_units: 0, win_rate: 75 },
  { code: 'UI', xac: 0, commission_value: 0, commission_type: 'ratio', hit_units: 4, win_rate: 10 }
], { partner_role: 'customer', config_snapshot: baseConfig });
assert.strictEqual(settledNoUi.total_payout, 0);
assert.strictEqual(settledNoUi.final_net, 13.68);

const settledLegacyUi = R.settleWithConfig([
  { code: '2CB', xac: 18, commission_value: 0.76, commission_type: 'ratio', hit_units: 0, win_rate: 75 },
  { code: 'UI', xac: 0, commission_value: 0, commission_type: 'ratio', hit_units: 4, win_rate: 10 }
], { partner_role: 'customer', config_snapshot: Object.assign({}, baseConfig, { tinh_ui: true }) });
assert.strictEqual(settledLegacyUi.total_payout, 0, 'legacy/config true must keep UI payout fail-closed');
assert.strictEqual(settledLegacyUi.final_net, 13.68);

const row = [{ code:'2CB', xac:18, commission_value:0.76, commission_type:'ratio', hit_units:0, win_rate:75 }];
const mnRegional = R.settleWithConfig(row,{partner_role:'customer',config_snapshot:regionalConfig,region:'mn'});
const mtRegional = R.settleWithConfig(row,{partner_role:'customer',config_snapshot:regionalConfig,region:'mt'});
const mbRegional = R.settleWithConfig(row,{partner_role:'customer',config_snapshot:regionalConfig,region:'mb'});
assert(Math.abs(mnRegional.final_net - 9.8496) < 1e-9);
assert(Math.abs(mtRegional.final_net - 6.84) < 1e-9);
assert(Math.abs(mbRegional.final_net - 3.42) < 1e-9);

console.log('settlement-runtime-tests: PASS');
