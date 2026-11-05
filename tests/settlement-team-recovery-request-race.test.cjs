'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createSyncClient}=require('../app/settlement-team-sync-client.js');
const idA='draft_'+'a'.repeat(32),idB='draft_'+'b'.repeat(32);
async function run(responseId){
 let release,sent;const gate=new Promise(resolve=>{release=resolve;});
 const client=createSyncClient({fetchImpl:async(_url,options)=>{
  sent=JSON.parse(options.body);await gate;
  return {ok:true,status:200,json:async()=>({status:'REVIEW_ONLY',auto_send_enabled:false,
   all_receipts_verified:true,items:[{id:responseId,classification:'MATCHED_SERVER_RECEIPT',auto_retry:false}]})};
 }});
 client.setSessionToken('a'.repeat(43),'group_a',{accountId:'user_a'});
 const items=[{id:idA,status:'QUARANTINED',original_status:'PENDING',auto_retry:false,base_revision:0,
  scope:{workspace_id:'group_a',partner_id:'fake_partner_1',business_date:'2026-11-05',region:'mn'},payload:{synthetic:true}}];
 const pending=client.inspectRecoveryReceipts(items,{syntheticOnly:true,explicitConsent:true});
 items[0].id=idB;release();
 return {pending,sent};
}
test('receipt inspection checks original request identities despite caller mutation',async()=>{
 const wrong=await run(idB);assert.equal(wrong.sent.quarantined[0].id,idA);
 await assert.rejects(wrong.pending,/TEAM_RECOVERY_RECEIPT_UNVERIFIED/);
 const correct=await run(idA);assert.equal(correct.sent.quarantined[0].id,idA);
 assert.equal((await correct.pending).items[0].id,idA);
});
