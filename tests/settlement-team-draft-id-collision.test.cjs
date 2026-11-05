'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createSyncClient}=require('../app/settlement-team-sync-client.js');
test('duplicate generated draft identity cannot replace an unsent intent',()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'crypto');
 Object.defineProperty(globalThis,'crypto',{configurable:true,value:{randomUUID:()=> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}});
 try{
  const data=new Map(),storage={get:k=>data.get(k)??null,set:(k,v)=>data.set(k,v),keys:()=>[...data.keys()]};
  const c=createSyncClient({storage,fetchImpl:async()=>{throw Error('NO_NETWORK')}});
  const other=createSyncClient({storage,fetchImpl:async()=>{throw Error('NO_NETWORK')}});
  c.setSessionToken('a'.repeat(43),'group_a',{accountId:'user_a'});
  other.setSessionToken('b'.repeat(43),'group_a',{accountId:'user_a'});
  const scope={workspace_id:'group_a',partner_id:'fake_partner_1',business_date:'2026-11-05',region:'mn'};
  const first=c.queueDraft(scope,{synthetic:true,memo:'original'});
  assert.throws(()=>c.queueDraft(scope,{synthetic:true,memo:'replacement'}),/SYNC_DRAFT_ID_COLLISION/);
  assert.equal(c.snapshot().drafts.length,1);
  assert.equal(c.snapshot().drafts[0].id,first.id);
  assert.equal(c.snapshot().drafts[0].payload.memo,'original');
  assert.equal(c.snapshot().draft_persistence,'LOCAL_STORAGE');
  assert.throws(()=>other.queueDraft(scope,{synthetic:true,memo:'other tab'}),/SYNC_DRAFT_ID_COLLISION/);
  assert.equal(other.snapshot().drafts.length,0);
  const markerKey='kts-team-draft-intent-v2:'+encodeURIComponent(JSON.stringify(['user_a','group_a',first.id]))+':dispatched';
  const isolatedData=new Map([[markerKey,'synthetic marker']]);
  const isolated={get:k=>isolatedData.get(k)??null,set:(k,v)=>isolatedData.set(k,v),keys:()=>[...isolatedData.keys()]};
  const markerOnly=createSyncClient({storage:isolated,fetchImpl:async()=>{throw Error('NO_NETWORK')}});
  markerOnly.setSessionToken('c'.repeat(43),'group_a',{accountId:'user_a'});
  assert.throws(()=>markerOnly.queueDraft(scope,{synthetic:true}),/SYNC_DRAFT_ID_COLLISION/);
  assert.equal(markerOnly.snapshot().drafts.length,0);
 }finally{if(original)Object.defineProperty(globalThis,'crypto',original);else delete globalThis.crypto;}
});
