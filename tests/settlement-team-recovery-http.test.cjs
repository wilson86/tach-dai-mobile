'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createAuthHttpServer}=require('../team-settlement/auth-http-contract.cjs');
const {createRecoveryReconciliation}=require('../team-settlement/recovery-reconciliation.cjs');
const {digest}=require('../team-settlement/server-ledger-api.cjs');
const TOKEN='a'.repeat(43);
const actor={server_verified:true,membership_active:true,workspace_id:'group_a',
 user_id:'fake_operator',role:'operator'};
const scope={workspace_id:'group_a',partner_id:'fake_partner_1',
 business_date:'2026-10-15',region:'mn'};
const intent={id:'draft_'+'a'.repeat(32),status:'QUARANTINED',
 original_status:'PENDING',auto_retry:false,base_revision:0,scope,
 payload:{synthetic:true,memo:'SYNTHETIC_PAYLOAD_SHOULD_NEVER_RETURN'}};
function row(){
 const hash=digest({action:'create_draft',scope,expected_revision:0,
  payload:intent.payload});
 return {workspace_id:'group_a',actor_user_id:'fake_operator',
  idempotency_key:intent.id,partner_id:scope.partner_id,
  business_date:scope.business_date,region:scope.region,
  request_sha256:hash,payload_sha256:hash,event_kind:'DRAFT_CREATED',
  event_id:'fake_event_committed',scope_revision:1,feed_seq:'1'};
}
function make({enabled=true,identity=actor,rows=[],inspector=null}={}){
 let verifies=0,reads=0;
 const auth={
  login:async()=>{throw Error('AUTH_LOGIN_DENIED');},
  verifySession:async token=>{
   verifies++;if(token!==TOKEN)throw Error('AUTH_SESSION_INVALID');
   return identity;
  },
  revokeSession:async()=>false,manageMembership:async()=>{},
  setIdentityDisabled:async()=>{}
 };
 const repository={async lookupRecoveryReceipts(who,keys){
  reads++;assert.equal(who.user_id,'fake_operator');
  assert.equal(who.server_verified,true);
  assert.deepEqual(keys,[intent.id]);
  return rows;
 }};
 const service=inspector||createRecoveryReconciliation({
  syntheticOnly:true,auth,repository});
 const server=createAuthHttpServer(auth,{recoveryInspector:service,
  enableSyntheticRecoveryInspectHttp:enabled});
 return {server,get verifies(){return verifies;},get reads(){return reads;}};
}
async function serve(h,action){
 await new Promise(ok=>h.server.listen(0,'127.0.0.1',ok));
 const base='http://127.0.0.1:'+h.server.address().port;
 try{return await action(base);}
 finally{await new Promise(ok=>h.server.close(ok));}
}
async function call(base,input,token=TOKEN){
 const r=await fetch(base+'/v1/recovery/receipts/inspect',{
  method:'POST',headers:{'content-type':'application/json',
   ...(token?{authorization:'Bearer '+token}:{})},
  body:JSON.stringify(input)});
 return {status:r.status,body:await r.json()};
}
const input={explicit_consent:true,quarantined:[intent]};
test('route is default off even with injected recovery inspector; no auth or reads',async()=>{
 const h=make({enabled:false,rows:[row()]});
 await serve(h,async base=>{
  const r=await call(base,input);
  assert.equal(r.status,404);
  assert.deepEqual(r.body,{error:'TEAM_ROUTE_NOT_ENABLED'});
 });
 assert.equal(h.reads,0);assert.equal(h.verifies,0);
 assert.throws(()=>createAuthHttpServer({
  login(){},verifySession(){},revokeSession(){},manageMembership(){},setIdentityDisabled(){}
 },{enableSyntheticRecoveryInspectHttp:true}),/AUTH_HTTP_CONFIG_INVALID/);
});
test('authenticated read-only lookup returns minimal matching classification, no payload/receipt details',async()=>{
 const h=make({rows:[row()]});
 await serve(h,async base=>{
  const result=await call(base,input);
  assert.equal(result.status,200);
  assert.deepEqual(result.body,{
   status:'REVIEW_ONLY',auto_send_enabled:false,all_receipts_verified:true,
   items:[{id:intent.id,classification:'MATCHED_SERVER_RECEIPT',auto_retry:false}]
  });
  const raw=JSON.stringify(result.body);
  for(const secret of ['SYNTHETIC_PAYLOAD_SHOULD_NEVER_RETURN','fake_event_committed',
   'feed_seq','session_token','actor_user_id'])
   assert.equal(raw.includes(secret),false);
 });
 assert.equal(h.reads,1);assert.equal(h.verifies,2);
});
test('missing immutable receipt stays UNVERIFIED with no authorization to resend',async()=>{
 const h=make();
 await serve(h,async base=>{
  const r=await call(base,input);
  assert.equal(r.status,200);
  assert.equal(r.body.all_receipts_verified,false);
  assert.equal(r.body.items[0].classification,'UNVERIFIED_NOT_SAFE_TO_RETRY');
  assert.equal(r.body.items[0].auto_retry,false);
  assert.equal(r.body.auto_send_enabled,false);
 });
 assert.equal(h.reads,1);
});
test('missing bearer, absent consent and forged quarantine rejected before database',async()=>{
 const h=make();
 await serve(h,async base=>{
  assert.equal((await call(base,input,null)).status,401);
  for(const body of [
   {quarantined:[intent]}, {explicit_consent:false,quarantined:[intent]},
   {explicit_consent:true,quarantined:[{...intent,status:'PENDING'}]},
   {explicit_consent:true,quarantined:[{...intent,auto_retry:true}]},
   {...input,send_after_review:true},{explicit_consent:true,quarantined:[]}
  ])assert.equal((await call(base,body)).status,422);
 });
 assert.equal(h.reads,0);assert.equal(h.verifies,0);
});
test('server verified role, membership and workspace fencing remains authoritative',async()=>{
 for(const who of [{...actor,role:'viewer'},{...actor,membership_active:false},
  {...actor,server_verified:false},{...actor,workspace_id:'group_b'}]){
  const h=make({identity:who,rows:[row()]});
  await serve(h,async base=>{
   const r=await call(base,input);
   assert.notEqual(r.status,200);
   assert.equal(r.body.items,undefined);
  });
  assert.equal(h.reads,0);
 }
});
test('injected forged inspector output never becomes a success receipt',async()=>{
 const suspicious=[
  {status:'REVIEW_ONLY',auto_send_enabled:true,
   all_receipts_verified:true,items:[{id:intent.id,
   classification:'MATCHED_SERVER_RECEIPT',auto_retry:false}]},
  {status:'REVIEW_ONLY',auto_send_enabled:false,
   all_receipts_verified:true,items:[{id:'draft_'+'b'.repeat(32),
   classification:'MATCHED_SERVER_RECEIPT',auto_retry:false}]},
  {status:'REVIEW_ONLY',auto_send_enabled:false,
   all_receipts_verified:true,items:[{id:intent.id,
   classification:'UNVERIFIED_NOT_SAFE_TO_RETRY',auto_retry:false}]}
 ];
 for(const reply of suspicious){
  const h=make({inspector:{inspect:async()=>reply}});
  await serve(h,async base=>{
   const r=await call(base,input);
   assert.equal(r.status,503);
   assert.deepEqual(r.body,{error:'TEAM_RECOVERY_RECEIPT_UNVERIFIED'});
  });
 }
});
