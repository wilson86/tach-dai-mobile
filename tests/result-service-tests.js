'use strict';

const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, '..', 'app', 'result-service.js'), 'utf8');
const sandbox = { globalThis: { setTimeout, clearTimeout } };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const R = sandbox.globalThis.KTS_RESULT_SERVICE;

function mnPrizes() {
  return {
    G8: ['90'], G7: ['881'], G6: ['6654', '2969', '5873'], G5: ['429'],
    G4: ['49739', '10267', '33221', '80693', '15919', '28496', '12364'],
    G3: ['12345', '67890'], G2: ['12345'], G1: ['030'], DB: ['977937']
  };
}

function mbPrizes() {
  return {
    G7: ['0092', '1161', '2244', '3351'],
    G6: ['123', '456', '789'],
    G5: ['1111', '2222', '3333', '4444', '5555', '6666'],
    G4: ['1111', '2222', '3333', '4444'],
    G3: ['11111', '22222', '33333', '44444', '55555', '66666'],
    G2: ['11111', '22222'], G1: ['12345'], DB: ['12345']
  };
}

assert.strictEqual(R.stationComplete('mn', { prizes: mnPrizes() }), true);
assert.strictEqual(R.stationComplete('mt', { prizes: mnPrizes() }), true);
assert.strictEqual(R.stationComplete('mb', { prizes: mbPrizes() }), true);

{
  const p = mnPrizes();
  p.G4 = p.G4.slice(0, 6);
  assert.strictEqual(R.stationComplete('mn', { prizes: p }), false);
}

{
  const s = R.normalizeSnapshot({
    business_date: '2026-09-22', region: 'mn', source: 'fixture',
    stations: [{ code: 'bli', name: 'Bạc Liêu', prizes: mnPrizes() }]
  });
  assert.strictEqual(s.complete, true);
  assert.strictEqual(s.status, 'complete');
  assert.strictEqual(s.stations[0].complete, true);
}

{
  const partial = mnPrizes();
  delete partial.DB;
  const s = R.normalizeSnapshot({
    business_date: '2026-09-22', region: 'mn', source: 'fixture',
    stations: [{ code: 'bli', prizes: partial }]
  });
  assert.strictEqual(s.complete, false);
  assert.strictEqual(s.status, 'partial');
}

assert.throws(() => R.createPoller({ fetchSnapshot: async () => ({}), intervalMs: 30000 }), /60_TO_120/);
assert.throws(() => R.createPoller({ fetchSnapshot: async () => ({}), completeConfirmations: 0 }), /CONFIRMATIONS_MUST_BE_1_TO_10/);

(async () => {
  const states = [];
  const poller = R.createPoller({
    intervalMs: 60000,
    completeConfirmations: 2,
    fetchSnapshot: async scope => ({
      business_date: scope.business_date,
      region: scope.region,
      source: 'fixture',
      stations: [{ code: 'bli', name: 'Bạc Liêu', prizes: mnPrizes() }]
    }),
    onStatus: info => states.push(info.state)
  });
  await poller.start({ business_date: '2026-09-22', region: 'mn' });
  assert.strictEqual(poller.getState().running, true);
  assert.strictEqual(poller.getState().complete_confirmations, 1);
  assert(states.includes('complete_waiting_confirmation'));

  await poller.runOnce();
  assert.strictEqual(poller.getState().running, false);
  assert.strictEqual(poller.getState().complete_confirmations, 2);
  assert(states.includes('complete'));

  console.log('result-service-tests: PASS');
})().catch(err => { console.error(err); process.exit(1); });
