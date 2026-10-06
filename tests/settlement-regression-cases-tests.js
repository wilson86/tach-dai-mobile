'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const ctx = { console, globalThis: null };
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const file of [
  'app/settlement-engine.js',
  'app/settlement-mb-rules.js',
  'app/settlement-evaluator.js',
  'app/settlement-shadow.js',
  'app/settlement-regression-cases.js'
]) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename:file });

const R = ctx.KTS_SETTLEMENT_REGRESSION_CASES;
assert.strictEqual(R.version, 'settlement-regression-cases-v1');

const result = {
  business_date:'2026-09-22', region:'mb', complete:true,
  stations:[{code:'mb',prizes:{
    DB:['31922'], G1:['12361'], G2:['10001','20002'],
    G3:['30003','40004','50005','60006','70007','80008'],
    G4:['90009','11110','22211','33312'],
    G5:['44592','55514','66615','77716','88817','99918'],
    G6:['192','319','561'], G7:['92','20','30','40']
  }}]
};
const config = {
  commission_type:'ratio', total_percent:'100', refund_percent:'0', mb_xien_234:false, tinh_ui:false,
  region_pricing:{mb:{DAT:{commission:'0.76',win:'650'}}}
};
const good = {
  format:'kts-shadow-regression-case-v1',
  id:'regression:mb-dat-3-number',
  scope:{scope_id:'scope:p1:2026-09-22:mb',partner_id:'p1',business_date:'2026-09-22',region:'mb'},
  partner_role:'customer',
  config_snapshot:config,
  lottery_result_snapshot:result,
  messages:[{id:'m1',raw_text:'92 61 40 da 1n',status:'settled_unverified',canonical_payload:{region:'mb',legs:[{code:'DAT',values:['92','61','40'],stake:'1'}]}}],
  expected_reference:{source:'CONFIRMED_RULE',totals:{xac:162,qua_co:123.12,payout:2600,final:-2476.88},categories:[{code:'DAT',xac:162,qua_co:123.12,hit_units:4,payout:2600}]}
};

const replay = R.replayCase(good);
assert.strictEqual(replay.pass, true);
assert.strictEqual(replay.comparison.status, 'MATCH_EXACT');
assert.strictEqual(replay.comparison.safe_to_promote, true);
assert.strictEqual(replay.settlement.settlement_result.total_xac, 162);
assert(Math.abs(replay.settlement.settlement_result.total_qua_co - 123.12) < 1e-9);
assert.strictEqual(replay.settlement.settlement_result.total_payout, 2600);
assert(Math.abs(replay.settlement.settlement_result.final_net - (-2476.88)) < 1e-9);
assert.strictEqual(replay.settlement.category_rows[0].hit_units, 4);

const bad = JSON.parse(JSON.stringify(good));
bad.expected_reference.totals.final = -2470;
const mismatch = R.replayCase(bad);
assert.strictEqual(mismatch.pass, false);
assert.strictEqual(mismatch.comparison.status, 'MISMATCH');

const noRole = JSON.parse(JSON.stringify(good));
delete noRole.partner_role;
assert.throws(() => R.replayCase(noRole), /REGRESSION_PARTNER_ROLE_REQUIRED/);

const missingReference = JSON.parse(JSON.stringify(good));
delete missingReference.expected_reference.totals.payout;
assert.throws(() => R.replayCase(missingReference), /REGRESSION_REFERENCE_REQUIRED:payout/);

const bundle = R.exportBundle([good]);
assert.strictEqual(bundle.format, 'kts-shadow-regression-bundle-v1');
assert.strictEqual(bundle.cases.length, 1);
assert.strictEqual(bundle.cases[0].id, 'regression:mb-dat-3-number');

console.log('settlement-regression-cases-tests: PASS');
