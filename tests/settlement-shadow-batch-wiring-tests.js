'use strict';
const fs = require('fs');
const assert = require('assert');

const page = fs.readFileSync('app/settlement.html', 'utf8');
const sw = fs.readFileSync('app/sw.js', 'utf8');
const batch = fs.readFileSync('app/settlement-shadow-batch.js', 'utf8');

assert(page.includes('src="./settlement-shadow-batch.js"'));
assert(page.indexOf('src="./settlement-shadow-runtime.js"') < page.indexOf('src="./settlement-shadow-batch.js"'));
assert(page.indexOf('src="./settlement-shadow.js"') < page.indexOf('src="./settlement-shadow-batch.js"'));
assert(sw.includes("'./settlement-shadow-batch.js'"));
assert(batch.includes('Đối chiếu HIOSKT hàng loạt'));
assert(batch.includes('shadowBatchPreview'));
assert(batch.includes('shadowBatchApply'));
assert(batch.includes("trigger: 'BATCH_COMPARE'"));
assert(batch.includes("source: 'HIOSKT_BATCH'"));
assert(batch.includes('BATCH_SCOPE_DUPLICATE'));
assert(batch.includes('BATCH_DECIMAL_COMMA_UNSUPPORTED'));

console.log('settlement-shadow-batch-wiring-tests: PASS');
