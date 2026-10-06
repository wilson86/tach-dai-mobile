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

assert.strictEqual(D.version, 'settlement-report-dashboard-v1');
assert.strictEqual(D.shadowLabel('MATCH_EXACT'), 'KHỚP EXACT');
assert.strictEqual(D.shadowLabel('MISMATCH'), 'LỆCH SHADOW');
assert.strictEqual(D.shadowKind('MATCH_EXACT'), 'ok');
assert.strictEqual(D.shadowKind('MISMATCH'), 'err');
assert.deepStrictEqual(Array.from(D.dayStatus('BLOCKED')), ['CÓ PHẠM VI FAIL-CLOSED','err']);
assert.deepStrictEqual(Array.from(D.dayStatus('PROVISIONAL')), ['CÓ KẾT QUẢ TẠM TÍNH','warn']);
assert(code.includes('Tổng chỉ các đối tác đã khớp exact'));
assert(code.includes('Không dùng tổng này để chốt'));
assert(code.includes('Xem chi tiết'));
assert(code.includes('buildDailyOperationsReport'));

console.log('settlement-report-dashboard-tests: PASS');
