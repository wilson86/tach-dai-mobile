'use strict';
const fs = require('fs');
const assert = require('assert');

const page = fs.readFileSync('app/settlement.html', 'utf8');
const sw = fs.readFileSync('app/sw.js', 'utf8');
const candidates = fs.readFileSync('app/settlement-regression-candidates.js', 'utf8');

assert(page.includes('src="./settlement-regression-candidates.js"'));
assert(page.indexOf('src="./settlement-regression-cases.js"') < page.indexOf('src="./settlement-regression-candidates.js"'));
assert(page.indexOf('src="./settlement-shadow-batch.js"') < page.indexOf('src="./settlement-regression-candidates.js"'));
assert(sw.includes("'./settlement-regression-candidates.js'"));
assert(candidates.includes('Regression candidate · chờ xác nhận'));
assert(candidates.includes('không tự trở thành golden'));
assert(candidates.includes('reference_confirmed !== true'));
assert(candidates.includes("global.addEventListener('kts:shadow-saved'"));
assert(candidates.includes('confirmAndPin'));
assert(candidates.includes('dismissCandidate'));

console.log('settlement-regression-candidates-wiring-tests: PASS');
