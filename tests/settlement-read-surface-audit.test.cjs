'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {evaluateSources,auditRepository,FILES} = require('../scripts/settlement-read-surface-audit.cjs');
const mk = (ledger,auth)=>({[FILES[0]]:ledger,[FILES[1]]:auth});
test('detects direct tenant reads without granting a release PASS',()=>{
  const result=evaluateSources(mk(
    'async function getChanges(){\n  `SELECT * FROM kts_team.scope_events e JOIN kts_team.memberships m ON true`\n}',
    'async function login(){\n  `SELECT * FROM kts_auth.credentials c JOIN kts_team.identities i ON true`\n}'));
  assert.equal(result.status,'BLOCKED_DIRECT_SQL_TENANT_READ');
  assert.equal(result.observed_direct_read_clauses,4);
  assert.deepEqual(result.exposed_methods,[
    FILES[1]+'::login', FILES[0]+'::getChanges'
  ].sort());
  assert.equal(result.tenant_isolation_qualified,false);
  assert.equal(result.runtime_acl_qualified,false);
  assert.equal(result.production_qualified,false);
});
test('absence of regex matches never proves tenant isolation',()=>{
  const result=evaluateSources(mk('async function getChanges(){return undefined}',
    'async function login(){return undefined}'));
  assert.equal(result.status,'REVIEW_REQUIRED_NO_STATIC_READS');
  assert.equal(result.production_qualified,false);
});
test('missing source, unknown tenant table and unsafe root fail closed',()=>{
  assert.throws(()=>evaluateSources({[FILES[0]]:'source only'}),/INPUT_INCOMPLETE/);
  assert.throws(()=>evaluateSources(mk('async function x(){\n FROM kts_team.unknown_table\n}',
    'async function x(){ return true }')),/UNKNOWN_TABLE/);
  assert.throws(()=>auditRepository('.'),/ROOT_INVALID/);
});
test('checkout includes known direct Ledger/Auth read methods (not an ACL check)',()=>{
  const root=path.join(__dirname,'..');
  const x=auditRepository(root);
  assert.equal(x.status,'BLOCKED_DIRECT_SQL_TENANT_READ');
  for(const m of ['inActorTransaction','getScope','listCounterparties',
    'getChanges','lookupRecoveryReceipts'])
    assert.ok(x.exposed_methods.includes(FILES[0]+'::'+m),'missing Ledger path '+m);
  for(const m of ['login','withVerifiedSession','requireCurrentAdmin'])
    assert.ok(x.exposed_methods.includes(FILES[1]+'::'+m),'missing Auth path '+m);
  assert.ok(x.records.some(r=>r.table==='kts_team.idempotency_receipts'));
  assert.ok(x.records.some(r=>r.table==='kts_auth.credentials'));
  assert.equal(x.production_qualified,false);
});
