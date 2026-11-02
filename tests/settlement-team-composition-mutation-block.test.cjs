'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createIsolatedTeamPrototype}=require('../team-settlement/team-composition.cjs');

test('composition denies mutation even if verifyPools is skipped',async()=>{
  let ledgerConnections=0;
  const authPool={connect:async()=>({
    async query(sql){
      if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return {rows:[],command:sql};
      if(sql.includes('FROM kts_auth.sessions'))return {rows:[{user_id:'fake_operator',workspace_id:'group_a'}]};
      if(sql.includes('FROM kts_team.memberships'))return {rows:[{team_role:'operator'}]};
      if(sql.includes('set_config'))return {rows:[]};
      throw Error('UNEXPECTED_SYNTHETIC_SQL');
    },release(){}
  })};
  const ledgerPool={connect:async()=>{ledgerConnections++;throw Error('LEDGER_MUST_NOT_CONNECT');}};
  const app=createIsolatedTeamPrototype({authPool,ledgerPool,syntheticOnly:true,syntheticReviewEnabled:true});
  await assert.rejects(app.ledgerRepository.appendDraft(),/TEAM_DB_ATOMIC_SESSION_BOUNDARY_UNAVAILABLE/);
  await assert.rejects(app.ledgerRepository.appendDraftWithSessionProof(),/TEAM_DB_ATOMIC_SESSION_BOUNDARY_UNAVAILABLE/);
  await assert.rejects(app.ledgerRepository.reconcileDraftWithSessionProof(),/TEAM_DB_ATOMIC_SESSION_BOUNDARY_UNAVAILABLE/);
  await assert.rejects(app.ledgerRepository.advanceReview(),/TEAM_DB_ATOMIC_SESSION_BOUNDARY_UNAVAILABLE/);
  await assert.rejects(app.ledgerRepository.advanceReviewWithSessionProof(),/TEAM_DB_ATOMIC_SESSION_BOUNDARY_UNAVAILABLE/);
  await assert.rejects(app.ledgerRepository.reconcileReviewWithSessionProof(),/TEAM_DB_ATOMIC_SESSION_BOUNDARY_UNAVAILABLE/);
  const scope={workspace_id:'group_a',partner_id:'fake_partner',business_date:'2026-10-26',region:'mn'};
  await assert.rejects(app.ledger.appendDraft('a'.repeat(43),{scope,expected_revision:0,idempotency_key:'fake_key',payload:{synthetic:true}}),/TEAM_DB_ATOMIC_SESSION_BOUNDARY_UNAVAILABLE/);
  await assert.rejects(app.ledger.advanceReview('a'.repeat(43),{action:'submit_review',scope,expected_revision:1,idempotency_key:'fake_key'}),/TEAM_DB_ATOMIC_SESSION_BOUNDARY_UNAVAILABLE/);
  assert.equal(ledgerConnections,0);
  assert.equal(app.server.listening,false);
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  try{
    const base=`http://127.0.0.1:${app.server.address().port}`;
    for(const [path,body,status] of [
      ['/v1/scopes/drafts',{scope,expected_revision:0,idempotency_key:'fake_key',payload:{synthetic:true}},500],
      ['/v1/scopes/review',{action:'submit_review',scope,expected_revision:1,idempotency_key:'fake_key'},503]
    ]){
      const response=await fetch(base+path,{method:'POST',headers:{authorization:'Bearer '+'a'.repeat(43),'content-type':'application/json'},body:JSON.stringify(body)});
      assert.equal(response.status,status);
      assert.notEqual((await response.json()).sync_status,'SYNCED');
    }
    assert.equal(ledgerConnections,0);
  }finally{await new Promise(resolve=>app.server.close(resolve));}
});
