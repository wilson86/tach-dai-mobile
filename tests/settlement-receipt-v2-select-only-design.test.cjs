'use strict';
// Source-only negative control. This test NEVER qualifies live revocation or
// tenant isolation, and CANNOT authorize SQL execution or production release.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const locked=read('team-settlement/candidate/session-bound-receipt-read-v2.sql');
const nonlocking=read('team-settlement/candidate/session-bound-receipt-read-v2-select-only.sql');
test('locked and SELECT-only candidates have distinct function names; both remain unapproved',()=>{
  assert.match(locked,/CREATE FUNCTION kts_team\.candidate_receipt_read_v2\(/);
  assert.match(nonlocking,/CREATE FUNCTION kts_team\.candidate_receipt_read_v2_select_only\(/);
  assert.match(locked,/DO NOT EXECUTE/);assert.match(nonlocking,/DO NOT EXECUTE/);
  assert.match(nonlocking,/REVIEW ONLY/);
});
test('only nonlocking candidate avoids SELECT FOR SHARE owner UPDATE privilege trap',()=>{
  assert.match(locked,/^\s*FOR SHARE;/m);
  assert.match(locked,/^\s*FOR SHARE OF m,i;/m);
  assert.doesNotMatch(nonlocking,/^\s*FOR (?:SHARE|UPDATE|NO KEY UPDATE|KEY SHARE)(?: OF [a-z,]+)?;/m);
  assert.match(nonlocking,/NON-LINEARIZABLE/);
  assert.match(nonlocking,/READ ONLY/);
  assert.doesNotMatch(nonlocking,/^\s*GRANT\s+UPDATE\b/im);
});
test('SELECT-only path rechecks session and membership AFTER RETURN QUERY',()=>{
 const pos=nonlocking.indexOf('  RETURN QUERY');
 assert.ok(pos>0);
 const after=nonlocking.slice(pos);
 assert.match(after,/v_user_after IS DISTINCT FROM v_user/);
 assert.match(after,/v_workspace_after IS DISTINCT FROM v_workspace/);
 assert.match(after,/v_role_after NOT IN \('admin','operator'\)/);
 assert.match(after,/s\.revoked_at IS NULL/);
 assert.match(after,/m\.revoked_at IS NULL AND i\.disabled_at IS NULL/);
 assert.match(after,/TEAM_RECEIPT_V2_EXPIRED/);
 assert.match(nonlocking,/A revoke may occur after the last check/);
});
test('no role grant, key literal, tenant bypass or production wiring in alternative',()=>{
 assert.doesNotMatch(nonlocking,/^\s*GRANT\s+/im);
 assert.doesNotMatch(nonlocking,/^\s*UPDATE\s+kts_|^\s*INSERT\s+INTO\s+kts_|^\s*DELETE\s+FROM\s+kts_/im);
 assert.match(nonlocking,/REVOKE ALL ON FUNCTION/);
 assert.match(nonlocking,/OWNER TO kts_receipt_read_owner/);
 assert.match(nonlocking,/kts_auth\.receipt_v2_verifier_keys/);
 assert.match(nonlocking,/set_config\('kts\.workspace_id',v_workspace,true\)/);
});
