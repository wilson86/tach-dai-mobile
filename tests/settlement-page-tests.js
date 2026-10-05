'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const app = path.join(__dirname, '..', 'app');
const page = fs.readFileSync(path.join(app, 'settlement.html'), 'utf8');
const ui = fs.readFileSync(path.join(app, 'settlement-ui.js'), 'utf8');
const provider = fs.readFileSync(path.join(app, 'result-provider.js'), 'utf8');
const index = fs.readFileSync(path.join(app, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(app, 'sw.js'), 'utf8');

assert(page.includes('id="allowMbXien" type="checkbox"'));
assert(page.includes('id="allowUi" type="checkbox"'));
assert(!page.includes('id="allowMbXien" type="checkbox" checked'));
assert(!page.includes('id="allowUi" type="checkbox" checked'));
assert(page.includes('Ngày bắt đầu áp dụng'));
assert(page.includes('Các ngày trước giữ rule cũ') || ui.includes('Các ngày trước giữ rule cũ'));
assert(ui.includes("status: 'pending_parser'"));
assert(ui.includes('intervalMs: 90000'));
assert(provider.includes("DEFAULT_ENDPOINT = '/api/kqxs'"));
assert(!provider.toLowerCase().includes('your_api_key'));
assert(index.includes('data-mode="settlement"'));
assert(index.includes('src="./settlement.html"'));
assert(sw.includes("url.pathname.includes('/api/kqxs')"));

console.log('settlement-page-tests: PASS');
