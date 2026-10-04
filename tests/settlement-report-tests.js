'use strict';

const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, '..', 'app', 'settlement-report.js'), 'utf8');
const sandbox = { globalThis: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const R = sandbox.globalThis.KTS_SETTLEMENT_REPORT;

const report = R.buildDailyPartnerReport({
  partner: { id: 'hien', name: 'Hiền', role: 'customer' },
  business_date: '2026-10-04',
  messages_by_id: {
    m1: { raw_text: 'tg 75 b 1n tg 75 74 dd 1n' },
    m2: { raw_text: 'tg 75 32 da 1n' }
  },
  settlements: [
    {
      id: 's1', partner_id: 'hien', message_id: 'm1', business_date: '2026-10-04', region: 'mn',
      category_rows: [
        { code: '2CB', xac: 18, qua_co: 13.68, hit_units: 2, payout: 150 },
        { code: '2CD', xac: 4, qua_co: 3.04, hit_units: 2, payout: 150 }
      ],
      detail_rows: [
        { station: 'tg', numbers: '75', selector: 'lo', points: 2 },
        { station: 'tg', numbers: '75', selector: 'dau', points: 1 },
        { station: 'tg', numbers: '74', selector: 'duoi', points: 1 }
      ],
      result_snapshot: { total_xac: 22, total_qua_co: 16.72, total_payout: 300, refund_amount: 0, final_net: -283.28 },
      comparison_status: 'match'
    },
    {
      id: 's2', partner_id: 'hien', message_id: 'm2', business_date: '2026-10-04', region: 'mn',
      category_rows: [
        { code: 'DAT', xac: 36, qua_co: 27.36, hit_units: 1.5, payout: 1125 }
      ],
      detail_rows: [
        { station: 'tg', numbers: '32-75', selector: 'dat', points: 1.5 }
      ],
      result_snapshot: { total_xac: 36, total_qua_co: 27.36, total_payout: 1125, refund_amount: 0, final_net: -1097.64 },
      comparison_status: 'unverified'
    }
  ]
});

assert.strictEqual(report.partner.name, 'Hiền');
assert.strictEqual(report.regions.length, 1);
assert.strictEqual(report.regions[0].region, 'mn');
assert.deepStrictEqual(Array.from(report.categories, x => x.code), ['2CB', '2CD', 'DAT']);
assert.strictEqual(report.messages.length, 2);
assert.strictEqual(report.messages[0].detail_rows.length, 3);
assert.strictEqual(report.totals.xac, 58);
assert(Math.abs(report.totals.qua_co - 44.08) < 1e-9);
assert.strictEqual(report.totals.payout, 1425);
assert(Math.abs(report.totals.final_net - (-1380.92)) < 1e-9);
assert.strictEqual(report.totals.direction, 'BU');

console.log('settlement-report-tests: PASS');
