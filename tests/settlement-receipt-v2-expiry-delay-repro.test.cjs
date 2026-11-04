'use strict';
// Synthetic regression only; not real PostgreSQL or production qualification.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createReceiptV2AuthBoundary}=require('../team-settlement/candidate/receipt-v2-auth-boundary.cjs');
test('candidate rechecks DB time after delayed transaction and denies expired session',async()=>{
 let now=1793789000000,callbackAt=null;
 const expires=now+500;
 const db={async transaction(work){
  now+=1000; // synthetic queue/acquisition delay; session has now expired.
  return work({async query(sql,args){
   if(sql.includes('FROM kts_auth.sessions'))return {rows:(sql.includes('clock_timestamp()')?now:Date.parse(args[1]))<expires?
     [{session_handle:'b'.repeat(32),user_id:'synthetic_user',workspace_id:'synthetic_group'}]:[]};
   if(sql.includes('set_config'))return {rows:[{workspace_id:args[0]}]};
   if(sql.includes('FROM kts_team.memberships'))return {rows:[{team_role:'operator'}]};
   throw Error('UNEXPECTED_SYNTHETIC_SQL');
  }});
 }};
 const auth=createReceiptV2AuthBoundary({db,clock:()=>now,enabled:true});
 await assert.rejects(auth.authorizeReceiptRead('synthetic_'+ 'x'.repeat(40),()=>{callbackAt=now}),/TEAM_RECEIPT_V2_AUTH_DENIED/);
 assert.equal(callbackAt,null);
});
test('synthetic callback may finish after session expiry; downstream verifier remains required',async()=>{
 let now=1793789000000;
 const expires=now+500;
 const session={session_handle:'b'.repeat(32),user_id:'synthetic_user',workspace_id:'synthetic_group'};
 const db={async transaction(work){return work({async query(sql,args){
  if(sql.includes('FROM kts_auth.sessions'))return {rows:(sql.includes('clock_timestamp()')?now:Date.parse(args[1]))<expires?[session]:[]};
  if(sql.includes('set_config'))return {rows:[{workspace_id:args[0]}]};
  if(sql.includes('FROM kts_team.memberships'))return {rows:[{team_role:'operator'}]};
  throw Error('UNEXPECTED_SYNTHETIC_SQL');
 }});}};
 const auth=createReceiptV2AuthBoundary({db,clock:()=>now,enabled:true});
 const result=await auth.authorizeReceiptRead('synthetic_'+ 'x'.repeat(40),async()=>{
  now+=1000;return 'synthetic_callback_complete';
 });
 assert.equal(result,'synthetic_callback_complete');
 assert.ok(now>=expires,'this reproduces expiry after the last Auth recheck');
});
