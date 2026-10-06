'use strict';
const fs = require('fs');
const assert = require('assert');

const page = fs.readFileSync('app/settlement.html', 'utf8');
const sw = fs.readFileSync('app/sw.js', 'utf8');
const review = fs.readFileSync('app/settlement-regression-review.js', 'utf8');

assert(page.includes('src="./settlement-regression-candidates.js"'));
assert(page.includes('src="./settlement-regression-review.js"'));
assert(page.indexOf('src="./settlement-regression-candidates.js"') < page.indexOf('src="./settlement-regression-review.js"'));
assert(sw.includes("'./settlement-regression-review.js'"));
assert(review.includes('Nhóm mismatch cần fix'));
assert(review.includes('summarizeCandidates'));
assert(review.includes('kts:regression-candidates-changed'));
assert(review.includes('không tự ghim golden') || review.includes('không tự trở thành golden'));

console.log('settlement-regression-review-wiring-tests: PASS');