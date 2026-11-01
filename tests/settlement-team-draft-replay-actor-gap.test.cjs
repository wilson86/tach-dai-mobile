'use strict';
// Characterization of the real JS call chain with a simulated SQL replay.
// This is NOT execution of the PostgreSQL function or a security qualification.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createPostgresLedgerRepository}=require('../team-settlement/postgres-ledger-repository.cjs');
const {createServerLedgerApi}=require('../team-settlement/server-ledger-api.cjs');

test('a simulated prior actor receipt can be accepted for another authorized actor',async()=>{
  const calls=[];
  const auth={verifySession:async token=>({server_verified:true,membership_active:true,
    user_id:token==='operator_a'?'operator_a':'operator_b',workspace_id:'fake_group',role:'operator'})};
  const db={transaction:async work=>work({query:async(sql,values)=>{
    if(sql.includes('set_config'))return {rows:[]};
    if(sql.includes('FROM kts_team.memberships'))return {rows:[{team_role:'operator'}]};
    if(sql.includes('kts_team.append_draft')){
      calls.push(values);
      return {rows:[{result:{event_id:'event_a',replayed:true,new_revision:1,feed_seq:1}}]};
    }
    throw Error('UNEXPECTED_FIXTURE_QUERY');
  }})};
  const api=createServerLedgerApi({auth,repository:createPostgresLedgerRepository({db}),eventId:()=> 'event_candidate'});
  const input={scope:{workspace_id:'fake_group',partner_id:'fake_customer',business_date:'2026-10-26',region:'mn'},
    expected_revision:0,idempotency_key:'fake_shared_key',payload:{synthetic:true}};
  const first=await api.appendDraft('operator_a',input);
  const second=await api.appendDraft('operator_b',input);
  assert.equal(calls.length,2);
  assert.equal(calls[0][7],calls[1][7], 'request digest does not distinguish actors');
  assert.equal(first.sync_status,'SYNCED');
  assert.equal(second.sync_status,'SYNCED');
  assert.equal(second.event_id,'event_a');
});
