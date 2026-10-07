'use strict';
const fs=require('fs'),assert=require('assert');
const html=fs.readFileSync('app/settlement.html','utf8');
const ui=fs.readFileSync('app/settlement-ui.js','utf8');
const history=fs.readFileSync('app/settlement-message-history.js','utf8');
const attention=fs.readFileSync('app/settlement-attention-ui.js','utf8');

assert(html.includes('Bảng giá riêng của:'));
assert(html.includes('id="configPartnerName"'));
assert(html.includes('src="./settlement-config-validation.js"'));
assert(ui.includes('configValidation.validate'));
assert(ui.includes('friendlyParserError'));
assert(history.includes('Hệ thống đã đọc:'));
assert(history.includes('canonicalSummary'));
assert(attention.includes("BLOCKED:'CHƯA TÍNH'"));
assert(attention.includes("MISMATCH:'LỆCH ĐỐI SOÁT'"));
assert(!attention.includes("MISMATCH:'LỆCH HIOSKT'"));
assert(!attention.includes('Ưu tiên fail-closed'));
console.log('settlement-commercial-ux-tests: PASS');
