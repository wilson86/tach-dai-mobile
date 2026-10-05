'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const app = path.join(__dirname, '..', 'app');
const page = fs.readFileSync(path.join(app, 'settlement.html'), 'utf8');
const ui = fs.readFileSync(path.join(app, 'settlement-ui.js'), 'utf8');
const provider = fs.readFileSync(path.join(app, 'result-provider.js'), 'utf8');
const parserProvider = fs.readFileSync(path.join(app, 'settlement-parser-provider.js'), 'utf8');
const pipeline = fs.readFileSync(path.join(app, 'settlement-pipeline.js'), 'utf8');
const index = fs.readFileSync(path.join(app, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(app, 'sw.js'), 'utf8');

assert(page.includes('id="allowMbXien" type="checkbox"'));
assert(page.includes('id="allowUi" type="checkbox"'));
assert(!page.includes('id="allowMbXien" type="checkbox" checked'));
assert(!page.includes('id="allowUi" type="checkbox" checked'));
assert(page.includes('Ngày bắt đầu áp dụng'));
assert(page.includes('Ngày trước ngày hiệu lực tiếp tục dùng phiên bản cũ') || ui.includes('Ngày trước giữ rule cũ'));
assert(page.includes('Lưu + tính'));
assert(page.includes('id="parserEndpoint"'));
assert(ui.includes('pipeline.parseAndSaveMessage'));
assert(ui.includes('pipeline.recalculateDateRegion'));
assert(ui.includes('pipeline.recalculatePartnerFromDate'));
assert(pipeline.includes("scope:${partnerId}:${businessDate}"));
assert(pipeline.includes("scope_status: 'blocked'"));
assert(ui.includes('intervalMs: 90000'));
assert(provider.includes("DEFAULT_ENDPOINT = '/api/kqxs'"));
assert(parserProvider.includes("DEFAULT_ENDPOINT = '/api/settlement/parse'"));
assert(!provider.toLowerCase().includes('your_api_key'));
assert(!parserProvider.toLowerCase().includes('your_api_key'));
assert(index.includes('data-mode="settlement"'));
assert(index.includes('src="./settlement.html"'));
assert(sw.includes("url.pathname.includes('/api/kqxs')"));
assert(sw.includes("url.pathname.includes('/api/settlement/parse')"));

console.log('settlement-page-tests: PASS');
