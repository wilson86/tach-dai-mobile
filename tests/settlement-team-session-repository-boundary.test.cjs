'use strict';
// Synthetic contract evidence: the server verifies the bearer, but forwards
// an actor object rather than that bearer to the shared ledger repository.
// This does not establish a database-enforced, unforgeable actor binding.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createServerLedgerApi}=require('../team-settlement/server-ledger-api.cjs');
const token='S'.repeat(43),scope={workspace_id:'fake_group',partner_id:'fake_customer',business_date:'2026-10-26',region:'mn'};
for(const action of ['draft','review'])test(`${action} repository receives verified actor without session bearer`,async()=>{
  const reviewer=action==='review';const actor={server_verified:true,membership_active:true,user_id:reviewer?'fake_reviewer':'fake_operator',workspace_id:scope.workspace_id,role:reviewer?'reviewer':'operator'};
  let received=null;
  const auth={verifySession:async value=>{assert.equal(value,token);return actor;}};
  const repository={getScope:async()=>{},appendDraft:async(a,i)=>{received={a,i};return {event_id:i.event_id,replayed:false,new_revision:1,feed_seq:1};},advanceReview:async(a,i)=>{received={a,i};return {event_id:i.event_id,replayed:false,new_revision:3,feed_seq:3,state:'REVIEWED'};}};
  const api=createServerLedgerApi({auth,repository,eventId:()=> 'event_fixture',syntheticReviewEnabled:true});
  if(reviewer)await api.advanceReview(token,{scope,action:'approve_review',expected_revision:2,idempotency_key:'review_fixture'});
  else await api.appendDraft(token,{scope,expected_revision:0,idempotency_key:'draft_fixture',payload:{synthetic:true}});
  assert.equal(received.a.user_id,actor.user_id);assert.equal(received.i.scope.workspace_id,scope.workspace_id);
  assert.ok(!JSON.stringify(received).includes(token));assert.equal(received.i.expected_revision,reviewer?2:0);
});
