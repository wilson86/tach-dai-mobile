'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createServerLedgerApi}=require('../team-settlement/server-ledger-api.cjs');
const actor={server_verified:true,membership_active:true,user_id:'operator_a',workspace_id:'group_a',role:'operator'};
const scope={workspace_id:'group_a',partner_id:'partner_1',business_date:'2026-11-18',region:'mn'};
function harness(page,authOverride={}){
  const auth={verifySession:async()=>actor,...authOverride};
  const repository={appendDraft:async()=>{throw Error('NOT_PERMITTED')},getScope:async()=>page};
  return createServerLedgerApi({auth,repository});
}
test('verified scope response is independent of later repository mutations',async()=>{
  const shared={...scope,revision:1,totals:{value:111},state:'DRAFT'};
  const result=await harness(shared).getScope('synthetic-token',scope);
  shared.workspace_id='group_b';shared.totals.value=999;
  assert.equal(result.workspace_id,'group_a');assert.equal(result.totals.value,111);
  assert.notStrictEqual(result,shared);assert.notStrictEqual(result.totals,shared.totals);
});
test('repository cannot mutate scope while authenticated session awaits commit',async()=>{
  let release,confirmed;
  const gate=new Promise(resolve=>{release=resolve});
  const ready=new Promise(resolve=>{confirmed=resolve});
  const auth={withVerifiedSession:async(_token,work)=>{
    const response=await work(actor);
    confirmed();await gate;
    return response;
  }};
  const shared={...scope,state:'DRAFT',revision:1,totals:{value:111}};
  const pending=harness(shared,auth).getScope('synthetic-token',scope);
  await ready;
  shared.workspace_id='group_b';shared.totals.value=999;
  release();
  const result=await pending;
  assert.equal(result.workspace_id,'group_a');assert.equal(result.totals.value,111);
});
test('noncloneable repository response fails closed rather than returning unchecked data',async()=>{
  const unsafe={...scope,state:'DRAFT',callback:()=>true};
  await assert.rejects(harness(unsafe).getScope('synthetic-token',scope),
    /TEAM_SCOPE_RESPONSE_UNVERIFIED/);
});
test('a foreign scope response remains rejected',async()=>{
  await assert.rejects(harness({...scope,workspace_id:'group_b'}).getScope('synthetic-token',scope),
    /TEAM_SCOPE_RESPONSE_UNVERIFIED/);
});
