'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const code = fs.readFileSync('app/settlement-scope-sync.js', 'utf8');
const ctx = { console, globalThis: null };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(code, ctx, { filename: 'settlement-scope-sync.js' });
const S = ctx.KTS_SETTLEMENT_SCOPE_SYNC;

assert.strictEqual(S.version, 'settlement-scope-sync-v1');
assert.strictEqual(S.normalizeDate('2026-10-06'), '2026-10-06');
assert.strictEqual(S.normalizeDate('06/10/2026'), '');
assert.strictEqual(S.normalizeRegion('MB'), 'mb');
assert.strictEqual(S.normalizeRegion('xx'), '');

const live = S.buildSyncPlan({ partner_id: 'p1', business_date: '2026-09-22', region: 'mb', result_mode: 'realtime' });
assert.strictEqual(live.report_partner_id, 'p1');
assert.strictEqual(live.report_date, '2026-09-22');
assert.strictEqual(live.shadow_region, 'mb');
assert.strictEqual(live.result_scope, null, 'realtime KQXS must not be moved to a historical message date');

const historical = S.buildSyncPlan({ partner_id: 'p1', business_date: '2026-09-22', region: 'mn', result_mode: 'date' });
assert.strictEqual(historical.result_scope.business_date, '2026-09-22');
assert.strictEqual(historical.result_scope.region, 'mn');

const invalid = S.buildSyncPlan({ partner_id: 'p1', business_date: 'bad', region: 'xx', result_mode: 'date' });
assert.strictEqual(invalid.result_scope, null);

console.log('settlement-scope-sync-tests: PASS');
