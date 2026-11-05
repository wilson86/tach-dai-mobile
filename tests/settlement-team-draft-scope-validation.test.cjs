'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Sync=require('../app/settlement-team-sync-client.js');
function storage(){const data=new Map();return {data,get:k=>data.get(k)??null,set:(k,v)=>data.set(k,v),remove:k=>data.delete(k),keys:()=>[...data.keys()]};}
test('invalid draft scope is rejected before durable queue; valid draft survives reload',()=>{
 const store=storage(),opts={storage:store,fetchImpl:async()=>{throw Error('NO_NETWORK');}};
 const client=Sync.createSyncClient(opts);
 client.setSessionToken('a'.repeat(43),'group_a',{accountId:'user_a'});
 const scope={workspace_id:'group_a',partner_id:'partner_a',business_date:'2026-11-05',region:'mn'};
 for(const bad of [{...scope,partner_id:''},{...scope,partner_id:'bad space'},
  {...scope,partner_id:123},{...scope,region:'unknown'}]){
  assert.throws(()=>client.queueDraft(bad,{synthetic:true}),/SYNC_SCOPE_INVALID/);
  assert.equal(client.snapshot().drafts.length,0);assert.equal(store.data.size,0);
 }
 const draft=client.queueDraft(scope,{synthetic:true});
 assert.equal(client.snapshot().draft_persistence,'LOCAL_STORAGE');
 const reload=Sync.createSyncClient(opts);
 reload.setSessionToken('b'.repeat(43),'group_a',{accountId:'user_a'});
 assert.equal(reload.snapshot().draft_persistence,'LOCAL_STORAGE');
 assert.equal(reload.snapshot().drafts[0].id,draft.id);
 assert.equal(reload.snapshot().drafts[0].status,'NEEDS_RECONCILIATION');
});
