'use strict';
// Direct, deliberately unguarded auth/API/repository composition with fake
// pool clients. Candidate app composition separately blocks these writes.
const {test}=require('node:test');const assert=require('node:assert/strict');
const {createIsolatedTeamPrototype}=require('../team-settlement/team-composition.cjs');
const {createServerLedgerApi}=require('../team-settlement/server-ledger-api.cjs');
const {createPostgresLedgerRepository}=require('../team-settlement/postgres-ledger-repository.cjs');
const {createPgTransactionAdapter}=require('../team-settlement/pg-transaction-adapter.cjs');
function fixture({failLedger=false,failAuthCommit=false,failLedgerRelease=false}={}){
  const events=[];let authFailed=false,pending=null,committed=null,syntheticWrites=0;
  function pool(kind){return {connect:async()=>({query:async(sql,values)=>{
    if(['BEGIN','COMMIT','ROLLBACK'].includes(sql)){
      events.push(`${kind}:${sql}`);
      if(kind==='ledger'&&sql==='COMMIT'&&pending){committed=pending;pending=null;syntheticWrites++;}
      if(kind==='ledger'&&sql==='ROLLBACK')pending=null;
      if(kind==='auth'&&sql==='COMMIT'&&failAuthCommit&&!authFailed){authFailed=true;throw Error('SYNTHETIC_AUTH_COMMIT_FAILURE');}
      return {rows:[],command:sql};
    }
    if(sql.includes('FROM kts_auth.sessions')){assert.equal(kind,'auth');assert.match(sql,/FOR SHARE/);events.push('auth:session_lock');return {rows:[{user_id:'fake_reviewer',workspace_id:'fake_group'}]};}
    if(sql.includes('FROM kts_team.memberships'))return {rows:[{team_role:'reviewer'}]};
    if(sql.includes('set_config'))return {rows:[]};
    if(sql.includes('kts_team.advance_review')){assert.equal(kind,'ledger');events.push('ledger:review');if(failLedger)throw Error('SYNTHETIC_LEDGER_ERROR');
      if(committed){assert.equal(values[7],committed.key);assert.equal(values[8],committed.hash);
        return {rows:[{result:{event_id:committed.event,replayed:true,new_revision:3,feed_seq:3,state:'REVIEWED'}}]};}
      pending={event:values[6],key:values[7],hash:values[8]};
      return {rows:[{result:{event_id:values[6],replayed:false,new_revision:3,feed_seq:3,state:'REVIEWED'}}]};}
    throw Error('UNEXPECTED_QUERY');
  },release(){events.push(`${kind}:release`);if(kind==='ledger'&&failLedgerRelease)throw Error('SYNTHETIC_RELEASE_FAILURE');}})};}
  const authPool=pool('auth'),ledgerPool=pool('ledger');
  const guarded=createIsolatedTeamPrototype({authPool,ledgerPool,syntheticOnly:true,syntheticReviewEnabled:true});
  const repo=createPostgresLedgerRepository({db:createPgTransactionAdapter({pool:ledgerPool})});
  const ledger=createServerLedgerApi({auth:guarded.auth,repository:repo,syntheticReviewEnabled:true,requireSessionLockForWrites:true});
  return {app:{...guarded,ledger},events,stats:()=>({syntheticWrites,committedEvent:committed&&committed.event})};
}
const request={action:'approve_review',scope:{workspace_id:'fake_group',partner_id:'fake_partner',business_date:'2026-10-26',region:'mn'},expected_revision:2,idempotency_key:'fake_review_key'};
test('unguarded direct API commits ledger before releasing auth transaction',async()=>{
  const {app,events}=fixture();const result=await app.ledger.advanceReview('T'.repeat(43),request);
  assert.equal(result.review_state,'REVIEWED');
  assert.ok(events.indexOf('auth:session_lock')<events.indexOf('ledger:BEGIN'));
  assert.ok(events.indexOf('ledger:COMMIT')<events.indexOf('auth:COMMIT'));
  assert.ok(events.includes('auth:release')&&events.includes('ledger:release'));
  assert.equal(app.server.listening,false);
});
test('unguarded direct API rolls both fixture transactions back on ledger failure',async()=>{
  const {app,events}=fixture({failLedger:true});
  await assert.rejects(app.ledger.advanceReview('T'.repeat(43),request),/SYNTHETIC_LEDGER_ERROR/);
  assert.ok(events.indexOf('auth:session_lock')<events.indexOf('ledger:BEGIN'));
  assert.ok(events.indexOf('ledger:ROLLBACK')<events.indexOf('auth:ROLLBACK'));
  assert.ok(events.includes('auth:release')&&events.includes('ledger:release'));
  assert.equal(app.server.listening,false);
});
test('auth commit failure is not SYNCED and synthetic retry reuses the receipt',async()=>{
  const {app,events,stats}=fixture({failAuthCommit:true});
  await assert.rejects(app.ledger.advanceReview('T'.repeat(43),request),/TEAM_MUTATION_OUTCOME_UNKNOWN/);
  assert.ok(events.indexOf('ledger:COMMIT')<events.indexOf('auth:COMMIT'));
  assert.ok(events.includes('auth:ROLLBACK'));
  const first=stats();assert.equal(first.syntheticWrites,1);assert.ok(first.committedEvent);
  const retry=await app.ledger.advanceReview('T'.repeat(43),request);
  assert.equal(retry.sync_status,'SYNCED');assert.equal(retry.replayed,true);
  assert.equal(retry.event_id,first.committedEvent);assert.equal(stats().syntheticWrites,1);
  assert.equal(app.server.listening,false);
});
test('ledger release failure after commit reaches API as unknown outcome',async()=>{
  const {app,events,stats}=fixture({failLedgerRelease:true});
  await assert.rejects(app.ledger.advanceReview('T'.repeat(43),request),/TEAM_MUTATION_OUTCOME_UNKNOWN/);
  assert.equal(stats().syntheticWrites,1);
  assert.ok(events.indexOf('ledger:COMMIT')<events.indexOf('ledger:release'));
  assert.ok(events.includes('auth:ROLLBACK'));
  assert.equal(app.server.listening,false);
});
