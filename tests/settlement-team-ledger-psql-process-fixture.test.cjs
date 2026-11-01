'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {auditWindowsLedgerRole}=require('../team-settlement/windows-ledger-grant-psql.cjs');
const args={psql:process.env.KTS_PSQL_FIXTURE_EXE,database:'l20_db_a1',role:'l20_led_a1',password:'fixture-secret',timeoutMs:1000};
test('real synthetic child returns direct-grant block without exposing password',async()=>{
  delete process.env.KTS_PSQL_FIXTURE_MODE;const result=await auditWindowsLedgerRole(args);
  assert.equal(result.status,'BLOCKED_DIRECT_SCOPE_MUTATION');assert.ok(!JSON.stringify(result).includes(args.password));
});
test('nonzero exit is rejected without stderr disclosure',async()=>{
  process.env.KTS_PSQL_FIXTURE_MODE='FAIL';try{await assert.rejects(auditWindowsLedgerRole(args),e=>e.message==='LEDGER_GRANT_AUDIT_SQL_UNVERIFIED');}finally{delete process.env.KTS_PSQL_FIXTURE_MODE;}
});
test('real synthetic child timeout fails closed',async()=>{
  process.env.KTS_PSQL_FIXTURE_MODE='TIMEOUT';try{await assert.rejects(auditWindowsLedgerRole({...args,timeoutMs:200}),e=>e.message==='LEDGER_GRANT_AUDIT_SQL_UNVERIFIED');}finally{delete process.env.KTS_PSQL_FIXTURE_MODE;}
});
