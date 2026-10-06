'use strict';
const fs = require('fs');
const assert = require('assert');

const ui = fs.readFileSync('app/settlement-shadow-ui.js', 'utf8');
const runtime = fs.readFileSync('app/settlement-shadow-runtime.js', 'utf8');
const shadow = fs.readFileSync('app/settlement-shadow.js', 'utf8');

assert(ui.includes('Khoanh vùng lệch'));
assert(ui.includes('Tin liên quan'));
assert(ui.includes('Nhập category để hệ thống chỉ đúng loại cược/tin gây lệch'));
assert(ui.includes('runtime.getDiagnostics'));
assert(runtime.includes('getDiagnostics'));
assert(runtime.includes('issue.messages'));
assert(runtime.includes('raw_text'));
assert(shadow.includes('buildMismatchDiagnostics'));
assert(shadow.includes('messageIdsForCategory'));

console.log('settlement-shadow-ui-tests: PASS');
