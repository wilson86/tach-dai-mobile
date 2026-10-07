'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const code = fs.readFileSync(path.join(__dirname, '..', 'app', 'result-audit-ui.js'), 'utf8');
const sandbox = { globalThis: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const A = sandbox.globalThis.KTS_RESULT_AUDIT_UI;
assert.strictEqual(A.version,'result-audit-ui-v2-stale-safe-strict-verified');

const events = [
  { id: 'evt2', result_id: '2026-10-06:mn', business_date: '2026-10-06', region: 'mn', source: 'b', observed_at: '2026-10-06T10:02:00Z', fingerprint: 'bbb', complete: true },
  { id: 'evt1', result_id: '2026-10-06:mn', business_date: '2026-10-06', region: 'mn', source: 'a', observed_at: '2026-10-06T10:01:00Z', fingerprint: 'aaa', complete: false },
  { id: 'evt3', result_id: '2026-10-06:mb', business_date: '2026-10-06', region: 'mb', source: 'c', observed_at: '2026-10-06T10:03:00Z', fingerprint: 'ccc', complete: true }
];

assert.strictEqual(A.scopeKey('2026-10-06', 'MN'), '2026-10-06:mn');
const rows = A.listEvents(events, '2026-10-06', 'mn');
assert.strictEqual(rows.length, 2);
assert.strictEqual(rows[0].id, 'evt2', 'newest audit event first');
const summary = A.summarize(rows);
assert.strictEqual(summary.count, 2);
assert.strictEqual(summary.changed, true);
assert.deepStrictEqual(Array.from(summary.sources), ['b', 'a']);
assert.strictEqual(A.summarize([]).changed, false);



const weakVerified={complete:true,verified:true,verification_status:'verified',verification_sources:['primary'],expected_station_codes:['bt'],stations:[{code:'bt'}]};
assert.strictEqual(A.snapshotVerified(weakVerified),false);
const strongVerified={complete:true,verified:true,verification_status:'verified',verification_sources:['primary','secondary'],verification_conflicts:[],expected_station_codes:['bt'],stations:[{code:'bt'}]};
assert.strictEqual(A.snapshotVerified(strongVerified),true);
const auditSource=fs.readFileSync(path.join(__dirname,'..','app','result-audit-ui.js'),'utf8');
assert(auditSource.includes('let refreshEpoch = 0'));
assert(auditSource.includes('const epoch = ++refreshEpoch'));
assert(auditSource.includes('epoch === refreshEpoch'));
assert(auditSource.includes('ĐỦ KQ · CHỜ XÁC MINH'));
console.log('result-audit-ui-tests: PASS');
