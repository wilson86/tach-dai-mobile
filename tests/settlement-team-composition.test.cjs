'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createIsolatedTeamPrototype}=require('../team-settlement/team-composition.cjs');

test('team composition refuses live mode or one shared auth/accounting database role',()=>{
  const pool={connect:async()=>{throw Error('POOL_WAS_CONTACTED');}};
  assert.throws(()=>createIsolatedTeamPrototype({authPool:pool,ledgerPool:pool}),
    /TEAM_RELEASE_NOT_AUTHORIZED/);
  assert.throws(()=>createIsolatedTeamPrototype({authPool:pool,ledgerPool:pool,syntheticOnly:true}),
    /TEAM_DB_ROLES_NOT_ISOLATED/);
  assert.throws(()=>createIsolatedTeamPrototype({authPool:pool,ledgerPool:{},syntheticOnly:true}),
    /TEAM_DB_ROLES_NOT_ISOLATED/);
});
test('isolated auth and ledger pool roles compose without connecting or opening an HTTP port',()=>{
  let attempts=0;
  const authPool={connect:async()=>{attempts++;throw Error('AUTH_DATABASE_ACCESSED_UNEXPECTED');}};
  const ledgerPool={connect:async()=>{attempts++;throw Error('LEDGER_DATABASE_ACCESSED_UNEXPECTED');}};
  const app=createIsolatedTeamPrototype({authPool,ledgerPool,syntheticOnly:true,clock:()=>1000});
  try{
    assert.equal(attempts,0);
    assert.equal(app.server.listening,false);
    assert.equal(app.server.address(),null);
    assert.equal(typeof app.auth.login,'function');
    assert.equal(typeof app.ledger.appendDraft,'function');
    assert.equal(typeof app.ledger.getChanges,'function');
    assert.equal(typeof app.ledgerRepository.getScope,'function');
    assert.equal(typeof app.auth.manageMembership,'function');
    assert.throws(()=>app.auth.manageMembership(),/AUTH_ADMIN_UNAVAILABLE/);
  }finally{app.server.closeAllConnections?.();}
});

test('synthetic-only composition keeps review mutation unreachable from HTTP',async()=>{
 const pool={connect:async()=>{throw Error('POOL_MUST_NOT_CONNECT');}};
 const app=createIsolatedTeamPrototype({authPool:pool,
   ledgerPool:{connect:async()=>{throw Error('POOL_MUST_NOT_CONNECT');}},
   syntheticOnly:true,syntheticReviewEnabled:true});
 try{
   assert.equal(app.server.listening,false);
   assert.equal(typeof app.ledger.advanceReview,'function');
   assert.equal(app.server.address(),null);
 }finally{app.server.closeAllConnections?.();}
});
