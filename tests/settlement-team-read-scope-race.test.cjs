'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createSyncClient}=require('../app/settlement-team-sync-client.js');
async function run(returnedPartner){
 let release,requested;const gate=new Promise(resolve=>{release=resolve;});
 const client=createSyncClient({fetchImpl:async url=>{
  requested=url;await gate;
  return {ok:true,status:200,json:async()=>({workspace_id:'group_a',partner_id:returnedPartner,
    business_date:'2026-11-05',region:'mn',revision:0,state:'DRAFT'})};
 }});
 client.setSessionToken('a'.repeat(43),'group_a',{accountId:'user_a'});
 const scope={workspace_id:'group_a',partner_id:'fake_partner_1',business_date:'2026-11-05',region:'mn'};
 const pending=client.readScope(scope);scope.partner_id='fake_partner_2';release();
 return {result:await pending,requested};
}
test('scope response is checked against request snapshot even if caller mutates the scope',async()=>{
 const wrong=await run('fake_partner_2');
 assert.equal(wrong.requested,'/v1/scopes/fake_partner_1/2026-11-05/mn');
 assert.equal(wrong.result.status,'BLOCKED');
 assert.equal(wrong.result.error,'SYNC_SCOPE_UNVERIFIED');
 const correct=await run('fake_partner_1');
 assert.equal(correct.result.status,'SYNCED');
 assert.equal(correct.result.scope.partner_id,'fake_partner_1');
});
