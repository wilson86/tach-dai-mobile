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
assert.strictEqual(typeof S.assertConfigPartner, 'function');
assert.strictEqual(S.assertConfigPartner({partner_id:'p1'}, 'p1'), true);
assert.throws(() => S.assertConfigPartner({partner_id:'p2'}, 'p1'), /CONFIG_PARTNER_MISMATCH/);

assert.strictEqual(typeof S.resolveConfigFromRows, 'function');
assert.strictEqual(typeof S.nextConfigVersionFromRows, 'function');
assert.strictEqual(S.nextConfigVersionFromRows([]),1);
assert.strictEqual(S.nextConfigVersionFromRows([{version:1},{version:4},{version:2}]),5);
const versionRows = [
  S.normalizeConfig({partner_id:'p1',version:1,effective_from_date:'2026-10-06'}),
  S.normalizeConfig({partner_id:'p1',version:2,effective_from_date:'2026-10-07'}),
  S.normalizeConfig({partner_id:'p1',version:3,effective_from_date:'2026-10-07'}),
  S.normalizeConfig({partner_id:'p2',version:99,effective_from_date:'2026-10-01'})
];
assert.strictEqual(S.resolveConfigFromRows(versionRows,'p1','2026-10-06').version,1,'date before new rule must keep old version');
assert.strictEqual(S.resolveConfigFromRows(versionRows,'p1','2026-10-07').version,3,'same effective date must pick highest version');
assert.strictEqual(S.resolveConfigFromRows(versionRows,'p1','2026-10-08').partner_id,'p1','foreign partner config must never leak');
assert.throws(()=>S.resolveConfigFromRows(versionRows,'p1','2026-10-05'),/NO_CONFIG_FOR_BUSINESS_DATE/);


const regionCfg = S.normalizeConfig({
  partner_id:'p1', version:1, effective_from_date:'2026-10-07',
  total_percent:'100', refund_percent:'0', dat_hit_mode:'ky_ruoi', dax_hit_mode:'multi_pair',
  region_terms:{
    mn:{total_percent:'90',refund_percent:'5',dat_hit_mode:'ky_ruoi',dax_hit_mode:'multi_pair'},
    mt:{total_percent:'80',refund_percent:'2',dat_hit_mode:'one_time',dax_hit_mode:'ky_ruoi'},
    mb:{total_percent:'70',refund_percent:'1'}
  }
});
assert.strictEqual(regionCfg.region_terms.mn.total_percent,'90');
assert.strictEqual(regionCfg.region_terms.mt.refund_percent,'2');
assert.strictEqual(regionCfg.region_terms.mt.dat_hit_mode,'one_time');
assert.strictEqual(regionCfg.region_terms.mb.total_percent,'70');
assert.strictEqual(regionCfg.region_terms.mb.dat_hit_mode,'multi_pair');
const legacyCfg = S.normalizeConfig({partner_id:'p2',version:1,effective_from_date:'2026-10-07',total_percent:'88',refund_percent:'3',dat_hit_mode:'ky_ruoi',dax_hit_mode:'multi_pair'});
assert.strictEqual(legacyCfg.region_terms.mn.total_percent,'88');
assert.strictEqual(legacyCfg.region_terms.mt.total_percent,'88');
assert.strictEqual(legacyCfg.region_terms.mb.refund_percent,'3');
assert.throws(()=>S.normalizeConfig({partner_id:'p3',version:1,effective_from_date:'2026-10-07',region_terms:{mn:{dat_hit_mode:'bad'}}}),/INVALID_HIT_MODE/);

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


const storeSource=fs.readFileSync('app/settlement-store.js','utf8');
const saveConfigSource=storeSource.slice(storeSource.indexOf('async function saveConfig'),storeSource.indexOf('function resolveConfigFromRows'));
assert(saveConfigSource.includes("db.transaction(STORES.configs, 'readwrite')"),'config version read + write must share one readwrite transaction');
assert(saveConfigSource.includes("store.index('by_partner').getAll"),'atomic config save must read existing partner versions inside that transaction');
assert(saveConfigSource.includes('store.add(value)'),'auto version write must use add() to fail rather than overwrite on unexpected collision');
assert(!saveConfigSource.includes('await nextConfigVersion('),'saveConfig must not allocate version in a separate async transaction');


const weakVerified=S.normalizeResultSnapshot({
  ...base,verification_status:'verified',verified:true,
  verification_sources:['primary'],verification_conflicts:[]
});
assert.strictEqual(weakVerified.verified,false);
assert.strictEqual(weakVerified.verification_status,'unverified');
const strongVerified=S.normalizeResultSnapshot({
  ...base,verification_status:'verified',verified:true,
  verification_sources:['primary','secondary'],verification_conflicts:[]
});
assert.strictEqual(strongVerified.verified,true);

const conflictEvidenceWins=S.normalizeResultSnapshot({
  ...base,verification_status:'verified',verified:true,
  verification_sources:['primary','secondary'],verification_conflicts:['bli:G8']
});
assert.strictEqual(conflictEvidenceWins.verified,false);
assert.strictEqual(conflictEvidenceWins.verification_status,'conflict','conflict evidence must dominate contradictory verified=true metadata');

const forgedFingerprint=S.normalizeResultSnapshot({
  ...base,verification_status:'verified',verified:true,
  verification_sources:['primary','secondary'],verification_conflicts:[],
  fingerprint:'caller-stale-fingerprint'
});
assert.notStrictEqual(forgedFingerprint.fingerprint,'caller-stale-fingerprint','store normalization must recompute KQXS fingerprint instead of trusting caller metadata');
assert.strictEqual(forgedFingerprint.fingerprint,strongVerified.fingerprint,'same canonical KQXS core must have deterministic store-owned fingerprint');

assert.strictEqual(S.resultSnapshotIsOlder(
  {fetched_at:'2026-10-07T10:00:00Z'},
  {fetched_at:'2026-10-07T10:00:01Z'}
),true);
assert.strictEqual(S.resultSnapshotIsOlder(
  {fetched_at:'2026-10-07T10:00:02Z'},
  {fetched_at:'2026-10-07T10:00:01Z'}
),false);
assert(storeSource.includes("db.transaction([STORES.results, STORES.resultEvents], 'readwrite')"),'KQXS freshness check + save must be one atomic readwrite transaction');
assert(storeSource.includes('stale_ignored: true'),'older KQXS responses must be retained as ignored rather than overwrite canonical result');

const coverageDowngraded=S.normalizeResultSnapshot({
  ...base,complete:true,status:'complete',
  expected_station_codes:['bt','vt','bli'],
  stations:[{code:'bt'}],
  verification_status:'unverified'
});
assert.strictEqual(coverageDowngraded.complete,false);
assert.strictEqual(coverageDowngraded.coverage_complete,false);
assert.strictEqual(coverageDowngraded.status,'partial');
console.log('settlement-store-normalization-tests: PASS');
