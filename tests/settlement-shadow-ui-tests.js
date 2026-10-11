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
assert(ui.includes("const displayStatus = rawStatus === 'MATCH_EXACT' && !safeExact ? 'INCOMPLETE_REFERENCE' : rawStatus;"));
assert(ui.includes("labels[displayStatus]||displayStatus"));
assert(ui.includes('function exactProofUsable(comparison)'));
assert(ui.includes('comparison.compared_fields >= fields.length'));
assert(ui.includes('validMoney(item.local) && validMoney(item.reference)'));
assert(ui.includes('const promotionSafe = exactProofUsable(result.comparison);'));
assert(ui.includes("const savedStatus = result.comparison.status === 'MATCH_EXACT' && !promotionSafe"));
assert(ui.includes('comparison_status: savedStatus'));
assert(!ui.includes("status(result.comparison.safe_to_promote?"), 'raw promotion flag cannot enable green exact confirmation');

console.log('settlement-shadow-ui-tests: PASS');
