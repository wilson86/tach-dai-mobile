'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Sync=require('./fixtures/verified-sync-client.cjs');
const scope={workspace_id:'group_a',partner_id:'fake_partner_1',business_date:'2026-10-14',region:'mn'};
const reviewLockManager={request:async(_key,_opts,callback)=>callback({})};
test('unknown mutation outcome blocks repeated draft and review writes',async()=>{
  let requests=0;
  const saved=new Map();const storage={get:key=>saved.get(key)||null,set:(key,value)=>saved.set(key,value)};
  const client=Sync.createSyncClient({storage,reviewLockManager,fetchImpl:async()=>{
    requests++;
    return {status:503,ok:false,json:async()=>({error:'TEAM_MUTATION_OUTCOME_UNKNOWN',sync_status:'UNKNOWN',resolution:'MANUAL_REVIEW'})};
  }});
  client.setSessionToken('a'.repeat(43),'group_a',{accountId:'fake_operator'});
  const draft=client.queueDraft(scope,{synthetic:true});
  assert.equal((await client.syncDraft(draft.id)).status,'NEEDS_RECONCILIATION');
  assert.equal((await client.syncDraft(draft.id)).status,'NEEDS_RECONCILIATION');
  assert.equal(requests,1);
  assert.equal((await client.reviewScope('submit_review',scope,1)).status,'NEEDS_RECONCILIATION');
  assert.equal((await client.reviewScope('submit_review',scope,1)).status,'NEEDS_RECONCILIATION');
  assert.equal(requests,2);
});

test('unknown draft remains blocked across account-scoped storage reload',async()=>{
  const saved=new Map();let requests=0;
  const storage={get:key=>saved.get(key)||null,set:(key,value)=>saved.set(key,value)};
  const fetchImpl=async()=>{requests++;return {status:503,ok:false,json:async()=>({error:'TEAM_MUTATION_OUTCOME_UNKNOWN'})};};
  const first=Sync.createSyncClient({storage,reviewLockManager,fetchImpl});
  first.setSessionToken('a'.repeat(43),'group_a',{accountId:'fake_operator'});
  const draft=first.queueDraft(scope,{synthetic:true});
  assert.equal((await first.syncDraft(draft.id)).status,'NEEDS_RECONCILIATION');
  const second=Sync.createSyncClient({storage,reviewLockManager,fetchImpl});
  second.setSessionToken('b'.repeat(43),'group_a',{accountId:'fake_operator'});
  const restored=await second.syncDraft(draft.id);
  assert.equal(restored.status,'NEEDS_RECONCILIATION');
  assert.equal(restored.error,'TEAM_MUTATION_OUTCOME_UNKNOWN');
  assert.equal(requests,1);
});

test('unknown review remains blocked with its original marker after client reload',async()=>{
  const saved=new Map(),keys=[];
  const storage={get:key=>saved.get(key)||null,set:(key,value)=>saved.set(key,value)};
  const fetchImpl=async(_url,options)=>{
    keys.push(JSON.parse(options.body).idempotency_key);
    return {status:503,ok:false,json:async()=>({error:'TEAM_MUTATION_OUTCOME_UNKNOWN'})};
  };
  const first=Sync.createSyncClient({storage,reviewLockManager,fetchImpl});
  first.setSessionToken('a'.repeat(43),'group_a',{accountId:'fake_operator'});
  assert.equal((await first.reviewScope('submit_review',scope,1)).status,'NEEDS_RECONCILIATION');
  const second=Sync.createSyncClient({storage,reviewLockManager,fetchImpl});
  second.setSessionToken('b'.repeat(43),'group_a',{accountId:'fake_operator'});
  const blocked=await second.reviewScope('submit_review',scope,1);
  assert.equal(blocked.status,'NEEDS_RECONCILIATION');
  assert.equal(blocked.error,'SYNC_REVIEW_RECONCILIATION_REQUIRED');
  assert.equal(keys.length,1);
});

test('review does not dispatch without account-scoped durable marker storage',async()=>{
  let calls=0;
  const client=Sync.createSyncClient({reviewLockManager,storage:{get:()=>null,set:()=>{throw Error('QUOTA');}},fetchImpl:async()=>{calls++;}});
  client.setSessionToken('a'.repeat(43),'group_a',{accountId:'fake_operator'});
  const result=await client.reviewScope('submit_review',scope,1);
  assert.equal(result.status,'BLOCKED');
  assert.equal(result.error,'SYNC_REVIEW_STORAGE_REQUIRED');
  assert.equal(calls,0);
});

test('review marker is present before dispatch and survives a lost reply',async()=>{
  const saved=new Map();let writes=0;
  const storage={get:key=>saved.get(key)||null,set:(key,value)=>saved.set(key,value)};
  const client=Sync.createSyncClient({storage,reviewLockManager,fetchImpl:async(_url,options)=>{
    writes++;
    const key=JSON.parse(options.body).idempotency_key;
    assert.ok([...saved.values()].some(value=>value.includes(key)));
    throw Error('SYNTHETIC_LOST_REPLY');
  }});
  client.setSessionToken('a'.repeat(43),'group_a',{accountId:'fake_operator'});
  assert.equal((await client.reviewScope('submit_review',scope,1)).status,'NEEDS_RECONCILIATION');
  const reloaded=Sync.createSyncClient({storage,reviewLockManager,fetchImpl:async()=>{writes++;}});
  reloaded.setSessionToken('b'.repeat(43),'group_a',{accountId:'fake_operator'});
  assert.equal((await reloaded.reviewScope('submit_review',scope,1)).error,'SYNC_REVIEW_RECONCILIATION_REQUIRED');
  assert.equal(writes,1);
});

test('two clients sharing a modeled lock cannot create competing review markers',async()=>{
  const saved=new Map(),held=new Set();let writes=0;
  const storage={get:key=>saved.get(key)||null,set:(key,value)=>saved.set(key,value)};
  const locks={async request(key,options,callback){
    assert.deepEqual(options,{mode:'exclusive',ifAvailable:true});
    if(held.has(key))return callback(null);
    held.add(key);try{return await callback({});}finally{held.delete(key);}
  }};
  const options={storage,reviewLockManager:locks,fetchImpl:async()=>{writes++;return {status:503,ok:false,json:async()=>({error:'TEAM_MUTATION_OUTCOME_UNKNOWN'})};}};
  const first=Sync.createSyncClient(options),second=Sync.createSyncClient(options);
  first.setSessionToken('a'.repeat(43),'group_a',{accountId:'fake_operator'});
  second.setSessionToken('b'.repeat(43),'group_a',{accountId:'fake_operator'});
  const results=await Promise.all([first.reviewScope('submit_review',scope,1),second.reviewScope('submit_review',scope,1)]);
  assert.equal(writes,1);
  assert.ok(results.every(row=>['BLOCKED','NEEDS_RECONCILIATION'].includes(row.status)));
});

test('review fails closed when an origin lock is unavailable',async()=>{
  let writes=0;const saved=new Map();
  const storage={get:key=>saved.get(key)||null,set:(key,value)=>saved.set(key,value)};
  const client=Sync.createSyncClient({storage,reviewLockManager:{},fetchImpl:async()=>{writes++;}});
  client.setSessionToken('a'.repeat(43),'group_a',{accountId:'fake_operator'});
  assert.equal((await client.reviewScope('submit_review',scope,1)).error,'SYNC_REVIEW_STORAGE_REQUIRED');
  assert.equal(writes,0);
});

test('pre-dispatch marker blocks draft replay after post-response storage failure',async()=>{
  const saved=new Map();let failWrites=false,posts=0;
  const storage={get:key=>saved.get(key)||null,set:(key,value)=>{if(failWrites)throw Error('QUOTA');saved.set(key,value);}};
  const fetchImpl=async()=>{posts++;failWrites=true;return {status:503,ok:false,json:async()=>({error:'TEAM_MUTATION_OUTCOME_UNKNOWN'})};};
  const first=Sync.createSyncClient({storage,fetchImpl});
  first.setSessionToken('a'.repeat(43),'group_a',{accountId:'fake_operator'});
  const draft=first.queueDraft(scope,{synthetic:true});
  assert.equal((await first.syncDraft(draft.id)).status,'NEEDS_RECONCILIATION');
  failWrites=false;
  const second=Sync.createSyncClient({storage,fetchImpl});
  second.setSessionToken('b'.repeat(43),'group_a',{accountId:'fake_operator'});
  assert.equal(second.snapshot().drafts[0].status,'NEEDS_RECONCILIATION');
  assert.equal((await second.syncDraft(draft.id)).error,'TEAM_MUTATION_OUTCOME_UNKNOWN');
  assert.equal(posts,1);
});

test('unattempted v2 draft cannot auto-send after reload without atomic marker proof',async()=>{
  const saved=new Map();let posts=0;
  const storage={get:key=>saved.get(key)||null,set:(key,value)=>saved.set(key,value),keys:()=>[...saved.keys()]};
  const fetchImpl=async()=>{posts++;throw Error('UNEXPECTED_REQUEST');};
  const first=Sync.createSyncClient({storage,fetchImpl});
  first.setSessionToken('a'.repeat(43),'group_a',{accountId:'fake_operator'});
  const draft=first.queueDraft(scope,{synthetic:true});
  const reloaded=Sync.createSyncClient({storage,fetchImpl});
  reloaded.setSessionToken('b'.repeat(43),'group_a',{accountId:'fake_operator'});
  assert.equal(reloaded.snapshot().drafts.find(row=>row.id===draft.id).status,'NEEDS_RECONCILIATION');
  assert.equal(posts,0);
});

test('draft dispatch fails closed if storage falsely acknowledges marker write',async()=>{
  let posts=0;
  const storage={get:()=>null,set:()=>{}};
  const client=Sync.createSyncClient({storage,fetchImpl:async()=>{posts++;}});
  client.setSessionToken('a'.repeat(43),'group_a',{accountId:'fake_operator'});
  const draft=client.queueDraft(scope,{synthetic:true});
  assert.equal((await client.syncDraft(draft.id)).error,'SYNC_LOCAL_PERSISTENCE_REQUIRED');
  assert.equal(posts,0);
});
