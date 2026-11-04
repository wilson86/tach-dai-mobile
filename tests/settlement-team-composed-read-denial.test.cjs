'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createIsolatedTeamPrototype}=require('../team-settlement/team-composition.cjs');

test('all composed Ledger tenant reads fail before any SQL connection',async()=>{
  let authConnections=0,ledgerConnections=0;
  const authPool={connect:async()=>{authConnections++;throw Error('UNEXPECTED_AUTH_CONNECT');}};
  const ledgerPool={connect:async()=>{ledgerConnections++;throw Error('UNEXPECTED_LEDGER_CONNECT');}};
  const app=createIsolatedTeamPrototype({authPool,ledgerPool,syntheticOnly:true,
    syntheticRecoveryInspectEnabled:true});
  try{
    assert.equal(app.server.listening,false);
    for(const method of ['getScope','getChanges','listCounterparties','lookupRecoveryReceipts']){
      assert.equal(typeof app.ledgerRepository[method],'function');
      await assert.rejects(app.ledgerRepository[method](
        {workspace_id:'synthetic_tenant',user_id:'synthetic_actor'}),
        {message:'TEAM_DB_TENANT_READ_BOUNDARY_UNAVAILABLE'});
    }
    assert.equal(ledgerConnections,0);
    assert.equal(authConnections,0);
    assert.equal(app.server.listening,false);
  }finally{app.server.closeAllConnections?.();}
});

test('the same composition still blocks every Ledger financial mutation',async()=>{
  const pool=()=>({connect:async()=>{throw Error('UNEXPECTED_CONNECT');}});
  const app=createIsolatedTeamPrototype({authPool:pool(),ledgerPool:pool(),syntheticOnly:true});
  for(const method of ['appendDraft','appendDraftWithSessionProof',
    'reconcileDraftWithSessionProof','advanceReview',
    'advanceReviewWithSessionProof','reconcileReviewWithSessionProof']){
    await assert.rejects(app.ledgerRepository[method](),
      {message:'TEAM_DB_ATOMIC_SESSION_BOUNDARY_UNAVAILABLE'});
  }
  assert.equal(app.server.listening,false);
});
