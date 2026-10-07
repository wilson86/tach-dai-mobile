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
  assert.strictEqual(s.coverage_complete, true);
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

// Provider `complete:true` must never override deterministic prize counts.
{
  const partial = mnPrizes();
  delete partial.DB;
  const s = R.normalizeSnapshot({
    business_date: '2026-09-22', region: 'mn', source: 'fixture',
    stations: [{ code: 'bli', complete: true, prizes: partial }]
  });
  assert.strictEqual(s.stations[0].complete, false);
  assert.strictEqual(s.complete, false);
}

// If backend tells us which stations must draw, all of them must be present.
{
  const s = R.normalizeSnapshot({
    business_date: '2026-09-22', region: 'mn', source: 'fixture',
    expected_station_codes: ['bt', 'vt', 'bli'],
    stations: [
      { code: 'bt', prizes: mnPrizes() },
      { code: 'vt', prizes: mnPrizes() }
    ]
  });
  assert.strictEqual(s.coverage_complete, false);
  assert.strictEqual(s.complete, false);
  assert.strictEqual(s.status, 'partial');
  assert.deepStrictEqual(Array.from(s.expected_station_codes), ['bt', 'vt', 'bli']);
}

{
  const s = R.normalizeSnapshot({
    business_date: '2026-09-22', region: 'mn', source: 'fixture',
    expected_station_codes: ['bt', 'vt', 'bli'],
    stations: [
      { code: 'bt', prizes: mnPrizes() },
      { code: 'vt', prizes: mnPrizes() },
      { code: 'bli', prizes: mnPrizes() }
    ]
  });
  assert.strictEqual(s.coverage_complete, true);
  assert.strictEqual(s.complete, true);
}

// Verification metadata is part of the immutable fingerprint/audit contract.
{
  const base = {
    business_date: '2026-09-22', region: 'mb', source: 'primary',
    expected_station_codes: ['mb'],
    stations: [{ code: 'mb', prizes: mbPrizes() }]
  };
  const conflict = R.normalizeSnapshot({
    ...base,
    verification_status: 'conflict',
    verification_sources: ['primary', 'secondary'],
    verification_reason: 'KQXS_SOURCE_CONFLICT',
    verification_conflicts: ['mb:G7']
  });
  const clean = R.normalizeSnapshot({ ...base, verification_status: 'unverified', verification_sources: ['primary'] });
  assert.strictEqual(conflict.complete, true);
  assert.strictEqual(conflict.verified, false);
  assert.strictEqual(conflict.verification_status, 'conflict');
  assert.deepStrictEqual(Array.from(conflict.verification_conflicts), ['mb:G7']);
  assert.notStrictEqual(conflict.fingerprint, clean.fingerprint);

  const conflictEvidenceWins = R.normalizeSnapshot({
    ...base,
    verification_status: 'verified',
    verified: true,
    verification_sources: ['primary', 'secondary'],
    verification_conflicts: ['mb:G7']
  });
  assert.strictEqual(conflictEvidenceWins.verified, false);
  assert.strictEqual(conflictEvidenceWins.verification_status, 'conflict', 'conflict evidence must override a contradictory verified=true claim');
}

assert.throws(() => R.normalizeSnapshot({
  business_date: '2026-09-22', region: 'mn',
  expected_station_codes: ['bt', 'bt'],
  stations: [{ code: 'bt', prizes: mnPrizes() }]
}), /EXPECTED_STATIONS_DUPLICATE/);

assert.throws(() => R.normalizeSnapshot({
  business_date: '2026-09-22', region: 'mn',
  expected_station_codes: ['bt'],
  stations: [{ code: 'bt', prizes: mnPrizes() }, { code: 'bt', prizes: mnPrizes() }]
}), /STATION_DUPLICATE/);

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
      expected_station_codes: ['bli'],
      verification_status: 'verified',
      verified: true,
      verification_sources: ['primary','secondary'],
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
  assert(states.includes('verified'));

  const conflictStates = [];
  const conflictPoller = R.createPoller({
    intervalMs: 60000,
    completeConfirmations: 1,
    fetchSnapshot: async scope => ({
      business_date: scope.business_date,
      region: scope.region,
      source: 'primary',
      expected_station_codes: ['mb'],
      verification_status: 'conflict',
      verification_sources: ['primary', 'secondary'],
      verification_reason: 'KQXS_SOURCE_CONFLICT',
      verification_conflicts: ['mb:G7'],
      stations: [{ code: 'mb', prizes: mbPrizes() }]
    }),
    onStatus: info => conflictStates.push(info.state)
  });
  await conflictPoller.start({ business_date: '2026-09-22', region: 'mb' });
  assert.strictEqual(conflictPoller.getState().running, true, 'source conflict must keep polling');
  assert(conflictStates.includes('conflict'));
  conflictPoller.stop();

  const pendingStates = [];
  const pendingPoller = R.createPoller({
    intervalMs: 60000,
    completeConfirmations: 1,
    fetchSnapshot: async scope => ({
      business_date: scope.business_date,
      region: scope.region,
      source: 'primary',
      expected_station_codes: ['mb'],
      verification_status: 'unverified',
      verification_sources: ['primary'],
      verification_reason: 'SECONDARY_UNAVAILABLE:TIMEOUT',
      stations: [{ code: 'mb', prizes: mbPrizes() }]
    }),
    onStatus: info => pendingStates.push(info.state)
  });
  await pendingPoller.start({ business_date: '2026-09-22', region: 'mb' });
  assert.strictEqual(pendingPoller.getState().running, true, 'secondary pending must keep polling');
  assert(pendingStates.includes('verification_pending'));
  pendingPoller.stop();

  const singleSourceStates = [];
  const singleSourcePoller = R.createPoller({
    intervalMs: 60000,
    completeConfirmations: 1,
    fetchSnapshot: async scope => ({
      business_date: scope.business_date,
      region: scope.region,
      source: 'primary',
      expected_station_codes: ['mb'],
      verification_status: 'unverified',
      verified: false,
      verification_sources: ['primary'],
      verification_reason: 'SOURCE_UNAVAILABLE:TIMEOUT',
      stations: [{ code: 'mb', prizes: mbPrizes() }]
    }),
    onStatus: info => singleSourceStates.push(info.state)
  });
  await singleSourcePoller.start({ business_date: '2026-09-22', region: 'mb' });
  assert.strictEqual(singleSourcePoller.getState().running, true, 'one-source complete result must keep polling until verified');
  assert(singleSourceStates.includes('verification_pending'));
  singleSourcePoller.stop();


  const oneSourceClaimedVerified = R.normalizeSnapshot({
    business_date:'2026-09-22',region:'mb',
    expected_station_codes:['mb'],
    verification_status:'verified',verified:true,verification_sources:['primary'],
    stations:[{code:'mb',prizes:mbPrizes()}]
  });
  assert.strictEqual(oneSourceClaimedVerified.verified,false,'one source must never qualify as VERIFIED');
  assert.strictEqual(oneSourceClaimedVerified.verification_status,'unverified');

  const twoSourceVerified = R.normalizeSnapshot({
    business_date:'2026-09-22',region:'mb',
    expected_station_codes:['mb'],
    verification_status:'verified',verified:true,verification_sources:['primary','secondary'],
    stations:[{code:'mb',prizes:mbPrizes()}]
  });
  assert.strictEqual(twoSourceVerified.verified,true);

  let staleObserved=null;
  let staleMeta=null;
  const canonicalNewer = R.normalizeSnapshot({
    business_date:'2026-09-22',region:'mb',source:'primary',
    fetched_at:'2026-10-07T10:00:02Z',
    expected_station_codes:['mb'],
    verification_status:'verified',verified:true,verification_sources:['primary','secondary'],
    stations:[{code:'mb',prizes:mbPrizes()}]
  });
  const stalePoller = R.createPoller({
    intervalMs:60000,
    completeConfirmations:1,
    fetchSnapshot:async scope=>({
      business_date:scope.business_date,region:scope.region,source:'primary',
      fetched_at:'2026-10-07T10:00:01Z',
      expected_station_codes:['mb'],
      verification_status:'unverified',verification_sources:['primary'],
      stations:[{code:'mb',prizes:mbPrizes()}]
    }),
    store:{saveResultSnapshot:async()=>({
      snapshot:canonicalNewer,changed:false,previous:canonicalNewer,stale_ignored:true
    })},
    onUpdate:(snapshot,meta)=>{staleObserved=snapshot;staleMeta=meta;}
  });
  await stalePoller.start({business_date:'2026-09-22',region:'mb'});
  assert.strictEqual(staleObserved.fetched_at,'2026-10-07T10:00:02Z','poller must surface canonical stored KQXS after stale response is rejected');
  assert.strictEqual(staleObserved.verified,true);
  assert.strictEqual(staleMeta.stale_ignored,true);

  console.log('result-service-tests: PASS');
})().catch(err => { console.error(err); process.exit(1); });
