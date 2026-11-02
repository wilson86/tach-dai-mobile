'use strict';
// Real composition, auth, API, repository and transaction adapter; fake pool
// clients only. This proves JS transaction order, not PostgreSQL row locking.
const {test}=require('node:test');const assert=require('node:assert/strict');
const {createIsolatedTeamPrototype}=require('../team-settlement/team-composition.cjs');
function fixture({failLedger=false,failAuthCommit=false}={}){
  const events=[];
  function pool(kind){return {connect:async()=>({query:async(sql,values)=>{
    if(['BEGIN','COMMIT','ROLLBACK'].includes(sql)){events.push(`${kind}:${sql}`);if(kind==='auth'&&sql==='COMMIT'&&failAuthCommit)throw Error('SYNTHETIC_AUTH_COMMIT_FAILURE');return {rows:[]};}
    if(sql.includes('FROM kts_auth.sessions')){assert.equal(kind,'auth');assert.match(sql,/FOR SHARE/);events.push('auth:session_lock');return {rows:[{user_id:'fake_reviewer',workspace_id:'fake_group'}]};}
    if(sql.includes('FROM kts_team.memberships'))return {rows:[{team_role:'reviewer'}]};
    if(sql.includes('set_config'))return {rows:[]};
    if(sql.includes('kts_team.advance_review')){assert.equal(kind,'ledger');events.push('ledger:review');if(failLedger)throw Error('SYNTHETIC_LEDGER_ERROR');
      return {rows:[{result:{event_id:values[6],replayed:false,new_revision:3,feed_seq:3,state:'REVIEWED'}}]};}
    throw Error('UNEXPECTED_QUERY');
  },release(){events.push(`${kind}:release`);}})};}
  const app=createIsolatedTeamPrototype({authPool:pool('auth'),ledgerPool:pool('ledger'),syntheticOnly:true,syntheticReviewEnabled:true});
  return {app,events};
}
const request={action:'approve_review',scope:{workspace_id:'fake_group',partner_id:'fake_partner',business_date:'2026-10-26',region:'mn'},expected_revision:2,idempotency_key:'fake_review_key'};
test('real composition commits the ledger before releasing the auth transaction',async()=>{
  const {app,events}=fixture();const result=await app.ledger.advanceReview('T'.repeat(43),request);
  assert.equal(result.review_state,'REVIEWED');
  assert.ok(events.indexOf('auth:session_lock')<events.indexOf('ledger:BEGIN'));
  assert.ok(events.indexOf('ledger:COMMIT')<events.indexOf('auth:COMMIT'));
  assert.ok(events.includes('auth:release')&&events.includes('ledger:release'));
  assert.equal(app.server.listening,false);
});
test('real composition rolls both fixture transactions back on ledger failure',async()=>{
  const {app,events}=fixture({failLedger:true});
  await assert.rejects(app.ledger.advanceReview('T'.repeat(43),request),/SYNTHETIC_LEDGER_ERROR/);
  assert.ok(events.indexOf('auth:session_lock')<events.indexOf('ledger:BEGIN'));
  assert.ok(events.indexOf('ledger:ROLLBACK')<events.indexOf('auth:ROLLBACK'));
  assert.ok(events.includes('auth:release')&&events.includes('ledger:release'));
  assert.equal(app.server.listening,false);
});
test('auth commit failure after ledger commit does not return SYNCED',async()=>{
  const {app,events}=fixture({failAuthCommit:true});
  await assert.rejects(app.ledger.advanceReview('T'.repeat(43),request),/SYNTHETIC_AUTH_COMMIT_FAILURE/);
  assert.ok(events.indexOf('ledger:COMMIT')<events.indexOf('auth:COMMIT'));
  assert.ok(events.includes('auth:ROLLBACK'));
  assert.equal(app.server.listening,false);
});
