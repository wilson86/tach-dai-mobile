'use strict';
// Security reproduction only: a passing test demonstrates a candidate defect,
// not acceptable session authorization or PostgreSQL qualification.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createReceiptV2AuthBoundary}=require('../team-settlement/candidate/receipt-v2-auth-boundary.cjs');
test('candidate uses time captured before delayed transaction and can invoke callback after expiry',async()=>{
 let now=1793789000000,callbackAt=null;
 const expires=now+500;
 const db={async transaction(work){
  now+=1000; // synthetic queue/acquisition delay; session has now expired.
  return work({async query(sql,args){
   if(sql.includes('FROM kts_auth.sessions'))return {rows:Date.parse(args[1])<expires?
     [{session_handle:'b'.repeat(32),user_id:'synthetic_user',workspace_id:'synthetic_group'}]:[]};
   if(sql.includes('set_config'))return {rows:[{workspace_id:args[0]}]};
   if(sql.includes('FROM kts_team.memberships'))return {rows:[{team_role:'operator'}]};
   throw Error('UNEXPECTED_SYNTHETIC_SQL');
  }});
 }};
 const auth=createReceiptV2AuthBoundary({db,clock:()=>now,enabled:true});
 await auth.authorizeReceiptRead('synthetic_'+ 'x'.repeat(40),()=>{callbackAt=now});
 assert.ok(callbackAt>=expires,'reproduction must reach callback after expiry');
});
