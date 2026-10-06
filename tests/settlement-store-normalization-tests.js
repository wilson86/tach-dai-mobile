'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const ctx = { console, globalThis: null, Date, Math, JSON };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('app/settlement-store.js', 'utf8'), ctx, { filename: 'settlement-store.js' });
const S = ctx.KTS_SETTLEMENT_STORE;

assert.strictEqual(S.DB_VERSION, 5);
assert.strictEqual(S.STORES.shadowEvents, 'shadow_events');
assert.strictEqual(typeof S.normalizeShadowEvent, 'function');
assert.strictEqual(typeof S.saveShadowEvent, 'function');
assert.strictEqual(typeof S.listShadowEvents, 'function');

const base = {
  business_date: '2026-10-06',
  region: 'mn',
  source: 'primary',
  status: 'complete',
  complete: true,
  coverage_complete: true,
  expected_station_codes: ['bt', 'vt', 'bli'],
  verification_status: 'conflict',
  verification_sources: ['primary', 'secondary'],
  verification_reason: 'KQXS_SOURCE_CONFLICT',
  verification_conflicts: ['bli:G8'],
  stations: [
    { code: 'bt', prizes: { G8: ['10'] } },
    { code: 'vt', prizes: { G8: ['20'] } },
    { code: 'bli', prizes: { G8: ['30'] } }
  ]
};

const conflict = S.normalizeResultSnapshot(base);
assert.strictEqual(conflict.coverage_complete, true);
assert.deepStrictEqual(Array.from(conflict.expected_station_codes), ['bt', 'vt', 'bli']);
assert.strictEqual(conflict.verified, false);
assert.strictEqual(conflict.verification_status, 'conflict');
assert.deepStrictEqual(Array.from(conflict.verification_sources), ['primary', 'secondary']);
assert.strictEqual(conflict.verification_reason, 'KQXS_SOURCE_CONFLICT');
assert.deepStrictEqual(Array.from(conflict.verification_conflicts), ['bli:G8']);

const verified = S.normalizeResultSnapshot({
  ...base,
  verification_status: 'verified',
  verified: true,
  verification_reason: null,
  verification_conflicts: []
});
assert.strictEqual(verified.verified, true);
assert.notStrictEqual(conflict.fingerprint, verified.fingerprint, 'verification transition must create an audit-visible fingerprint change');

const partialCannotVerify = S.normalizeResultSnapshot({
  ...base,
  status: 'partial',
  complete: false,
  verification_status: 'verified',
  verified: true
});
assert.strictEqual(partialCannotVerify.verified, false);
assert.strictEqual(partialCannotVerify.verification_status, 'unverified');

assert.throws(() => S.normalizeResultSnapshot({
  ...base,
  expected_station_codes: ['bt', 'bt']
}), /RESULT_EXPECTED_STATIONS_DUPLICATE/);

const evidenceBase = {
  partner_id:'p1', business_date:'2026-10-06', region:'mb',
  trigger:'AUTO_RECALCULATEDATEREGION', reason:'shadow-guard:recalculateDateRegion',
  local_snapshot:{ settlement_result:{final_net:-10}, result_fingerprint:'kq-1', config_version:2 },
  reference_snapshot:{ totals:{final:-11}, source:'HIOSKT_MANUAL' },
  comparison:{ status:'MISMATCH', totals:{final_net:{local:-10,reference:-11,delta:1,status:'MISMATCH'}} }
};
const ev1 = S.normalizeShadowEvent({...evidenceBase, observed_at:'2026-10-06T12:00:00Z'});
const ev2 = S.normalizeShadowEvent({...evidenceBase, observed_at:'2026-10-06T12:05:00Z'});
assert.strictEqual(ev1.scope_id,'scope:p1:2026-10-06:mb');
assert.strictEqual(ev1.comparison_status,'MISMATCH');
assert.strictEqual(ev1.evidence_fingerprint, ev2.evidence_fingerprint, 'timestamp-only changes must dedupe shadow evidence');
const ev3 = S.normalizeShadowEvent({...evidenceBase, local_snapshot:{...evidenceBase.local_snapshot,result_fingerprint:'kq-2'}});
assert.notStrictEqual(ev1.evidence_fingerprint, ev3.evidence_fingerprint, 'changed KQXS/settlement evidence must append a new history item');
assert.throws(() => S.normalizeShadowEvent({...evidenceBase,business_date:'bad'}), /SHADOW_EVENT_SCOPE_REQUIRED/);
assert.throws(() => S.normalizeShadowEvent({...evidenceBase,region:'xx'}), /SHADOW_EVENT_REGION_REQUIRED/);

console.log('settlement-store-normalization-tests: PASS');