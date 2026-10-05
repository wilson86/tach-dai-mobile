'use strict';

const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, '..', 'app', 'mb-settlement-rules.js'), 'utf8');
const sandbox = { globalThis: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const R = sandbox.globalThis.KTS_MB_SETTLEMENT_RULES;

assert.strictEqual(R.mbXacUnits('2CB', {}), 27);
assert.strictEqual(R.mbXacUnits('2CD', {}), 5);
assert.strictEqual(R.mbXacUnits('2CB8', {}), 8);
assert.strictEqual(R.mbXacUnits('DAT', { number_count: 2 }), 54);
assert.strictEqual(R.mbXacUnits('3CB', {}), 23);
assert.strictEqual(R.mbXacUnits('3CB7', {}), 7);
assert.strictEqual(R.mbXacUnits('4C', {}), 20);
assert.strictEqual(R.mbXacUnits('3CXC', { number_count: 3, position: 'dau' }), 9);
assert.strictEqual(R.mbXacUnits('3CXC', { number_count: 1, position: 'duoi' }), 1);

assert.deepStrictEqual(Array.from(R.mbSelectors('2CD', { position: 'dau' })), ['G7:*']);
assert.deepStrictEqual(Array.from(R.mbSelectors('2CD', { position: 'duoi' })), ['DB:0']);
assert.deepStrictEqual(Array.from(R.mbSelectors('2CD', {})), ['G7:*', 'DB:0']);
assert.deepStrictEqual(Array.from(R.mbSelectors('2CB8', {})), ['G6:*', 'G7:*', 'DB:0']);
assert.deepStrictEqual(Array.from(R.mbSelectors('3CB7', {})), ['G6:*', 'G5:3', 'G5:4', 'G5:5', 'DB:0']);
assert.deepStrictEqual(Array.from(R.mbSelectors('3CXC', { position: 'dau' })), ['G6:*']);
assert.deepStrictEqual(Array.from(R.mbSelectors('3CXC', { position: 'duoi' })), ['DB:0']);

assert.deepStrictEqual(Array.from(R.mbSelectors('2CB', {})), ['G7:*', 'G6:*', 'G5:*', 'G4:*', 'G3:*', 'G2:*', 'G1:*', 'DB:*']);
assert.deepStrictEqual(Array.from(R.mbSelectors('DAT', {})), ['G7:*', 'G6:*', 'G5:*', 'G4:*', 'G3:*', 'G2:*', 'G1:*', 'DB:*']);
assert.deepStrictEqual(Array.from(R.mbSelectors('3CB', {})), ['G6:*', 'G5:*', 'G4:*', 'G3:*', 'G2:*', 'G1:*', 'DB:*']);
assert.deepStrictEqual(Array.from(R.mbSelectors('4C', {})), ['G5:*', 'G4:*', 'G3:*', 'G2:*', 'G1:*', 'DB:*']);

assert.throws(() => R.mbXacUnits('3CXC', {}), /UNVERIFIED_MB_3CXC_POSITION/);
assert.throws(() => R.mbSelectors('UNKNOWN', {}), /UNVERIFIED_MB_SELECTOR_CATEGORY/);

console.log('mb-settlement-rules-tests: PASS');
