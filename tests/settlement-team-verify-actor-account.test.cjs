'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Sync=require('../app/settlement-team-sync-client.js');
function make(responseUser,accountId){
 const client=Sync.createSyncClient({fetchImpl:async()=>({ok:true,status:200,json:async()=>({
  server_verified:true,membership_active:true,workspace_id:'group_a',user_id:responseUser,role:'operator'
 })})});
 client.setSessionToken('a'.repeat(43),'group_a',{accountId});return client;
}
test('manual recovery actor must equal the authenticated queue owner',async()=>{
 await assert.rejects(make('user_b','user_a').verifyActor(),/SYNC_ACTOR_UNVERIFIED/);
 await assert.rejects(make('user_a',null).verifyActor(),/SYNC_ACTOR_UNVERIFIED/);
 assert.equal((await make('user_a','user_a').verifyActor()).user_id,'user_a');
});
