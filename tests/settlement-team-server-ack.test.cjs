'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServerLedgerApi } = require('../team-settlement/server-ledger-api.cjs');

const scope = { workspace_id:'group_a', partner_id:'counterparty_1',
  business_date:'2026-10-12', region:'mn' };
const trusted = { server_verified:true, membership_active:true, user_id:'operator_1',
  workspace_id:'group_a', role:'operator' };
const intent = { scope, expected_revision:0, idempotency_key:'synthetic_request_1',
  payload:{ synthetic:true } };

function candidate(reply) {
  let calls = 0;
  const auth = { verifySession:async()=>trusted };
  const repository = {
    appendDraft:async()=>{ calls++; return reply; },
    getScope:async()=>{ throw Error('NO_READ'); }
  };
  const api = createServerLedgerApi({auth,repository,eventId:()=> 'candidate_event_1'});
  return {api, count:()=>calls};
}

test('verified non-replay SQL receipt is the only successful new-write SYNCED claim',async()=>{
  const {api}=candidate({event_id:'candidate_event_1',replayed:false,new_revision:1,feed_seq:1});
  const result=await api.appendDraft('synthetic_session',intent);
  assert.equal(result.sync_status,'SYNCED');
  assert.equal(result.event_id,'candidate_event_1');
  assert.equal(result.new_revision,1);
});

test('valid idempotent replay accepts only an explicit replay receipt',async()=>{
  const {api}=candidate({event_id:'previous_committed_event',replayed:true});
  const replay=await api.appendDraft('synthetic_session',intent);
  assert.equal(replay.sync_status,'SYNCED');
  assert.equal(replay.event_id,'previous_committed_event');
  assert.equal(replay.replayed,true);
});

test('missing or contradictory database receipts never become SYNCED',async()=>{
  for(const receipt of [
    null, undefined, {}, {ok:true}, {event_id:'candidate_event_1'},
    {event_id:'candidate_event_1',replayed:false},
    {event_id:'candidate_event_1',replayed:false,new_revision:0},
    {event_id:'unrelated_event',replayed:false,new_revision:1},
    {event_id:'candidate_event_1',replayed:'false',new_revision:1},
    {event_id:' ',replayed:true}, [],
    {event_id:'candidate_event_1',replayed:false,new_revision:'1'}
  ]){
    const {api}=candidate(receipt);
    await assert.rejects(api.appendDraft('synthetic_session',intent),
      /TEAM_DRAFT_RECEIPT_UNVERIFIED/,JSON.stringify(receipt));
  }
});

test('revision overflow fails before calling the database',async()=>{
  const {api,count}=candidate({event_id:'candidate_event_1',replayed:false,new_revision:1});
  await assert.rejects(api.appendDraft('synthetic_session',
    {...intent,expected_revision:Number.MAX_SAFE_INTEGER}),/TEAM_REVISION_INVALID/);
  assert.equal(count(),0);
});


test('read-only server boundary rejects wrong-scope repository data',async()=>{
  for(const response of [
    null, {},
    {...scope,workspace_id:'group_b'},
    {...scope,partner_id:'different'},
    {...scope,business_date:'2026-10-11'},
    {...scope,region:'mt'}
  ]){
    let reads=0;
    const auth={verifySession:async()=>trusted};
    const repository={
      appendDraft:async()=>{throw Error('UNEXPECTED_WRITE');},
      getScope:async()=>{reads++;return response;}
    };
    const api=createServerLedgerApi({auth,repository});
    await assert.rejects(api.getScope('synthetic_session',scope),
      /TEAM_SCOPE_RESPONSE_UNVERIFIED/);
    assert.equal(reads,1);
    await assert.rejects(api.getScope('synthetic_session',
      {...scope,workspace_id:'group_b'}),/TEAM_WORKSPACE_DENIED/);
    assert.equal(reads,1);
  }
});
test('matching session-bound repository scope remains readable',async()=>{
  const auth={verifySession:async()=>trusted};
  const record={...scope,state:'DRAFT',revision:2};
  const repository={
    appendDraft:async()=>{throw Error('UNEXPECTED_WRITE');},
    getScope:async()=>record
  };
  const api=createServerLedgerApi({auth,repository});
  assert.deepEqual(await api.getScope('synthetic_session',scope),record);
});
