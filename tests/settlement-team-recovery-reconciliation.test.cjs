'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createRecoveryReconciliation}=require('../team-settlement/recovery-reconciliation.cjs');
const {digest}=require('../team-settlement/server-ledger-api.cjs');
const actor={server_verified:true,membership_active:true,workspace_id:'group_a',
 user_id:'fake_operator',role:'operator'};
const token='a'.repeat(43);
const scope={workspace_id:'group_a',partner_id:'fake_partner_1',
 business_date:'2026-10-15',region:'mn'};
const intent=(id='draft_'+'a'.repeat(32))=>({
 id,status:'QUARANTINED',original_status:'PENDING',auto_retry:false,
 base_revision:0,scope,payload:{synthetic:true,memo:'demo'}
});
function rowFor(item=intent()){
 const request_sha256=digest({action:'create_draft',scope:item.scope,
   expected_revision:item.base_revision,payload:item.payload});
 return {idempotency_key:item.id,workspace_id:'group_a',actor_user_id:'fake_operator',
   partner_id:scope.partner_id,business_date:scope.business_date,region:scope.region,
   request_sha256,payload_sha256:request_sha256,event_kind:'DRAFT_CREATED',
   event_id:'fake_committed_event',scope_revision:1,feed_seq:'1'};
}
function testService({who=actor,rows=[],read}={}){
 let reads=0,verifies=0;
 const service=createRecoveryReconciliation({syntheticOnly:true,
   auth:{async verifySession(t){verifies++;assert.equal(t,token);return who;}},
   repository:{async lookupRecoveryReceipts(a,ids){
     reads++;assert.equal(a.user_id,who.user_id);
     return read?read(a,ids):rows;
   }}});
 return {service,get reads(){return reads;},get verifies(){return verifies;}};
}
test('server-verified synthetic receipt matches original immutable digest, not client claim',async()=>{
 const x=intent(),h=testService({rows:[rowFor(x)]});
 const result=await h.service.inspect(token,[x]);
 assert.equal(h.verifies,1);assert.equal(h.reads,1);
 assert.equal(result.status,'REVIEW_ONLY');
 assert.equal(result.auto_send_enabled,false);
 assert.equal(result.all_receipts_verified,true);
 assert.equal(result.items[0].classification,'MATCHED_SERVER_RECEIPT');
 assert.equal(result.items[0].event_id,'fake_committed_event');
 assert.equal(result.items[0].auto_retry,false);
 assert.equal(Object.isFrozen(result.items[0]),true);
});
test('missing receipt is unknown, never retryable even when read returns zero rows',async()=>{
 const h=testService(),result=await h.service.inspect(token,[intent()]);
 assert.equal(result.all_receipts_verified,false);
 assert.equal(result.items[0].classification,'UNVERIFIED_NOT_SAFE_TO_RETRY');
 assert.equal(result.auto_send_enabled,false);
});
test('unverified actor, revoked membership and viewer/reviewer role fail before SQL read',async()=>{
 for(const who of [{...actor,server_verified:false},{...actor,membership_active:false},
   {...actor,role:'viewer'},{...actor,role:'reviewer'},{...actor,workspace_id:'group_b'}]){
   const h=testService({who});
   await assert.rejects(h.service.inspect(token,[intent()]),
     /TEAM_ACTOR_UNVERIFIED|TEAM_RECOVERY_ROLE_DENIED|TEAM_RECOVERY_QUARANTINE_REQUIRED/);
   assert.equal(h.reads,0);
 }
});
test('forged or cross-tenant/actor receipt aborts entire reconciliation',async()=>{
 const good=rowFor();
 for(const bad of [
   {...good,workspace_id:'group_b'}, {...good,actor_user_id:'fake_other'},
   {...good,request_sha256:'0'.repeat(64)},{...good,payload_sha256:'0'.repeat(64)},
   {...good,event_kind:'REVIEWED'}, {...good,scope_revision:2},
   {...good,feed_seq:'0'}, {...good,event_id:'unsafe space'},
   {...good,business_date:'2026-10-14'}
 ]){
   const h=testService({rows:[bad]});
   await assert.rejects(h.service.inspect(token,[intent()]),
     /TEAM_RECOVERY_RECEIPT_MISMATCH/);
 }
});
test('duplicate, unknown and forged quarantine intents cannot alter server authority',async()=>{
 for(const rows of [[rowFor(),rowFor()],[{...rowFor(),idempotency_key:'other'}]]){
   const h=testService({rows});
   await assert.rejects(h.service.inspect(token,[intent()]),
     /TEAM_RECOVERY_RECEIPT_UNVERIFIED/);
 }
 for(const inputs of [[intent(),intent()],
   [{...intent(),status:'PENDING'}],[{...intent(),auto_retry:true}],
   [{...intent(),original_status:'SYNCED'}],
   [{...intent(),scope:{...scope,partner_id:'real_customer'}}],
   [{...intent(),payload:{synthetic:false}}]]){
   const h=testService();
   await assert.rejects(h.service.inspect(token,inputs),
     /TEAM_RECOVERY_QUARANTINE_REQUIRED|TEAM_RECOVERY_DUPLICATE_INTENT/);
   assert.equal(h.reads,0);
 }
});
test('active bearer and explicit synthetic flag are mandatory',async()=>{
 const service=testService();
 await assert.rejects(service.service.inspect('bad',[intent()]),/AUTH_SESSION_INVALID/);
 assert.equal(service.verifies,0);
 assert.throws(()=>createRecoveryReconciliation({auth:{verifySession(){}},
   repository:{lookupRecoveryReceipts(){}}}),/TEAM_RECOVERY_RECONCILIATION_DISABLED/);
});
test('mixed evidence remains review-only, absence cannot authorize any automatic POST',async()=>{
 const a=intent(),b=intent('draft_'+'b'.repeat(32));
 const result=await testService({rows:[rowFor(a)]}).service.inspect(token,[a,b]);
 assert.deepEqual(result.items.map(x=>x.classification),
   ['MATCHED_SERVER_RECEIPT','UNVERIFIED_NOT_SAFE_TO_RETRY']);
 assert.equal(result.auto_send_enabled,false);
 assert.equal(result.items.every(x=>x.auto_retry===false),true);
});
