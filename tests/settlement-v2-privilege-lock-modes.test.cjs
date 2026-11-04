'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {evaluateCandidate}=require('../scripts/settlement-v2-privilege-review.cjs');
const decision=('The owner has only necessary schema USAGE, column SELECT and audited hmac EXECUTE. SQL verifier NOT_RUN.\n').repeat(5);
const queries=mode=>('SELECT s.session_handle FROM kts_auth.sessions s WHERE s.session_handle=$1 FOR '+mode+';\n'+
 'SELECT m.team_role FROM kts_team.memberships m JOIN kts_team.identities i ON i.user_id=m.user_id FOR '+mode+' OF m,i;\n'+
 'SELECT k.secret_bytes FROM kts_auth.receipt_v2_verifier_keys k;').repeat(6);
for(const lock of ['SHARE','KEY SHARE','NO KEY UPDATE','UPDATE']){
 test('recognize '+lock+' row locks needing UPDATE under SELECT-only owner',()=>{
  const x=evaluateCandidate(queries(lock),decision);
  assert.equal(x.session_lock_detected,true);
  assert.equal(x.membership_lock_detected,true);
  assert.equal(x.session_lock_mode,lock);
  assert.equal(x.membership_lock_mode,lock);
  assert.ok(x.issues.includes('ANY_ROW_LOCK_MODE_REQUIRES_UPDATE_PRIVILEGE'));
  assert.ok(x.issues.includes('DECLARED_SELECT_ONLY_OWNER_CONFLICTS_WITH_ROW_LOCKS'));
  assert.equal(x.independent_review_approved,false);
  assert.equal(x.production_ready,false);
 });
}
test('detect mixed row-lock modes and deny a partial membership lock',()=>{
 const sql=queries('KEY SHARE').replaceAll('FOR KEY SHARE OF m,i;', 'FOR SHARE OF m,i;');
 const x=evaluateCandidate(sql,decision);
 assert.equal(x.session_lock_mode,'KEY SHARE');
 assert.equal(x.membership_lock_mode,'SHARE');
 assert.ok(x.issues.includes('ANY_ROW_LOCK_MODE_REQUIRES_UPDATE_PRIVILEGE'));
 const partial=evaluateCandidate(queries('KEY SHARE').replaceAll('FOR KEY SHARE OF m,i;', ''),decision);
 assert.equal(partial.membership_lock_detected,false);
 assert.ok(partial.issues.includes('STRICT_REVOCATION_ROW_LOCKS_NOT_PROVEN'));
});
test('unlocked SQL never implies strict revocation or approval',()=>{
 const x=evaluateCandidate(queries('SHARE').replaceAll(/FOR SHARE(?: OF m,i)?;/g,''),decision);
 assert.equal(x.session_lock_detected,false);
 assert.equal(x.membership_lock_detected,false);
 assert.ok(x.issues.includes('STRICT_REVOCATION_ROW_LOCKS_NOT_PROVEN'));
 assert.equal(x.postgres_executed,false);
 assert.equal(x.production_ready,false);
});
test('locks in unrelated statements must not be attributed to session/member',()=>{
 const sql=('SELECT s.session_handle FROM kts_auth.sessions s;\n'+
  'SELECT x.a FROM other_unrelated x FOR KEY SHARE;\n'+
  'SELECT m.team_role FROM kts_team.memberships m;\n'+
  'SELECT k.secret_bytes FROM kts_auth.receipt_v2_verifier_keys k;').repeat(5);
 const x=evaluateCandidate(sql,decision);
 assert.equal(x.session_lock_detected,false);
 assert.equal(x.membership_lock_detected,false);
 assert.ok(x.issues.includes('STRICT_REVOCATION_ROW_LOCKS_NOT_PROVEN'));
});
