'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {createReceiptV2TrustedSigner}=require('../team-settlement/candidate/receipt-v2-trusted-signer.cjs');
const TOKEN='token_'+('x'.repeat(40));
const now=1793789000000;
const ACTOR=Object.freeze({server_verified:true,membership_active:true,role:'operator',
  session_handle:'a'.repeat(32),user_id:'synthetic_user',workspace_id:'synthetic_group'});
const ONE='draft_'+'1'.repeat(32),TWO='draft_'+'2'.repeat(32);
const SECRET=Buffer.alloc(32,0x37);
const baseKey=()=>({key_id:'b'.repeat(16),secret_bytes:SECRET,
  activated_at_ms:now-1000,stop_signing_at_ms:now+40000,
  stop_verify_at_ms:now+60000,revoked_at_ms:null});
function fixture({actor=ACTOR,key=baseKey(),enabled=true,nowMs=now}={}) {
  const state={authCalls:0,keyCalls:0};
  const auth={authorizeReceiptRead:async (t,cb)=>{state.authCalls++;assert.equal(t,TOKEN);return cb(actor);}};
  const keyProvider={currentSigningKey:async()=>{state.keyCalls++;return key;}};
  const signer=createReceiptV2TrustedSigner({auth,keyProvider,clock:()=>nowMs,
    nonceSource:()=>Buffer.alloc(16,0x6c),enabled});
  return {signer,state};
}
test('default disabled never calls Auth or secret provider',async()=>{
  const signer=createReceiptV2TrustedSigner();
  await assert.rejects(signer.signReceiptRead({bearerToken:TOKEN,keys:[ONE]}),/NOT_ENABLED/);
});
test('actual canonical HMAC bytes and envelope match independent crypto verification',async()=>{
  const f=fixture();
  const e=await f.signer.signReceiptRead({bearerToken:TOKEN,keys:[ONE,TWO]});
  const fields=['kts-receipt-read-v2',e.key_id,e.session_handle,e.workspace_id,e.user_id,
    2,ONE,TWO,e.nonce,e.issued_at,e.expires_at];
  const canonical=Buffer.from(fields.map(v=>Buffer.byteLength(String(v),'utf8')+':'+v).join(''));
  assert.equal(e.proof,crypto.createHmac('sha256',SECRET).update(canonical).digest('hex'));
  assert.equal(f.state.authCalls,1);assert.equal(f.state.keyCalls,1);
  assert.equal(e.workspace_id,ACTOR.workspace_id);assert.equal(e.session_handle,ACTOR.session_handle);
  assert.deepEqual(e.keys,[ONE,TWO]);assert.ok(Object.isFrozen(e));assert.ok(Object.isFrozen(e.keys));
  assert.equal(JSON.stringify(e).includes(TOKEN),false);
  assert.equal(JSON.stringify(e).includes(SECRET.toString('hex')),false);
  assert.equal(SECRET.equals(Buffer.alloc(32,0x37)),true);
});
test('invalid bearer, ordered keys and TTL are denied before key access',async()=>{
  const f=fixture();
  for(const args of [
    {bearerToken:'bad',keys:[ONE]},
    {bearerToken:TOKEN,keys:[TWO,ONE]},
    {bearerToken:TOKEN,keys:[ONE,ONE]},
    {bearerToken:TOKEN,keys:[]},
    {bearerToken:TOKEN,keys:[ONE],ttlSeconds:31},
  ])await assert.rejects(f.signer.signReceiptRead(args),/SIGNER_DENIED/);
  assert.equal(f.state.keyCalls,0);assert.equal(f.state.authCalls,0);
});
test('invalid actor cannot access secret; key rotation/revocation/expiry fails closed',async()=>{
  let f=fixture({actor:{...ACTOR,role:'viewer'}});
  await assert.rejects(f.signer.signReceiptRead({bearerToken:TOKEN,keys:[ONE]}),/SIGNER_DENIED/);
  assert.equal(f.state.keyCalls,0);
  for(const key of [{...baseKey(),revoked_at_ms:now},
    {...baseKey(),stop_signing_at_ms:now},
    {...baseKey(),stop_verify_at_ms:now+1000},
    {...baseKey(),secret_bytes:Buffer.alloc(31)},
    {...baseKey(),key_id:'invalid'}]){
    f=fixture({key});await assert.rejects(f.signer.signReceiptRead({bearerToken:TOKEN,keys:[ONE]}),/SIGNER_DENIED/);
  }
});
test('bad injected nonce and untrusted config fail closed',async()=>{
  const f=createReceiptV2TrustedSigner({auth:{authorizeReceiptRead:async(_,cb)=>cb(ACTOR)},
    keyProvider:{currentSigningKey:async()=>baseKey()},enabled:true,
    clock:()=>now,nonceSource:()=>Buffer.alloc(3)});
  await assert.rejects(f.signReceiptRead({bearerToken:TOKEN,keys:[ONE]}),/SIGNER_DENIED/);
  assert.throws(()=>createReceiptV2TrustedSigner({enabled:'true'}),/SIGNER_DENIED/);
});

test('Auth callback must be invoked exactly once and its exact signed object returned',async()=>{
  for(const fakeAuth of [
    {authorizeReceiptRead:async()=>({proof:'forged'})},
    {authorizeReceiptRead:async(_,cb)=>{const e=await cb(ACTOR);return {...e};}},
    {authorizeReceiptRead:async(_,cb)=>{await cb(ACTOR);return cb(ACTOR);}}
  ]){
    const secretProvider={currentSigningKey:async()=>baseKey()};
    const signer=createReceiptV2TrustedSigner({auth:fakeAuth,keyProvider:secretProvider,
      enabled:true,clock:()=>now,nonceSource:()=>Buffer.alloc(16,0x6c)});
    await assert.rejects(signer.signReceiptRead({bearerToken:TOKEN,keys:[ONE]}),/SIGNER_DENIED/);
  }
});
