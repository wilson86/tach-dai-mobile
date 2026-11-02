'use strict';
// Loopback HTTP contract using disposable synthetic dependencies; no database.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createAuthHttpServer}=require('../team-settlement/auth-http-contract.cjs');

test('draft and review expose unknown outcomes without internal causes',async()=>{
  const auth={login:async()=>({}),verifySession:async()=>({}),revokeSession:async()=>true};
  const fail=async()=>{throw new Error('TEAM_MUTATION_OUTCOME_UNKNOWN',{cause:Error('fake_secret_marker')});};
  const ledger={appendDraft:fail,advanceReview:fail};
  const server=createAuthHttpServer(auth,{ledger,enableSyntheticReviewHttp:true});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    for(const path of ['/v1/scopes/drafts','/v1/scopes/review']){
      const response=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{
        method:'POST',headers:{authorization:'Bearer '+'a'.repeat(43),'content-type':'application/json'},body:'{}'
      });
      assert.equal(response.status,503);
      const body=await response.text();
      assert.deepEqual(JSON.parse(body),{error:'TEAM_MUTATION_OUTCOME_UNKNOWN',sync_status:'UNKNOWN',resolution:'MANUAL_REVIEW'});
      assert.doesNotMatch(body,/fake_secret_marker|stack|cause/i);
    }
  }finally{await new Promise(resolve=>server.close(resolve));}
});
