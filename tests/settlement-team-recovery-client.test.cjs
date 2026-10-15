'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Sync=require('../app/settlement-team-sync-client.js');
const token='a'.repeat(43);
const x={id:'draft_'+'a'.repeat(32),status:'QUARANTINED',auto_retry:false,
 original_status:'PENDING',base_revision:0,
 scope:{workspace_id:'group_a',partner_id:'fake_partner_1',
  business_date:'2026-10-15',region:'mn'},
 payload:{synthetic:true,note:'fake-only original intent'}};
function make(server){
 const calls=[];
 const client=Sync.createSyncClient({fetchImpl:async(url,options)=>{
  calls.push({url,options});
  const result=await server(url,options);
  // "REVIEW_ONLY" is a business status, NOT an HTTP status code.
  const httpStatus=Number.isInteger(result.status)?result.status:200;
  return {status:httpStatus,ok:httpStatus===200,
   async json(){return result.body||result;}};
 }});
 client.setSessionToken(token,'group_a');
 return {client,calls};
}
function reply(classification='MATCHED_SERVER_RECEIPT'){
 return {status:'REVIEW_ONLY',all_receipts_verified:
  classification==='MATCHED_SERVER_RECEIPT',auto_send_enabled:false,
  items:[{id:x.id,classification,auto_retry:false}]};
}
test('explicit consent+synthetic flag precede all HTTP and never import/send',async()=>{
 const h=make(async()=>reply());
 await assert.rejects(h.client.inspectRecoveryReceipts([x]),
  /TEAM_RECOVERY_INSPECT_DISABLED/);
 await assert.rejects(h.client.inspectRecoveryReceipts([x],
  {syntheticOnly:true}),/TEAM_RECOVERY_INSPECT_DISABLED/);
 assert.deepEqual(h.calls,[]);
 assert.deepEqual(h.client.snapshot().drafts,[]);
});
test('only explicit read-only receipt request uses existing bearer; minimal status returns',async()=>{
 const h=make(async()=>reply());
 const result=await h.client.inspectRecoveryReceipts([x],
  {syntheticOnly:true,explicitConsent:true});
 assert.deepEqual(result,{status:'REVIEW_ONLY',
  all_receipts_verified:true,auto_send_enabled:false,
  items:[{id:x.id,classification:'MATCHED_SERVER_RECEIPT',auto_retry:false}]});
 assert.equal(h.calls.length,1);
 assert.equal(h.calls[0].url,'/v1/recovery/receipts/inspect');
 assert.equal(h.calls[0].options.method,'POST');
 assert.equal(h.calls[0].options.headers.authorization,'Bearer '+token);
 const request=JSON.parse(h.calls[0].options.body);
 assert.equal(request.explicit_consent,true);
 assert.equal(request.quarantined[0].id,x.id);
 assert.equal(h.client.snapshot().drafts.length,0);
 assert.equal(Object.hasOwn(h.client.snapshot(),'session_token'),false);
});
test('unknown receipt cannot set auto-send or add a new pending request',async()=>{
 const h=make(async()=>reply('UNVERIFIED_NOT_SAFE_TO_RETRY'));
 const r=await h.client.inspectRecoveryReceipts([x],
  {syntheticOnly:true,explicitConsent:true});
 assert.equal(r.all_receipts_verified,false);
 assert.equal(r.items[0].auto_retry,false);
 assert.equal(h.client.snapshot().drafts.length,0);
});
test('invalid original scope, ID, original status and duplicated IDs rejected before HTTP',async()=>{
 const h=make(async()=>reply());
 for(const items of [[],[x,x],[{...x,status:'PENDING'}],
  [{...x,auto_retry:true}],
  [{...x,scope:{...x.scope,workspace_id:'group_b'}}],
  [{...x,scope:{...x.scope,partner_id:'real_customer'}}],
  [{...x,payload:{synthetic:false}}],
  [{...x,id:'fake_invalid'}]]){
  await assert.rejects(h.client.inspectRecoveryReceipts(items,
   {syntheticOnly:true,explicitConsent:true}),
   /TEAM_RECOVERY_QUARANTINE_REQUIRED/);
 }
 assert.equal(h.calls.length,0);
});
test('tampered server result never becomes verified receipt',async()=>{
 for(const invalid of [
  {...reply(),auto_send_enabled:true},
  {...reply(),items:[{...reply().items[0],id:'draft_'+'b'.repeat(32)}]},
  {...reply(),all_receipts_verified:false},
  {...reply(),items:[{...reply().items[0],auto_retry:true}]},
  {...reply(),status:'SYNCED'}
 ]){
  const h=make(async()=>invalid);
  await assert.rejects(h.client.inspectRecoveryReceipts([x],
   {syntheticOnly:true,explicitConsent:true}),
   /TEAM_RECOVERY_RECEIPT_UNVERIFIED/);
  assert.deepEqual(h.client.snapshot().drafts,[]);
 }
});
test('authenticated identity switch during request quarantines stale response',async()=>{
 let resume;
 const gate=new Promise(ok=>{resume=ok});
 const h=make(async()=>{await gate;return reply()});
 const work=h.client.inspectRecoveryReceipts([x],
  {syntheticOnly:true,explicitConsent:true});
 h.client.clearSession({discardPending:true});
 resume();
 await assert.rejects(work,/SYNC_SESSION_CHANGED/);
});
test('failure or missing endpoint never grants a receipt or automatic resend',async()=>{
 for(const server of [async()=>({status:404,body:{error:'TEAM_ROUTE_NOT_ENABLED'}}),
  async()=>{throw Error('NETWORK_UNAVAILABLE')} ]){
  const h=make(server);
  await assert.rejects(h.client.inspectRecoveryReceipts([x],
   {syntheticOnly:true,explicitConsent:true}),
   /TEAM_RECOVERY_RECEIPT_UNVERIFIED/);
  assert.deepEqual(h.client.snapshot().drafts,[]);
 }
});
