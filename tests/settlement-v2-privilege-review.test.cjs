'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {evaluateCandidate}=require('../scripts/settlement-v2-privilege-review.cjs');
const sql=('SELECT s.session_handle FROM kts_auth.sessions s WHERE s.session_handle=$1 FOR SHARE;\n'+
 'SELECT m.team_role FROM kts_team.memberships m JOIN kts_team.identities i ON i.user_id=m.user_id FOR SHARE OF m,i;\n'+
 'SELECT k.secret_bytes FROM kts_auth.receipt_v2_verifier_keys k;').repeat(6);
const decision=('The owner has only necessary schema USAGE, column SELECT and audited hmac EXECUTE. SQL verifier NOT_RUN.\n').repeat(5);
test('reproduces conflict: SELECT FOR SHARE requires UPDATE while owner contract says SELECT only',()=>{
 const result=evaluateCandidate(sql,decision);
 assert.equal(result.session_lock_detected,true);
 assert.equal(result.membership_lock_detected,true);
 assert.equal(result.declaration_select_only,true);
 assert.ok(result.issues.includes('FOR_SHARE_REQUIRES_UPDATE_PRIVILEGE_ON_LOCKED_TABLES'));
 assert.equal(result.production_ready,false);
});
test('source changes must never turn source scan into independent signoff',()=>{
 const r=evaluateCandidate(sql.replaceAll('FOR SHARE','FOR KEY SHARE'),decision);
 assert.equal(r.verdict,'BLOCKED_REVIEW_REQUIRED');
 assert.equal(r.production_ready,false);
 assert.equal(r.postgres_executed,false);
 assert.equal(r.independent_review_approved,false);
});
test('invalid or missing source is rejected',()=>{
 for(const input of ['',null,undefined])
   assert.throws(()=>evaluateCandidate(input,decision),/REVIEW_INPUT_INVALID/);
 assert.throws(()=>evaluateCandidate(sql,'no'),/REVIEW_INPUT_INVALID/);
});
