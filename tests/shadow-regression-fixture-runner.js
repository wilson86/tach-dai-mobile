'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ctx = { console, globalThis: null };
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const file of [
  'app/settlement-engine.js',
  'app/settlement-mb-rules.js',
  'app/settlement-evaluator.js',
  'app/settlement-shadow.js',
  'app/settlement-regression-cases.js'
]) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename:file });

const R = ctx.KTS_SETTLEMENT_REGRESSION_CASES;
const dir = path.join(__dirname, 'shadow-regression-cases');
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(name => name.endsWith('.json')).sort() : [];
assert(files.length > 0, 'No committed shadow regression fixtures found');

let passed = 0;
for (const name of files) {
  const full = path.join(dir, name);
  const payload = JSON.parse(fs.readFileSync(full, 'utf8'));
  const cases = payload && payload.format === R.BUNDLE_FORMAT ? payload.cases : [payload];
  for (const item of cases) {
    const replay = R.replayCase(item);
    if (!replay.pass) {
      console.error('REGRESSION FAIL', name, replay.case && replay.case.id, JSON.stringify(replay.comparison, null, 2));
      process.exitCode = 1;
    } else {
      passed += 1;
      console.log('REGRESSION PASS', name, replay.case.id);
    }
  }
}
if (process.exitCode) process.exit(process.exitCode);
console.log(`shadow-regression-fixture-runner: PASS (${passed} cases)`);
