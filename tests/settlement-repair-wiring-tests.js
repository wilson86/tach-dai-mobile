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
assert(repair.includes("format: 'kts-shadow-repair-packet-v2-current-replay'"));
assert(repair.includes("version: 'settlement-repair-workflow-v2-current-replay'"));
assert(repair.includes('replayCase(candidate.case)'));
assert(repair.includes("basis: 'CAPTURED_CANONICAL'"));
assert(repair.includes('TRƯỚC SỬA · MISMATCH'));
assert(repair.includes('ENGINE HIỆN TẠI · MATCH_EXACT'));
assert(repair.includes('không chạy lại parser backend'));
assert(repair.includes('Candidate vẫn giữ nguyên'));
assert(repair.includes('Tin gốc liên quan'));
assert(repair.includes('Config đúng ngày'));
assert(repair.includes('KQXS evidence'));
assert(!repair.includes('saveSettlement('));
assert(!repair.includes('saveConfig('));
assert(!repair.includes('compareAndSave('));
assert(!repair.includes('dismissCandidate('));
assert(!repair.includes('confirmAndPin('));
assert(sw.includes("'./settlement-repair-workflow.js'"));
assert(/const CACHE=\`\$\{CACHE_PREFIX\}v1\.0\.\d+-[^\`]+\`;/.test(sw),'repair wiring requires scope-isolated versioned cache');

console.log('settlement-repair-wiring-tests: PASS');
