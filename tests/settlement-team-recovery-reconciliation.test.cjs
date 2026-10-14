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

const {createPostgresLedgerRepository}=require('../team-settlement/postgres-ledger-repository.cjs');
function fakeDatabase({revoked=false,rows=[]}={}){
 const calls=[];
 const db={async transaction(run){return run({async query(sql,args=[]){
   calls.push({sql,args});
   if(sql.includes('set_config'))return {rows:[]};
   if(sql.includes('FROM kts_team.memberships'))
     return {rows:revoked?[]:[{team_role:'operator'}]};
   if(sql.includes('FROM kts_team.idempotency_receipts'))return {rows};
   throw Error('UNEXPECTED_SQL');
 }});}};
 return {db,calls};
}
test('receipt repository uses one tenant-actor-scoped SELECT after membership recheck',async()=>{
 const item=intent(),verified=rowFor(item),f=fakeDatabase({rows:[verified]});
 const repository=createPostgresLedgerRepository({db:f.db});
 const records=await repository.lookupRecoveryReceipts(actor,[item.id]);
 assert.equal(records.length,1);
 assert.equal(records[0].event_id,verified.event_id);
 assert.equal(Object.isFrozen(records),true);
 assert.equal(Object.isFrozen(records[0]),true);
 assert.equal(f.calls.length,3);
 assert.match(f.calls[0].sql,/set_config/);
 assert.match(f.calls[1].sql,/FROM kts_team.memberships/);
 assert.match(f.calls[2].sql,/^SELECT/);
 assert.match(f.calls[2].sql,/JOIN kts_team.scope_events/);
 assert.match(f.calls[2].sql,/r.workspace_id=\$1/);
 assert.match(f.calls[2].sql,/e.actor_user_id=\$2/);
 assert.deepEqual(f.calls[2].args,['group_a','fake_operator',[item.id]]);
});
test('revoked membership, bad id, forged SQL actor and duplicate receipt never pass',async()=>{
 const item=intent(),rec=rowFor(item);
 const revoked=fakeDatabase({revoked:true,rows:[rec]});
 await assert.rejects(createPostgresLedgerRepository({db:revoked.db})
   .lookupRecoveryReceipts(actor,[item.id]),/AUTH_SESSION_REVOKED/);
 assert.equal(revoked.calls.length,2);
 const preflight=fakeDatabase({rows:[rec]});
 const repository=createPostgresLedgerRepository({db:preflight.db});
 for(const keys of [[item.id,item.id],['invalid key'],[],Array(31).fill(item.id)])
   await assert.rejects(repository.lookupRecoveryReceipts(actor,keys),
     /TEAM_RECOVERY_KEY_INVALID/);
 assert.equal(preflight.calls.length,0);
 for(const row of [
   {...rec,actor_user_id:'fake_other'},
   {...rec,workspace_id:'group_b'},
   {...rec,idempotency_key:'draft_'+'b'.repeat(32)}
 ]){
   const source=fakeDatabase({rows:[row]});
   await assert.rejects(createPostgresLedgerRepository({db:source.db})
     .lookupRecoveryReceipts(actor,[item.id]),/TEAM_RECOVERY_RECEIPT_UNVERIFIED/);
 }
 const dup=fakeDatabase({rows:[rec,rec]});
 await assert.rejects(createPostgresLedgerRepository({db:dup.db})
   .lookupRecoveryReceipts(actor,[item.id]),/TEAM_RECOVERY_RECEIPT_UNVERIFIED/);
});
test('default-off repository lookup plus review service preserves unknown on empty SQL evidence',async()=>{
 const db=fakeDatabase({rows:[]});
 const repository=createPostgresLedgerRepository({db:db.db});
 const service=createRecoveryReconciliation({syntheticOnly:true,
   auth:{async verifySession(){return actor;}},repository});
 const report=await service.inspect(token,[intent()]);
 assert.equal(report.items[0].classification,'UNVERIFIED_NOT_SAFE_TO_RETRY');
 assert.equal(report.auto_send_enabled,false);
 assert.equal(db.calls.some(x=>/INSERT|UPDATE|DELETE/.test(x.sql)),false);
});
