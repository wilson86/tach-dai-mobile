'use strict';
const fs = require('fs');
const assert = require('assert');

const review = fs.readFileSync('app/settlement-regression-review.js', 'utf8');
const repair = fs.readFileSync('app/settlement-repair-workflow.js', 'utf8');
const sw = fs.readFileSync('app/sw.js', 'utf8');

assert(review.includes("'./settlement-repair-workflow.js'"));
assert(review.includes("new global.CustomEvent('kts:repair-open'"));
assert(review.includes('Mở hồ sơ sửa'));
assert(review.includes('replayCase(kase)'));
assert(repair.includes("format: 'kts-shadow-repair-packet-v1'"));
assert(repair.includes('Tin gốc liên quan'));
assert(repair.includes('Config đúng ngày'));
assert(repair.includes('KQXS evidence'));
assert(repair.includes('Không tự sửa rule hoặc tiền'));
assert(!repair.includes('saveSettlement('));
assert(!repair.includes('saveConfig('));
assert(!repair.includes('compareAndSave('));
assert(sw.includes("'./settlement-repair-workflow.js'"));
assert(sw.includes('v1.0.39-shadow-repair'));

console.log('settlement-repair-wiring-tests: PASS');