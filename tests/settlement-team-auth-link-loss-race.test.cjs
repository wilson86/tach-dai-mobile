'use strict';
// Characterization with synthetic clients. No PostgreSQL locking is exercised.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createIsolatedTeamPrototype}=require('../team-settlement/team-composition.cjs');

test('auth link loss can release the modeled lock before ledger commit', {timeout:3000}, async()=>{
  const events=[];
  let disconnected=false, revoked=false, writes=0;
  let ledgerStarted, continueLedger;
  const started=new Promise(resolve=>{ledgerStarted=resolve;});
  const proceed=new Promise(resolve=>{continueLedger=resolve;});
  function pool(kind){return {connect:async()=>{let isSession=false;return {query:async(sql,values)=>{
    if(['BEGIN','COMMIT','ROLLBACK'].includes(sql)){
      events.push(`${kind}:${sql}`);
      if(kind==='auth'&&sql==='COMMIT'&&disconnected&&isSession)throw Error('SYNTHETIC_AUTH_CONNECTION_LOST');
      if(kind==='ledger'&&sql==='COMMIT'){assert.equal(revoked,true);writes++;}
      return {rows:[]};
    }
    if(sql.includes('FROM kts_auth.sessions')){
      assert.equal(kind,'auth');assert.match(sql,/FOR SHARE/);
      isSession=true;events.push('auth:session_lock');return {rows:[{user_id:'fake_reviewer',workspace_id:'fake_group'}]};
    }
    if(sql.includes('FROM kts_team.memberships'))return {rows:[{team_role:'reviewer'}]};
    if(sql.includes('UPDATE kts_auth.sessions')){
      assert.equal(disconnected,true);events.push('auth:revoke');revoked=true;
      return {rows:[{user_id:'fake_reviewer'}],rowCount:1};
    }
    if(sql.includes('set_config'))return {rows:[]};
    if(sql.includes('kts_team.advance_review')){
      events.push('ledger:review_started');ledgerStarted();await proceed;
      return {rows:[{result:{event_id:values[6],replayed:false,new_revision:3,feed_seq:3,state:'REVIEWED'}}]};
    }
    throw Error('UNEXPECTED_QUERY');
  },release(){events.push(`${kind}:release`);}};}};}
  const app=createIsolatedTeamPrototype({authPool:pool('auth'),ledgerPool:pool('ledger'),syntheticOnly:true,syntheticReviewEnabled:true});
  const token='T'.repeat(43);
  const request={action:'approve_review',scope:{workspace_id:'fake_group',partner_id:'fake_partner',business_date:'2026-10-26',region:'mn'},expected_revision:2,idempotency_key:'fake_review_key'};
  const pending=app.ledger.advanceReview(token,request).then(value=>({value}),error=>({error}));
  try {
    await started;
    disconnected=true;events.push('auth:synthetic_link_loss');
    await app.auth.revokeSession(token);
  } finally { continueLedger(); }
  const outcome=await pending;
  assert.match(String(outcome.error),/SYNTHETIC_AUTH_CONNECTION_LOST/);
  assert.equal(writes,1);
  for(const [before,after] of [['auth:session_lock','ledger:review_started'],['ledger:review_started','auth:synthetic_link_loss'],['auth:synthetic_link_loss','auth:revoke'],['auth:revoke','ledger:COMMIT']])
    assert.ok(events.indexOf(before)>=0&&events.indexOf(before)<events.indexOf(after),`${before} before ${after}`);
  assert.equal(app.server.listening,false);
});
