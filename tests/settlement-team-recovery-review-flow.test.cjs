'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
const {createSyntheticRecoveryVault}=require('../team-settlement/recovery-vault.cjs');
const {createRecoveryReconciliation}=require('../team-settlement/recovery-reconciliation.cjs');
const {createSyntheticRecoveryReviewFlow}=require('../team-settlement/recovery-review-flow.cjs');
const {digest}=require('../team-settlement/server-ledger-api.cjs');
const token='a'.repeat(43),secret='independent-synthetic-recovery-passphrase';
const actor={server_verified:true,membership_active:true,user_id:'fake_op',
  workspace_id:'group_a',role:'operator'};
const draft=(id='a'.repeat(32))=>({id:'draft_'+id,status:'PENDING',
 scope:{workspace_id:'group_a',partner_id:'fake_partner_1',
 business_date:'2026-10-15',region:'mn'},base_revision:0,
 payload:{synthetic:true,note:'sensitive-fake-description'}});
function setup({rows=[],identity=()=>actor}={}){
 const data=new Map(),calls=[];
 const storage={async read(k){calls.push('READ');return data.get(k)??null;},
   async writeIfAbsent(k,v){calls.push('WRITE');if(data.has(k))return false;
     data.set(k,v);return true;}};
 const auth={async verifySession(t){calls.push('AUTH');assert.equal(t,token);
   return identity();}};
 const vault=createSyntheticRecoveryVault({auth,store:storage,cryptoProvider:webcrypto,
   syntheticOnly:true});
 const repository={async lookupRecoveryReceipts(trusted,ids){
   calls.push('RECEIPTS');assert.equal(trusted.server_verified,true);
   assert.equal(trusted.workspace_id,'group_a');
   return typeof rows==='function'?rows(ids):rows;
 }};
 const reconciliation=createRecoveryReconciliation({auth,repository,syntheticOnly:true});
 const flow=createSyntheticRecoveryReviewFlow({vault,reconciliation,syntheticOnly:true});
 return {vault,flow,storage,data,calls};
}
function originalReceipt(item){
 const request_sha256=digest({action:'create_draft',scope:item.scope,
   expected_revision:item.base_revision,payload:item.payload});
 return {workspace_id:'group_a',idempotency_key:item.id,
  request_sha256,payload_sha256:request_sha256,
  event_id:'fake_saved_event',actor_user_id:'fake_op',
  partner_id:item.scope.partner_id,business_date:item.scope.business_date,
  region:item.scope.region,scope_revision:1,feed_seq:'1',
  event_kind:'DRAFT_CREATED'};
}
test('complete synthetic encrypted backup -> reauthenticated quarantine -> known receipt review',async()=>{
 const item=draft(),x=setup({rows:[originalReceipt(item)]});
 await x.vault.save({sessionToken:token,passphrase:secret,drafts:[item],
   explicitConsent:true});
 const r=await x.flow.review({sessionToken:token,passphrase:secret,
   explicitConsent:true});
 assert.equal(r.status,'REVIEW_ONLY');
 assert.equal(r.durability,'UNVERIFIED');
 assert.equal(r.all_receipts_verified,true);
 assert.equal(r.auto_send_enabled,false);
 assert.equal(r.needs_human_resolution,true);
 assert.deepEqual(r.items,[{id:item.id,classification:'MATCHED_SERVER_RECEIPT',
   auto_retry:false}]);
 assert.equal(JSON.stringify(r).includes('sensitive-fake-description'),false);
 assert.equal(x.calls.filter(q=>q==='RECEIPTS').length,1);
 assert.equal(x.calls.filter(q=>q==='WRITE').length,1);
});
test('missing server receipt remains UNKNOWN and forbidden to automatically resend',async()=>{
 const item=draft(),x=setup();
 await x.vault.save({sessionToken:token,passphrase:secret,drafts:[item],
   explicitConsent:true});
 const r=await x.flow.review({sessionToken:token,passphrase:secret,
   explicitConsent:true});
 assert.equal(r.all_receipts_verified,false);
 assert.equal(r.items[0].classification,'UNVERIFIED_NOT_SAFE_TO_RETRY');
 assert.equal(r.items[0].auto_retry,false);
 assert.equal(r.auto_send_enabled,false);
});
test('manual consent and a server-verified backup are mandatory before any lookup',async()=>{
 const x=setup();
 await assert.rejects(x.flow.review({sessionToken:token,passphrase:secret}),
   /TEAM_RECOVERY_FLOW_EXPLICIT_CONSENT_REQUIRED/);
 assert.deepEqual(x.calls,[]);
 const r=await x.flow.review({sessionToken:token,passphrase:secret,
   explicitConsent:true});
 assert.equal(r.status,'NO_ENCRYPTED_BACKUP');
 assert.equal(r.auto_send_enabled,false);
 assert.equal(x.calls.includes('RECEIPTS'),false);
 assert.throws(()=>createSyntheticRecoveryReviewFlow({vault:x.vault,
   reconciliation:{inspect(){} }}),/TEAM_RECOVERY_FLOW_DISABLED/);
});
test('identity changed between vault and independent receipt verification fails closed',async()=>{
 const item=draft();let verifies=0;
 const x=setup({rows:[originalReceipt(item)],identity:()=>{
   // save now verifies 3 times (including post-write read-back), then
   // vault.inspect verifies twice; flip only at independent SQL re-auth.
   verifies++;return verifies>5?{...actor,user_id:'fake_intruder'}:actor;
 }});
 await x.vault.save({sessionToken:token,passphrase:secret,drafts:[item],
   explicitConsent:true}); // 3 identity checks (including post-write)
 await assert.rejects(x.flow.review({sessionToken:token,
   passphrase:secret,explicitConsent:true}),/TEAM_RECOVERY_FLOW_IDENTITY_MISMATCH|TEAM_RECOVERY_RECEIPT_MISMATCH/);
 assert.equal(x.calls.includes('RECEIPTS'),true);
});
test('injected forged success/duplicate/mismatched receipt reports are refused',async()=>{
 const id=draft().id,restored={status:'QUARANTINED',durability:'UNVERIFIED',
  authenticated_user_id:'fake_op',workspace_id:'group_a',auto_send_enabled:false,
  needs_server_reauthentication:true,requires_server_receipt_review:true,
  items:[{id,status:'QUARANTINED',auto_retry:false}]};
 for(const report of [
   {status:'REVIEW_ONLY',authenticated_user_id:'other',workspace_id:'group_a',
    auto_send_enabled:false,all_receipts_verified:true,
    items:[{id,classification:'MATCHED_SERVER_RECEIPT',event_id:'saved',
     feed_seq:'1',server_revision:'1',auto_retry:false}]},
   {status:'REVIEW_ONLY',authenticated_user_id:'fake_op',workspace_id:'group_a',
    auto_send_enabled:false,all_receipts_verified:true,
    items:[{id,classification:'UNVERIFIED_NOT_SAFE_TO_RETRY',auto_retry:false}]},
   {status:'REVIEW_ONLY',authenticated_user_id:'fake_op',workspace_id:'group_a',
    auto_send_enabled:false,all_receipts_verified:true,
    items:[{id:'draft_'+'b'.repeat(32),classification:'MATCHED_SERVER_RECEIPT',
      event_id:'saved',feed_seq:'1',server_revision:'1',auto_retry:false}]},
   {status:'REVIEW_ONLY',authenticated_user_id:'fake_op',workspace_id:'group_a',
    auto_send_enabled:true,all_receipts_verified:true,
    items:[{id,classification:'MATCHED_SERVER_RECEIPT',event_id:'saved',
      feed_seq:'1',server_revision:'1',auto_retry:false}]}
 ]){
   const f=createSyntheticRecoveryReviewFlow({syntheticOnly:true,
     vault:{async inspect(){return restored;}},
     reconciliation:{async inspect(){return report;}}});
   await assert.rejects(f.review({explicitConsent:true}),
     /TEAM_RECOVERY_FLOW_IDENTITY_MISMATCH|TEAM_RECOVERY_FLOW_RECEIPT_UNVERIFIED/);
 }
});
test('review orchestrator remains unwired from active team PWA and HTTP routes',()=>{
 const root=path.join(__dirname,'..');
 for(const p of ['app/settlement-team-pilot.html','app/settlement-team-pilot-ui.js',
  'app/settlement-team-sync-client.js','team-settlement/auth-http-contract.cjs']){
   assert.doesNotMatch(fs.readFileSync(path.join(root,p),'utf8'),
     /recovery-review-flow|createSyntheticRecoveryReviewFlow/,p);
 }
});

test('duplicate restored original id never reaches independent SQL receipt reviewer',async()=>{
 const id=draft().id;
 let lookups=0;
 const r={status:'QUARANTINED',durability:'UNVERIFIED',
  authenticated_user_id:'fake_op',workspace_id:'group_a',
  auto_send_enabled:false,requires_server_receipt_review:true,
  needs_server_reauthentication:true,
  items:[{id,status:'QUARANTINED',auto_retry:false},
         {id,status:'QUARANTINED',auto_retry:false}]};
 const flow=createSyntheticRecoveryReviewFlow({syntheticOnly:true,
  vault:{async inspect(){return r;}},
  reconciliation:{async inspect(){lookups++;throw Error('NEVER_LOOKUP');}}});
 await assert.rejects(flow.review({explicitConsent:true}),
   /TEAM_RECOVERY_FLOW_DUPLICATE_INTENT/);
 assert.equal(lookups,0);
});

test('positive-sounding injected receipt with invalid event, feed or revision is not accepted',async()=>{
 const id=draft().id;
 const restored={status:'QUARANTINED',durability:'UNVERIFIED',
  authenticated_user_id:'fake_op',workspace_id:'group_a',
  auto_send_enabled:false,needs_server_reauthentication:true,
  requires_server_receipt_review:true,
  items:[{id,status:'QUARANTINED',auto_retry:false}]};
 const verified={id,classification:'MATCHED_SERVER_RECEIPT',auto_retry:false,
  event_id:'fake_event_1',feed_seq:'1',server_revision:'1'};
 for(const item of [
  {...verified,event_id:'bad whitespace'},
  {...verified,feed_seq:'0'},
  {...verified,feed_seq:'01'},
  {...verified,feed_seq:'9223372036854775808'},
  {...verified,feed_seq:1},
  {...verified,server_revision:'0'},
  {...verified,server_revision:'01'},
  {...verified,server_revision:'9223372036854775808'},
  {...verified,server_revision:1}
 ]){
  const flow=createSyntheticRecoveryReviewFlow({syntheticOnly:true,
   vault:{async inspect(){return restored;}},
   reconciliation:{async inspect(){return {
    status:'REVIEW_ONLY',authenticated_user_id:'fake_op',workspace_id:'group_a',
    auto_send_enabled:false,all_receipts_verified:true,items:[item]
   };}}});
  await assert.rejects(flow.review({explicitConsent:true}),
   /TEAM_RECOVERY_FLOW_RECEIPT_UNVERIFIED/);
 }
});

test('missing receipt cannot smuggle an event id or revision into UNKNOWN classification',async()=>{
 const id=draft().id;
 const restored={status:'QUARANTINED',durability:'UNVERIFIED',
  authenticated_user_id:'fake_op',workspace_id:'group_a',
  auto_send_enabled:false,needs_server_reauthentication:true,
  requires_server_receipt_review:true,items:[{id,status:'QUARANTINED',auto_retry:false}]};
 const bad={id,classification:'UNVERIFIED_NOT_SAFE_TO_RETRY',
   event_id:'fake_looks_committed',auto_retry:false};
 const flow=createSyntheticRecoveryReviewFlow({syntheticOnly:true,
  vault:{async inspect(){return restored;}},
  reconciliation:{async inspect(){return {
   status:'REVIEW_ONLY',authenticated_user_id:'fake_op',workspace_id:'group_a',
   auto_send_enabled:false,all_receipts_verified:false,items:[bad]
  };}}});
 await assert.rejects(flow.review({explicitConsent:true}),
   /TEAM_RECOVERY_FLOW_RECEIPT_UNVERIFIED/);
});
