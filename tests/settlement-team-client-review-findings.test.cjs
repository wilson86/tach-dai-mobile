'use strict';
// Actual client entrypoints; disposable storage, lock and HTTP dependencies.
// No PostgreSQL, live browser, Android, listener or credential fixture.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Sync=require('../app/settlement-team-sync-client.js');
const scope={workspace_id:'group_a',partner_id:'fake_partner',business_date:'2026-11-03',region:'mn'};
const actor={user_id:'fake_operator',workspace_id:'group_a',role:'operator',server_verified:true,membership_active:true};
const token='a'.repeat(43);
const response=(status,body)=>({status,ok:status>=200&&status<300,json:async()=>body});
function storage(){
  const data=new Map();
  return {data,get:key=>data.get(key)??null,set:(key,value)=>data.set(key,value),keys:()=>[...data.keys()]};
}
function locks(){
  const held=new Set();
  return {async request(key,opts,work){
    assert.deepEqual(opts,{mode:'exclusive',ifAvailable:true});
    if(held.has(key))return work(null);
    held.add(key);try{return await work({name:key});}finally{held.delete(key);}
  },held};
}
function receipt(review=false){return {sync_status:'SYNCED',scope_key:'group_a:fake_partner:2026-11-03:mn',
  event_id:'fake_event',replayed:false,new_revision:review?2:1,feed_seq:1,...(review?{review_state:'PENDING_REVIEW'}:{})};}
function fixture(options={}){
  const saved=options.storage||storage(),manager=options.locks||locks(),calls=[];
  const f=async(url,request={})=>{
    calls.push({url,method:request.method,body:request.body});
    if(url==='/v1/session')return response(200,options.actor||actor);
    if(url==='/v1/changes?limit=100')return response(200,{sync_status:'SYNCED',items:[],next_cursor:null});
    if(url==='/v1/logout')return response(204,{});
    if(options.write)return options.write(url,request);
    return response(200,receipt(url.includes('/review')));
  };
  const client=Sync.createSyncClient({storage:saved,reviewLockManager:manager,fetchImpl:f,
    mutationTimeoutMs:options.timeout||1000});
  client.setSessionToken(token,'group_a',{accountId:options.owner===undefined?'fake_operator':options.owner});
  return {client,saved,manager,calls,posts:()=>calls.filter(c=>c.method==='POST')};
}
for(const failure of ['5xx','lost_ack','timeout','bad_receipt','body_timeout'])for(const review of [false,true]){
  test(`${review?'review':'draft'} ${failure} is reconciliation-only, including reload and reconnect`,async()=>{
    const saved=storage(),manager=locks();
    const write=async()=>{
      if(failure==='5xx')return response(503,{error:'TEAM_BACKEND_UNAVAILABLE'});
      if(failure==='lost_ack')throw Error('SYNTHETIC_CONNECTION_LOSS');
      if(failure==='timeout')return new Promise(()=>{});
      if(failure==='body_timeout')return {status:200,ok:true,json:()=>new Promise(()=>{})};
      return response(200,{...receipt(review),event_id:''});
    };
    const f=fixture({storage:saved,locks:manager,write,timeout:10});
    const item=review?null:f.client.queueDraft(scope,{synthetic:true});
    const invoke=()=>review?f.client.reviewScope('submit_review',scope,1):f.client.syncDraft(item.id);
    const first=await invoke();assert.equal(first.status,'NEEDS_RECONCILIATION');
    const key=JSON.parse(f.posts()[0].body).idempotency_key;
    assert.equal(review?first.idempotency_key:first.id,key);
    assert.equal((await invoke()).status,'NEEDS_RECONCILIATION');
    await f.client.reconnect();assert.equal(f.posts().length,1);
    const reload=fixture({storage:saved,locks:manager,write});
    const next=review?await reload.client.reviewScope('submit_review',scope,1):await reload.client.syncDraft(item.id);
    assert.equal(next.status,'NEEDS_RECONCILIATION');
    assert.equal(review?next.idempotency_key:next.id,key);
    await reload.client.reconnect();assert.equal(reload.posts().length,0);
    assert.equal(manager.held.size,0);
    assert.ok([...saved.data.values()].some(v=>v.includes(key)));
  });
}
test('verified receipt permits SYNCED once; re-click and stale tab cannot write again',async()=>{
  const f=fixture(),d=f.client.queueDraft(scope,{synthetic:true});
  const stale=fixture({storage:f.saved,locks:f.manager});
  assert.equal((await f.client.syncDraft(d.id)).status,'SYNCED');
  assert.equal((await f.client.syncDraft(d.id)).status,'SYNCED');assert.equal(f.posts().length,1);
  assert.equal((await stale.client.syncDraft(d.id)).status,'NEEDS_RECONCILIATION');assert.equal(stale.posts().length,0);
});
test('same-account tabs append independent records without erasing each other',async()=>{
  const saved=storage(),manager=locks(),a=fixture({storage:saved,locks:manager}),b=fixture({storage:saved,locks:manager});
  const one=a.client.queueDraft(scope,{synthetic:'one'}),two=b.client.queueDraft(scope,{synthetic:'two'});
  const originalB=[...saved.data].find(([k])=>k.includes(two.id));assert.ok(originalB);
  await a.client.syncDraft(one.id);
  assert.equal(saved.data.get(originalB[0]),originalB[1]);
  a.client.clearSession({discardPending:true});assert.equal(saved.data.get(originalB[0]),originalB[1]);
  const reload=fixture({storage:saved,locks:manager});
  assert.deepEqual(new Set(reload.client.snapshot().drafts.map(d=>d.id)),new Set([one.id,two.id]));
  assert.equal(reload.client.snapshot().drafts.find(d=>d.id===two.id).status,'NEEDS_RECONCILIATION');
  assert.equal(reload.client.snapshot().drafts.find(d=>d.id===one.id).status,'NEEDS_RECONCILIATION');
});
test('concurrent tabs dispatch the same immutable intent at most once',async()=>{
  const saved=storage(),manager=locks();let finish;
  const a=fixture({storage:saved,locks:manager,write:()=>new Promise(resolve=>{finish=resolve;})});
  const d=a.client.queueDraft(scope,{synthetic:true});const b=fixture({storage:saved,locks:manager});
  const inflight=a.client.syncDraft(d.id);
  while(!finish)await new Promise(resolve=>setImmediate(resolve));
  const competing=await b.client.syncDraft(d.id);assert.equal(competing.status,'NEEDS_RECONCILIATION');
  finish(response(200,receipt()));assert.equal((await inflight).status,'SYNCED');
  assert.equal(a.posts().length+b.posts().length,1);assert.equal(manager.held.size,0);
});
test('legacy pending array is read-only and survives v2 writes by another tab',async()=>{
  const saved=storage();const legacy={id:'draft_'+'b'.repeat(32),account_id:'fake_operator',workspace_id:'group_a',
    scope,payload:{synthetic:true},base_revision:0,status:'PENDING',created_at:'2026-11-03T00:00:00Z'};
  const raw=JSON.stringify([legacy]);saved.set(Sync.PENDING_DRAFTS_KEY,raw);
  const f=fixture({storage:saved});f.client.queueDraft(scope,{synthetic:'new'});
  assert.equal(saved.get(Sync.PENDING_DRAFTS_KEY),raw);
  const reload=fixture({storage:saved});assert.equal(reload.client.snapshot().drafts.length,2);
});
for(const owner of [null,'fake_impostor'])test(`public setter identity ${owner} cannot authorize mutation`,async()=>{
  const f=fixture({owner});const d=f.client.queueDraft(scope,{synthetic:true});
  assert.equal((await f.client.syncDraft(d.id)).status,'BLOCKED');
  assert.equal((await f.client.reviewScope('submit_review',scope,1)).status,'BLOCKED');
  assert.equal(f.posts().length,0);
});
for(const mutation of [{server_verified:false},{membership_active:false},{workspace_id:'group_b'},{role:'viewer'}])
  test(`unverified/foreign actor is denied ${JSON.stringify(mutation)}`,async()=>{
    const f=fixture({actor:{...actor,...mutation}}),d=f.client.queueDraft(scope,{synthetic:true});
    assert.equal((await f.client.syncDraft(d.id)).status,'BLOCKED');assert.equal(f.posts().length,0);
  });
test('missing storage enumeration, failed writes, false ACKs and missing locks deny POST',async()=>{
  const variants=[{get:()=>null,set(){}},{get:()=>null,set(){throw Error('QUOTA');},keys:()=>[]},
    {get:()=>null,set(){},keys:()=>[]}];
  for(const saved of variants){const f=fixture({storage:saved});const d=f.client.queueDraft(scope,{synthetic:true});
    assert.equal((await f.client.syncDraft(d.id)).status,'BLOCKED');assert.equal(f.posts().length,0);}
  const f=fixture({locks:{}}),d=f.client.queueDraft(scope,{synthetic:true});
  assert.equal((await f.client.syncDraft(d.id)).status,'BLOCKED');assert.equal(f.posts().length,0);
});
test('durable intent and dispatch marker exist before any POST, even if later storage fails',async()=>{
  const saved=storage(),set=saved.set;let fail=false;
  saved.set=(key,value)=>{if(fail)throw Error('QUOTA');set(key,value);};
  const f=fixture({storage:saved,write:async()=>{
    assert.equal([...saved.data.keys()].filter(k=>k.endsWith(':dispatched')).length,1);
    fail=true;throw Error('LOST_ACK');
  }});const d=f.client.queueDraft(scope,{synthetic:true});
  assert.equal((await f.client.syncDraft(d.id)).status,'NEEDS_RECONCILIATION');
  fail=false;const reload=fixture({storage:saved});
  assert.equal((await reload.client.syncDraft(d.id)).status,'NEEDS_RECONCILIATION');assert.equal(reload.posts().length,0);
});
test('login binds server user ID rather than caller subject; session GET precedes mutation POST',async()=>{
  const saved=storage(),calls=[];
  const client=Sync.createSyncClient({storage:saved,reviewLockManager:locks(),fetchImpl:async(url,options)=>{
    calls.push({url,options});if(url==='/v1/login')return response(200,{session_token:token});
    if(url==='/v1/session')return response(200,actor);
    assert.ok([...saved.data.keys()].some(k=>k.endsWith(':dispatched')));
    return response(200,receipt());
  }});
  await client.login('fake_auth_subject','fixture-only','group_a');const d=client.queueDraft(scope,{synthetic:true});
  assert.ok([...saved.data.values()].some(v=>JSON.parse(v).account_id==='fake_operator'));
  assert.equal((await client.syncDraft(d.id)).status,'SYNCED');
  assert.deepEqual(calls.map(c=>c.url),['/v1/login','/v1/session','/v1/session','/v1/scopes/drafts']);
  assert.equal(calls[0].options.headers.authorization,undefined);
});
test('role-specific review authorization and invalid account values fail closed',async()=>{
  const f=fixture();assert.equal((await f.client.reviewScope('approve_review',scope,2)).status,'BLOCKED');
  assert.equal(f.posts().length,0);
  for(const accountId of [{},'',42,'bad|identity'])assert.throws(()=>f.client.setSessionToken(token,'group_a',{accountId}),/SYNC_ACCOUNT_INVALID/);
});
test('corrupted legacy persistence cannot be bypassed by queueing another draft',async()=>{
  const saved=storage();saved.set(Sync.PENDING_DRAFTS_KEY,'not-json');const f=fixture({storage:saved});
  const d=f.client.queueDraft(scope,{synthetic:true});assert.equal((await f.client.syncDraft(d.id)).status,'BLOCKED');
  assert.equal(f.posts().length,0);assert.equal(saved.get(Sync.PENDING_DRAFTS_KEY),'not-json');
});
for(const review of [false,true])test(`malformed ${review?'review':'draft'} transport never leaves a retryable attempt`,async()=>{
  const f=fixture({write:async()=>({status:200,ok:true,json:async()=>null})});
  const d=review?null:f.client.queueDraft(scope,{synthetic:true});
  const run=()=>review?f.client.reviewScope('submit_review',scope,1):f.client.syncDraft(d.id);
  assert.equal((await run()).status,'NEEDS_RECONCILIATION');
  assert.equal((await run()).status,'NEEDS_RECONCILIATION');assert.equal(f.posts().length,1);
});
test('explicit local session discard does not delete a reconciliation intent',async()=>{
  const f=fixture({write:async()=>response(500,{})}),d=f.client.queueDraft(scope,{synthetic:true});
  await f.client.syncDraft(d.id);const before=[...f.saved.data];
  f.client.clearSession({discardPending:true});assert.deepEqual([...f.saved.data],before);
  f.client.setSessionToken(token,'group_a',{accountId:'fake_operator'});
  assert.equal((await f.client.syncDraft(d.id)).status,'NEEDS_RECONCILIATION');assert.equal(f.posts().length,1);
});
test('UI callback changing identity immediately before review dispatch cannot borrow the new bearer',async()=>{
  const f=fixture();let switched=false;
  f.client.subscribe(state=>{
    if(!switched && state.review_attempts.some(a=>a.status==='NEEDS_RECONCILIATION')){
      switched=true;f.client.clearSession({discardPending:true});
      f.client.setSessionToken('b'.repeat(43),'group_b',{accountId:'fake_other'});
    }
  });
  const outcome=await f.client.reviewScope('submit_review',scope,1);
  assert.equal(switched,true);assert.equal(outcome.error,'SYNC_SESSION_CHANGED');assert.equal(f.posts().length,0);
  assert.equal(f.client.snapshot().workspace_id,'group_b');assert.equal(f.manager.held.size,0);
});
test('session change during dispatch-marker persistence blocks draft before POST',async()=>{
  const saved=storage(),originalSet=saved.set;let f,switched=false;
  saved.set=(key,value)=>{
    originalSet(key,value);
    if(f && key.endsWith(':dispatched') && !switched){
      switched=true;f.client.clearSession({discardPending:true});
      f.client.setSessionToken('b'.repeat(43),'group_b',{accountId:'fake_other'});
    }
  };
  f=fixture({storage:saved});const d=f.client.queueDraft(scope,{synthetic:true});
  const outcome=await f.client.syncDraft(d.id);
  assert.equal(outcome.error,'SYNC_SESSION_CHANGED');assert.equal(f.posts().length,0);
  assert.equal(outcome.payload,undefined);assert.equal(f.manager.held.size,0);
});
test('blank existing review marker cannot authorize a replacement intent',async()=>{
  const first=fixture({write:async()=>response(500,{})});
  await first.client.reviewScope('submit_review',scope,1);
  const key=[...first.saved.data.keys()].find(k=>k.startsWith('kts-team-review-intent-v1:'));
  assert.ok(key);first.saved.set(key,''); // Corrupted but still existing evidence.
  const reload=fixture({storage:first.saved,locks:first.manager});
  assert.equal((await reload.client.reviewScope('submit_review',scope,1)).status,'NEEDS_RECONCILIATION');
  assert.equal(reload.posts().length,0);assert.equal(first.saved.get(key),'');
});

test('legacy v1 PENDING with no dispatch marker is never automatically resent',async()=>{
  const saved=storage();
  const legacy={id:'draft_'+'d'.repeat(32),account_id:'fake_operator',workspace_id:'group_a',
    scope,payload:{synthetic:true},base_revision:0,status:'PENDING',created_at:'2026-11-03T00:00:00Z'};
  const original=JSON.stringify([legacy]);saved.set(Sync.PENDING_DRAFTS_KEY,original);
  const f=fixture({storage:saved});
  assert.equal(f.client.snapshot().drafts[0].status,'NEEDS_RECONCILIATION');
  assert.equal((await f.client.syncDraft(legacy.id)).status,'NEEDS_RECONCILIATION');
  await f.client.reconnect();
  assert.equal(f.posts().length,0);
  assert.equal(saved.get(Sync.PENDING_DRAFTS_KEY),original);
});
test('legacy v1 quarantine still permits a distinct new v2 draft in its creating session',async()=>{
  const saved=storage();
  saved.set(Sync.PENDING_DRAFTS_KEY,JSON.stringify([{
    id:'draft_'+'d'.repeat(32),account_id:'fake_operator',workspace_id:'group_a',
    scope,payload:{synthetic:'legacy'},base_revision:0,status:'PENDING',
    created_at:'2026-11-03T00:00:00Z'}]));
  const f=fixture({storage:saved});
  const fresh=f.client.queueDraft(scope,{synthetic:'new'});
  assert.equal((await f.client.syncDraft(fresh.id)).status,'SYNCED');
  assert.equal(f.posts().length,1);
  const restored=fixture({storage:saved});
  assert.equal(restored.client.snapshot().drafts.find(d=>d.id==='draft_'+'d'.repeat(32)).status,'NEEDS_RECONCILIATION');
  assert.equal(restored.client.snapshot().drafts.find(d=>d.id===fresh.id).status,'NEEDS_RECONCILIATION');
  await restored.client.reconnect();
  assert.equal(restored.posts().length,0);
  assert.equal(restored.client.snapshot().drafts.find(d=>d.id==='draft_'+'d'.repeat(32)).status,'NEEDS_RECONCILIATION');
});
test('same intent present in legacy v1 and v2 is conservatively quarantined',async()=>{
  const saved=storage();
  const a=fixture({storage:saved}),newDraft=a.client.queueDraft(scope,{synthetic:true});
  const v2=[...saved.data.entries()].find(([k])=>k.startsWith('kts-team-draft-intent-v2:'));
  assert.ok(v2);
  const legacy=JSON.parse(v2[1]);
  saved.set(Sync.PENDING_DRAFTS_KEY,JSON.stringify([legacy]));
  const b=fixture({storage:saved});
  assert.equal(b.client.snapshot().drafts.find(d=>d.id===newDraft.id).status,'NEEDS_RECONCILIATION');
  await b.client.reconnect();
  assert.equal(b.posts().length,0);
});

test('v2 dispatch-marker eviction after lost ACK never causes a second POST',async()=>{
  const saved=storage();
  const first=fixture({storage:saved,write:async()=>response(503,{error:'TEAM_MUTATION_OUTCOME_UNKNOWN'})});
  const draft=first.client.queueDraft(scope,{synthetic:true});
  assert.equal((await first.client.syncDraft(draft.id)).status,'NEEDS_RECONCILIATION');
  assert.equal(first.posts().length,1);
  const marker=[...saved.data.keys()].find(k=>k.endsWith(':dispatched'));
  assert.ok(marker);
  const durableKey=[...saved.data.keys()].find(k=>k.startsWith('kts-team-draft-intent-v2:')&&!k.endsWith(':dispatched'));
  const durableBody=saved.data.get(durableKey);
  saved.data.delete(marker); // Simulate partial browser storage eviction, not a valid no-write proof.
  const afterReload=fixture({storage:saved});
  assert.equal(afterReload.client.snapshot().drafts.find(row=>row.id===draft.id).status,'NEEDS_RECONCILIATION');
  assert.equal((await afterReload.client.syncDraft(draft.id)).status,'NEEDS_RECONCILIATION');
  await afterReload.client.reconnect();
  assert.equal(afterReload.posts().length,0);
  assert.equal(saved.data.get(durableKey),durableBody);
});
test('unattempted v2 draft restored after reload needs reconciliation, not auto-send',async()=>{
  const saved=storage(),first=fixture({storage:saved});
  const draft=first.client.queueDraft(scope,{synthetic:true});
  assert.equal(first.client.snapshot().drafts.find(row=>row.id===draft.id).status,'PENDING');
  const restored=fixture({storage:saved});
  assert.equal(restored.client.snapshot().drafts.find(row=>row.id===draft.id).status,'NEEDS_RECONCILIATION');
  assert.equal((await restored.client.syncDraft(draft.id)).status,'NEEDS_RECONCILIATION');
  await restored.client.reconnect();
  assert.equal(restored.posts().length,0);
  assert.equal(first.posts().length,0);
});
