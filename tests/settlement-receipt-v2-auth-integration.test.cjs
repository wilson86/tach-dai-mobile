'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createReceiptV2AuthBoundary}=require('../team-settlement/candidate/receipt-v2-auth-boundary.cjs');
const {issueForReview}=require('./fixtures/receipt-v2-authority-admission.cjs');
const {verifyForReview}=require('./fixtures/receipt-backend-proof-v2.cjs');
const token='synthetic_'+'c'.repeat(40),key=Buffer.alloc(32,0x7b),now=1793789000;
const session={session_handle:'b'.repeat(32),user_id:'synthetic_user',workspace_id:'synthetic_group'};
const keys=['draft_'+'1'.repeat(32)];
function seed({sessionRows=[session],role='operator'}={}) {
  const history=[];
  const db={transaction:async work=>{
    history.push('BEGIN');
    try{
      const result=await work({query:async(sql,args)=>{
        history.push(sql);
        if(sql.includes('FROM kts_auth.sessions'))return {rows:sessionRows};
        if(sql.includes('set_config'))return {rows:[{workspace_id:args[0]}]};
        if(sql.includes('FROM kts_team.memberships'))return {rows:role===null?[]:[{team_role:role}]};
        throw Error('SYNTHETIC_QUERY_UNEXPECTED');
      }});
      history.push('COMMIT');return result;
    }catch(e){history.push('ROLLBACK');throw e;}
  }};
  return {history,db};
}
test('Auth-bound server signs only after DB proof, verifier checks exact actor/scope',async()=>{
  const {db,history}=seed();let keyAccess=0;
  const auth=createReceiptV2AuthBoundary({db,enabled:true,clock:()=>now*1000});
  const envelope=await issueForReview({auth,keyAuthority:{currentSigningKey:async()=>{
    keyAccess++;assert.equal(history.includes('COMMIT'),false);
    return {keyId:'a'.repeat(16),key};
  }},nonceSource:()=> 'd'.repeat(32),bearerToken:token,keys,nowSeconds:now});
  assert.equal(keyAccess,1);assert.equal(history.at(-1),'COMMIT');
  assert.equal(envelope.workspace_id,session.workspace_id);
  const verified=verifyForReview({verifierKey:key,envelope,
    expectedSession:{...session,server_verified:true,membership_active:true,role:'operator'},nowSeconds:now+1});
  assert.equal(verified.user_id,session.user_id);
  assert.equal('session_token' in envelope,false);
});
test('revoked or viewer SQL rows never access signing key',async()=>{
  for(const input of [{sessionRows:[]},{role:'viewer'}]){
    const {db,history}=seed(input);let keyAccess=0;
    const auth=createReceiptV2AuthBoundary({db,enabled:true,clock:()=>now*1000});
    await assert.rejects(issueForReview({auth,keyAuthority:{currentSigningKey:()=>{
      keyAccess++;return {keyId:'a'.repeat(16),key};
    }},nonceSource:()=> 'd'.repeat(32),bearerToken:token,keys,nowSeconds:now}),/AUTH_DENIED/);
    assert.equal(keyAccess,0);assert.equal(history.at(-1),'ROLLBACK');
  }
});
