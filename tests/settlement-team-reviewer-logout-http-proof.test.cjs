'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createReviewerLogoutHttpProof} = require('../team-settlement/reviewer-logout-http-proof.cjs');
const TOKEN = 'A'.repeat(43); // synthetic, not an actual session
const who = {expectedWorkspace:'fake_groupa_contract', expectedReviewer:'fake_reviewer_contract'};
const before = {status:200,body:{workspace_id:who.expectedWorkspace,user_id:who.expectedReviewer,role:'reviewer'}};
const after = {status:401,body:{error:'AUTH_SESSION_INVALID'}};

test('same in-memory token is checked over HTTP before and after UI logout; receipt is non-secret',async()=>{
  const calls=[];
  const p=createReviewerLogoutHttpProof({...who,observeSession:async request=>{
    calls.push(request);
    return calls.length===1?before:after;
  }});
  const a=await p.beforeLogout(TOKEN),b=await p.afterLogout({uiLogoutConfirmed:true});
  assert.deepEqual([a.http_status,b.http_status],[200,401]);
  assert.deepEqual(calls.map(x=>x.path),['/v1/session','/v1/session']);
  assert.equal(calls[0].bearer,TOKEN);assert.equal(calls[1].bearer,TOKEN);
  assert.equal(JSON.stringify({a,b}).includes(TOKEN),false);
  await assert.rejects(p.afterLogout({uiLogoutConfirmed:true}),/PRECONDITION/);
});

test('an unverified actor never arms the post-logout request',async()=>{
  for(const response of [undefined,{status:401,body:{error:'AUTH_SESSION_INVALID'}},
    {status:200,body:{...before.body,user_id:'fake_reviewer_another'}},
    {status:200,body:{...before.body,role:'operator'}}]){
    let calls=0;
    const p=createReviewerLogoutHttpProof({...who,observeSession:async()=>{calls++;return response;}});
    await assert.rejects(p.beforeLogout(TOKEN),/BEFORE_UNVERIFIED/);
    await assert.rejects(p.afterLogout({uiLogoutConfirmed:true}),/PRECONDITION/);
    assert.equal(calls,1);
  }
});

test('missing UI confirmation and non-401 server replies fail closed',async()=>{
  for(const second of [{status:200,body:before.body},{status:403,body:{error:'DENIED'}},
     {status:401,body:{error:'WRONG'}},undefined]){
    let calls=0;
    const p=createReviewerLogoutHttpProof({...who,observeSession:async()=>++calls===1?before:second});
    await p.beforeLogout(TOKEN);
    await assert.rejects(p.afterLogout({uiLogoutConfirmed:false}),/PRECONDITION/);
    assert.equal(calls,1);
    const q=createReviewerLogoutHttpProof({...who,observeSession:async()=>++calls===2?before:second});
    await q.beforeLogout(TOKEN);
    await assert.rejects(q.afterLogout({uiLogoutConfirmed:true}),/REVOCATION_UNVERIFIED/);
    assert.equal(calls,3);
  }
});

test('untrusted callback failure is sanitized without ever printing bearer',async()=>{
  const p=createReviewerLogoutHttpProof({...who,observeSession:async()=>before});
  await p.beforeLogout(TOKEN);
  p.discard();
  await assert.rejects(p.afterLogout({uiLogoutConfirmed:true}),/PRECONDITION/);
  let calls=0;
  const q=createReviewerLogoutHttpProof({...who,observeSession:async()=>{
    if(++calls===1)return before;
    throw Error('SECRET:'+TOKEN);
  }});
  await q.beforeLogout(TOKEN);
  await assert.rejects(q.afterLogout({uiLogoutConfirmed:true}),e=>e.message==='REVIEWER_HTTP_SESSION_REVOCATION_UNVERIFIED');
});

test('malformed and replayed bearer values are rejected without network',async()=>{
  let calls=0;
  const p=createReviewerLogoutHttpProof({...who,observeSession:async()=>{calls++;return before;}});
  await assert.rejects(p.beforeLogout('bad'),/PRECONDITION/);
  await assert.rejects(p.beforeLogout(TOKEN),/PRECONDITION/);
  assert.equal(calls,0);
});
