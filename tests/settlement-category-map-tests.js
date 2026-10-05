'use strict';

const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, '..', 'app', 'settlement-category-map.js'), 'utf8');
const sandbox = { globalThis: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const M = sandbox.globalThis.KTS_SETTLEMENT_CATEGORY_MAP;

assert.deepStrictEqual(
  Object.assign({}, M.canonicalMbSettlementCategory('TAMLO')),
  { category: 'MB_2C8', position: null }
);
assert.deepStrictEqual(
  Object.assign({}, M.canonicalMbSettlementCategory('DAT')),
  { category: 'MB_2CDA', position: null }
);
assert.deepStrictEqual(
  Object.assign({}, M.canonicalMbSettlementCategory('BAYLO')),
  { category: 'MB_3C7', position: null }
);
assert.deepStrictEqual(
  Object.assign({}, M.canonicalMbSettlementCategory('XCDAU')),
  { category: 'MB_3CDD', position: 'dau' }
);
assert.deepStrictEqual(
  Object.assign({}, M.canonicalMbSettlementCategory('XCDUOI')),
  { category: 'MB_3CDD', position: 'duoi' }
);
assert.throws(
  () => M.canonicalMbSettlementCategory('UNKNOWN'),
  /UNVERIFIED_MB_SETTLEMENT_SELECTOR/
);

console.log('settlement-category-map-tests: PASS');
