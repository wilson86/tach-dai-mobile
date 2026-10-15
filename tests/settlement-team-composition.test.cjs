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

test('synthetic-only read-only receipt inspector is NOT enabled or connected by default',async()=>{
 const counter={auth:0,ledger:0};
 const fakePool=(key)=>({async connect(){counter[key]++;throw Error('POOL_MUST_NOT_CONNECT');}});
 const app=createIsolatedTeamPrototype({authPool:fakePool('auth'),
  ledgerPool:fakePool('ledger'),syntheticOnly:true});
 try{
  assert.equal(app.server.listening,false);
  assert.deepEqual(counter,{auth:0,ledger:0});
  await new Promise(ok=>app.server.listen(0,'127.0.0.1',ok));
  const url='http://127.0.0.1:'+app.server.address().port;
  const response=await fetch(url+'/v1/recovery/receipts/inspect',{
   method:'POST',headers:{authorization:'Bearer '+'a'.repeat(43),
     'content-type':'application/json'},
   body:JSON.stringify({explicit_consent:true,quarantined:[]})});
  assert.equal(response.status,404);
  assert.deepEqual(await response.json(),{error:'TEAM_ROUTE_NOT_ENABLED'});
  assert.deepEqual(counter,{auth:0,ledger:0});
 }finally{
  if(app.server.listening)await new Promise(ok=>app.server.close(ok));
 }
});
test('enabling synthetic receipt inspection is opt-in and does not connect or listen at construction',async()=>{
 let connected=0;
 const pool=()=>({async connect(){connected++;throw Error('POOL_MUST_NOT_CONNECT')}});
 const app=createIsolatedTeamPrototype({authPool:pool(),ledgerPool:pool(),
  syntheticOnly:true,syntheticRecoveryInspectEnabled:true});
 try{
  assert.equal(app.server.listening,false);
  assert.equal(connected,0);
  await new Promise(ok=>app.server.listen(0,'127.0.0.1',ok));
  const url='http://127.0.0.1:'+app.server.address().port;
  const missing=await fetch(url+'/v1/recovery/receipts/inspect',{method:'POST',
   headers:{'content-type':'application/json'},
   body:JSON.stringify({explicit_consent:true,quarantined:[]})});
  assert.equal(missing.status,401);
  const malformed=await fetch(url+'/v1/recovery/receipts/inspect',{method:'POST',
   headers:{authorization:'Bearer '+'a'.repeat(43),
    'content-type':'application/json'},
   body:JSON.stringify({explicit_consent:false,quarantined:[]})});
  assert.equal(malformed.status,422);
  assert.equal(connected,0);
 }finally{
  if(app.server.listening)await new Promise(ok=>app.server.close(ok));
 }
 assert.throws(()=>createIsolatedTeamPrototype({authPool:pool(),ledgerPool:pool(),
  syntheticOnly:true,syntheticRecoveryInspectEnabled:'true'}),
  /TEAM_RECOVERY_CONFIG_INVALID/);
 assert.throws(()=>createIsolatedTeamPrototype({authPool:pool(),ledgerPool:pool(),
  syntheticRecoveryInspectEnabled:true}),/TEAM_RELEASE_NOT_AUTHORIZED/);
});
