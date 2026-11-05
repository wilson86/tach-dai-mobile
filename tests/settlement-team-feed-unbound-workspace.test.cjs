'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createSyncClient}=require('../app/settlement-team-sync-client.js');
test('change feed cannot be fetched or marked synced without a bound workspace',async()=>{
 let calls=0;
 const client=createSyncClient({fetchImpl:async()=>{calls++;return {ok:true,status:200,
  json:async()=>({sync_status:'SYNCED',items:[{event_id:'fake_event_1',workspace_id:'other',feed_seq:1}],next_cursor:'opaque'})};}});
 client.setSessionToken('a'.repeat(43));
 const result=await client.pullChanges();
 assert.deepEqual(result,{status:'BLOCKED',error:'AUTH_SESSION_REQUIRED',items:[]});
 assert.equal(calls,0);assert.equal(client.snapshot().cursor,null);
});
test('bound workspace still accepts a matching contiguous synthetic feed',async()=>{
 let calls=0;
 const client=createSyncClient({fetchImpl:async()=>{calls++;return {ok:true,status:200,
  json:async()=>({sync_status:'SYNCED',items:[{event_id:'fake_event_1',workspace_id:'group_a',feed_seq:1}],next_cursor:'opaque'})};}});
 client.setSessionToken('a'.repeat(43),'group_a',{accountId:'user_a'});
 const result=await client.pullChanges();
 assert.equal(result.status,'SYNCED');assert.equal(calls,1);assert.equal(client.snapshot().cursor,'opaque');
});
