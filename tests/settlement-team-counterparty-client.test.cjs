'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createSyncClient}=require('../app/settlement-team-sync-client.js');

function response(status,body){return {ok:status>=200&&status<300,status,async json(){return body;}};}
test('counterparty client requires an authenticated workspace and reads only fake tenant metadata',async()=>{
  const seen=[];
  const client=createSyncClient({fetchImpl:async(path,options)=>{
    seen.push({path,options});
    return response(200,[{workspace_id:'fake_group_a',partner_id:'fake_customer_1',
      partner_kind:'customer',display_name:'Synthetic Customer'}]);
  }});
  assert.deepEqual(await client.listCounterparties(),{status:'BLOCKED',error:'AUTH_SESSION_REQUIRED',items:[]});
  client.setSessionToken('a'.repeat(43),'fake_group_a');
  const before=client.snapshot();
  const result=await client.listCounterparties({kind:'customer',limit:2});
  assert.equal(result.status,'SYNCED');
  assert.equal(result.items[0].partner_id,'fake_customer_1');
  assert.equal(seen.length,1);
  assert.match(seen[0].path,/^\/v1\/counterparties\?limit=2&kind=customer$/);
  assert.equal(seen[0].options.headers.authorization,'Bearer '+'a'.repeat(43));
  const after=client.snapshot();
  assert.equal(after.cursor,before.cursor);
  assert.deepEqual(after.drafts,before.drafts);
});
test('counterparty client rejects foreign, non-synthetic and duplicate directory rows without changing session',async()=>{
  for(const rows of [
    [{workspace_id:'fake_group_b',partner_id:'fake_customer_1',partner_kind:'customer',display_name:'Foreign'}],
    [{workspace_id:'fake_group_a',partner_id:'customer_1',partner_kind:'customer',display_name:'Not fake'}],
    [{workspace_id:'fake_group_a',partner_id:'fake_customer_1',partner_kind:'customer',display_name:'One'},
     {workspace_id:'fake_group_a',partner_id:'fake_customer_1',partner_kind:'owner',display_name:'Duplicate'}]
  ]){
    const client=createSyncClient({fetchImpl:async()=>response(200,rows)});
    client.setSessionToken('b'.repeat(43),'fake_group_a');
    const result=await client.listCounterparties();
    assert.deepEqual(result,{status:'BLOCKED',error:'SYNC_COUNTERPARTY_UNVERIFIED',items:[]});
    assert.equal(client.snapshot().authenticated,true);
  }
});
