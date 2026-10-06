'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const code = fs.readFileSync(path.join(__dirname, '..', 'app', 'settlement-report-dashboard.js'), 'utf8');
const sandbox = { globalThis: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const D = sandbox.globalThis.KTS_SETTLEMENT_REPORT_DASHBOARD;

assert.strictEqual(D.version, 'settlement-report-dashboard-v2');
assert.strictEqual(D.shadowLabel('MATCH_EXACT'), 'KHỚP EXACT');
assert.strictEqual(D.shadowLabel('MISMATCH'), 'LỆCH SHADOW');
assert.strictEqual(D.shadowKind('MATCH_EXACT'), 'ok');
assert.strictEqual(D.shadowKind('MISMATCH'), 'err');
assert.deepStrictEqual(Array.from(D.dayStatus('BLOCKED')), ['CÓ PHẠM VI FAIL-CLOSED','err']);
assert.deepStrictEqual(Array.from(D.dayStatus('PROVISIONAL')), ['CÓ KẾT QUẢ TẠM TÍNH','warn']);
assert.strictEqual(D.direction(5), 'THU');
assert.strictEqual(D.direction(-5), 'BÙ');
assert.strictEqual(D.direction(0), 'HÒA');

const breakdown = D.buildBreakdown({ partners: [
  {
    partner:{ id:'h', role:'customer' }, totals:{ xac:100, qua_co:76, payout:20, refund_amount:1, final_net:55 },
    regions:[{ region:'mn', total_xac:60, total_qua_co:45.6, total_payout:20, refund_amount:1, final_net:24.6 },{ region:'mb', total_xac:40, total_qua_co:30.4, total_payout:0, refund_amount:0, final_net:30.4 }]
  },
  {
    partner:{ id:'t', role:'owner' }, totals:{ xac:50, qua_co:38, payout:80, refund_amount:0, final_net:42 },
    regions:[{ region:'mt', total_xac:50, total_qua_co:38, total_payout:80, refund_amount:0, final_net:42 }]
  }
]});
assert.strictEqual(breakdown.role_totals.customer.xac, 100);
assert.strictEqual(breakdown.role_totals.customer.final_net, 55);
assert.strictEqual(breakdown.role_totals.owner.payout, 80);
assert.strictEqual(breakdown.region_totals.mn.xac, 60);
assert.strictEqual(breakdown.region_totals.mb.final_net, 30.4);
assert.strictEqual(breakdown.region_totals.mt.final_net, 42);
assert(code.includes('Tách Khách / Chủ'));
assert(code.includes('Tách theo miền'));
assert(code.includes('Tổng chỉ các đối tác đã khớp exact'));
assert(code.includes('Không dùng tổng này để chốt'));
assert(code.includes('Xem chi tiết'));
assert(code.includes('buildDailyOperationsReport'));

console.log('settlement-report-dashboard-tests: PASS');
