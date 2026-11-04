'use strict';
// Source-contract guard, NOT a substitute for running the fresh supervised PG16
// probe against independently authenticated synthetic Auth/Ledger LOGIN roles.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','scripts','settlement-pg-recovery-http-probe.cjs'),'utf8');
test('recovery PG HTTP probe remains scratch-only, loopback, and write-blocked',()=>{
  assert.match(source,/RECOVERY_PROBE_SCOPE_DENIED/);
  assert.match(source,/127\.0\.0\.1/);
  assert.match(source,/RECOVERY_PROBE_DATABASE_ROOT_MISMATCH/);
  assert.match(source,/createIsolatedTeamPrototype\(\{authPool,ledgerPool,syntheticOnly:true,syntheticRecoveryInspectEnabled:true\}\)/);
  assert.match(source,/TEAM_DB_ATOMIC_SESSION_BOUNDARY_UNAVAILABLE/);
  assert.match(source,/assert\.deepEqual\(counts\.rows\[0\],\{events:1,receipts:1\}\)/);
});
test('cross-tenant and altered-digest requests use real HTTP and are denied',()=>{
  assert.match(source,/const crossTenant=await inspect\(\{\.\.\.intent,scope:\{\.\.\.scope,workspace_id:'group_b'\}\}\)/);
  assert.match(source,/assert\.equal\(crossTenant\.status,422\)/);
  assert.match(source,/assert\.equal\(crossTenant\.body\.error,'TEAM_RECOVERY_QUARANTINE_REQUIRED'\)/);
  assert.match(source,/const tampered=await inspect\(\{\.\.\.intent,payload:\{synthetic:true,tampered:true\}\}\)/);
  assert.match(source,/assert\.equal\(tampered\.status,503\)/);
  assert.match(source,/assert\.equal\(tampered\.body\.error,'TEAM_RECOVERY_RECEIPT_UNVERIFIED'\)/);
});
test('no sensitive response fields; UNKNOWN never auto-retried and no data changes',()=>{
  assert.match(source,/for\(const response of \[matched,crossTenant,tampered\]\)/);
  for(const s of ["'session_hash'","'request_sha256'","'payload_sha256'","'actor_user_id'","'feed_seq'"])
    assert.ok(source.includes(s));
  assert.match(source,/assert\.equal\(missing\.body\.items\[0\]\.classification,'UNVERIFIED_NOT_SAFE_TO_RETRY'\)/);
  assert.match(source,/assert\.equal\(missing\.body\.auto_send_enabled,false\)/);
  assert.match(source,/assert\.equal\(revoked\.status,401\)/);
  assert.match(source,/matched=1 unknown=1 revoked=1 cross_tenant_denied=1 tampered_receipt_denied=1/);
});
