'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createPostgresAuthService,tokenHash}=require('../team-settlement/postgres-auth-service.cjs');
const {issueForReview}=require('./fixtures/receipt-v2-authority-admission.cjs');
const {verifyForReview}=require('./fixtures/receipt-backend-proof-v2.cjs');
const t='synthetic_'+'z'.repeat(40),tm=1793789000000;
const actor={session_handle:'b'.repeat(32),user_id:'synthetic_u',workspace_id:'synthetic_w'};
const signingKey=Buffer.alloc(32,0x5b),keys=['draft_'+'1'.repeat(32)];
function fake({sessions=[actor],role='operator',wrongTenant=false}={}){
  const log=[];
  const db={transaction:async fn=>{
    log.push('BEGIN');try {
      const r=await fn({query:async (sql,args=[])=>{
        log.push({sql,args});
        if(sql.includes('FROM kts_auth.sessions'))return {rows:sessions};
        if(sql.includes('set_config'))return {rows:[{workspace_id:wrongTenant?'another_ws':args[0]}]};
        if(sql.includes('FROM kts_team.memberships'))return {rows:role===null?[]:[{team_role:role}]};
        throw Error('TEST_UNEXPECTED_SQL');
      }});log.push('COMMIT');return r;
    }catch(e){log.push('ROLLBACK');throw e;}
  }};
  return {db,log};
}
test('default-off durable Auth has no exposed V2 signing interface',async()=>{
  const f=fake();const a=createPostgresAuthService({db:f.db,clock:()=>tm});
  assert.equal('authorizeReceiptRead' in a,false);assert.deepEqual(f.log,[]);
});
test('opted-in real Auth service signs only after live SQL checks, no bearer/hash in envelope',async()=>{
  const f=fake();let keyRead=0;
  const a=createPostgresAuthService({db:f.db,clock:()=>tm,receiptV2SessionHandleEnabled:true});
  assert.equal(typeof a.authorizeReceiptRead,'function');
  const e=await issueForReview({auth:a,keyAuthority:{currentSigningKey:async()=>{
    assert.equal(f.log.includes('COMMIT'),false);keyRead++;
    return {keyId:'a'.repeat(16),key:signingKey};
  }},nonceSource:()=> 'c'.repeat(32),bearerToken:t,keys,nowSeconds:Math.trunc(tm/1000)});
  assert.equal(keyRead,1);assert.equal(f.log.at(-1),'COMMIT');
  assert.equal(e.workspace_id,actor.workspace_id);
  assert.equal(verifyForReview({verifierKey:signingKey,envelope:e,
    expectedSession:{...actor,server_verified:true,membership_active:true,role:'operator'},
    nowSeconds:Math.trunc(tm/1000)+1}).verified,true);
  assert.equal(Object.hasOwn(e,'session_token'),false);assert.equal(Object.hasOwn(e,'session_hash'),false);
  assert.equal(f.log.filter(x=>typeof x==='object').length,4);
  const lookup=f.log.find(x=>typeof x==='object');
  assert.equal(lookup.args[0],tokenHash(t));
});
test('revoked session, disabled membership, and forged SQL tenant never touch signer key',async()=>{
  for(const input of [{sessions:[]},{role:null},{role:'viewer'},{wrongTenant:true}]){
    const f=fake(input);let keyRead=0;
    const a=createPostgresAuthService({db:f.db,clock:()=>tm,receiptV2SessionHandleEnabled:true});
    await assert.rejects(issueForReview({auth:a,keyAuthority:{currentSigningKey:()=>{
      keyRead++;return {keyId:'a'.repeat(16),key:signingKey};
    }},nonceSource:()=> 'c'.repeat(32),bearerToken:t,keys,
    nowSeconds:Math.trunc(tm/1000)}),/TEAM_RECEIPT_V2_AUTH_DENIED/);
    assert.equal(keyRead,0);assert.equal(f.log.at(-1),'ROLLBACK');
  }
});
