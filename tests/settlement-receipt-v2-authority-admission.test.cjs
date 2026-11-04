'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {issueForReview} = require('./fixtures/receipt-v2-authority-admission.cjs');
const {verifyForReview} = require('./fixtures/receipt-backend-proof-v2.cjs');
const TOKEN = 'synthetic_' + 'a'.repeat(40);
const now = 1793789000;
const verifiedSession = Object.freeze({server_verified:true,membership_active:true,
  session_handle:'b'.repeat(32),workspace_id:'synthetic_group_a',
  user_id:'synthetic_user_a',role:'operator'});
const keys = ['draft_'+'1'.repeat(32), 'draft_'+'2'.repeat(32)];
const secret = Buffer.alloc(32,0x5a);
function context() {
  const calls = [];
  const fixture = {
    auth:{authorizeReceiptRead: async (token, work) => {
      calls.push('auth'); assert.equal(token,TOKEN);
      return await work(verifiedSession);
    }},
    keyAuthority:{currentSigningKey:async () => {calls.push('secret');return {keyId:'a'.repeat(16),key:secret};}},
    nonceSource:async () => {calls.push('nonce');return 'c'.repeat(32);},
    bearerToken:TOKEN,keys,nowSeconds:now
  };
  return {fixture,calls};
}
test('only a callback-delivered session is signed, after auth and before secret access',async()=>{
  const {fixture,calls}=context();
  const proof = await issueForReview({...fixture, verifiedSession:{...verifiedSession,workspace_id:'synthetic_group_b'}});
  assert.deepEqual(calls,['auth','secret','nonce']);
  assert.equal(proof.workspace_id,verifiedSession.workspace_id);
  assert.equal(verifyForReview({verifierKey:secret,envelope:proof,expectedSession:verifiedSession,nowSeconds:now+1}).verified,true);
  assert.equal('key' in proof,false);assert.equal('bearerToken' in proof,false);
});
test('auth denial or unusable actor fails before secret or nonce access',async()=>{
  const {fixture,calls}=context();
  const denied = {...fixture,auth:{authorizeReceiptRead:async()=>{calls.push('auth');throw Error('SESSION_REVOKED')}}};
  await assert.rejects(issueForReview(denied),/SESSION_REVOKED/);
  assert.deepEqual(calls,['auth']);
  for (const bad of [{...verifiedSession,role:'viewer'}, {...verifiedSession,server_verified:false},
    {...verifiedSession,membership_active:false},{...verifiedSession,session_handle:'invalid'}]) {
    const x = context();x.fixture.auth.authorizeReceiptRead=async (_,work)=>{x.calls.push('auth');return work(bad);};
    await assert.rejects(issueForReview(x.fixture),/AUTHORITY_DENIED/);
    assert.deepEqual(x.calls,['auth']);
  }
});
test('invalid claims/keys never reach auth or key authority',async()=>{
  for (const override of [{bearerToken:'bad'},{keys:[]},{keys:[keys[0],keys[0]]},
    {keys:keys.slice().reverse()},{nowSeconds:NaN},{auth:null}]) {
    const {fixture,calls}=context();
    await assert.rejects(issueForReview({...fixture,...override}),/AUTHORITY_DENIED/);
    assert.deepEqual(calls,[]);
  }
});
test('fail closed on unavailable secret, wrong key size, invalid id, invalid nonce',async()=>{
  for (const badKey of [null,{keyId:'a'.repeat(16),key:Buffer.alloc(16)},
    {keyId:'INVALID',key:secret}]) {
    const x=context(); x.fixture.keyAuthority.currentSigningKey=async()=>{x.calls.push('secret');return badKey;};
    await assert.rejects(issueForReview(x.fixture),/AUTHORITY_DENIED/);
    assert.deepEqual(x.calls,['auth','secret']);
  }
  const y=context();y.fixture.nonceSource=async()=>{y.calls.push('nonce');return 'invalid'};
  await assert.rejects(issueForReview(y.fixture),/AUTHORITY_DENIED/);
  assert.deepEqual(y.calls,['auth','secret','nonce']);
});
test('authorization callback cannot be skipped, invoked twice or swap signed result',async()=>{
  const a=context();
  a.fixture.auth.authorizeReceiptRead=async()=>Object.freeze({nonce:'c'.repeat(32),proof:'d'.repeat(64)});
  await assert.rejects(issueForReview(a.fixture),/AUTHORITY_DENIED/);
  assert.deepEqual(a.calls,[]);
  const b=context();
  b.fixture.auth.authorizeReceiptRead=async(_token,work)=>{await work(verifiedSession);return work(verifiedSession);};
  await assert.rejects(issueForReview(b.fixture),/AUTHORITY_DENIED/);
  assert.deepEqual(b.calls,['secret','nonce']);
  const c=context();
  c.fixture.auth.authorizeReceiptRead=async(_token,work)=>({...await work(verifiedSession)});
  await assert.rejects(issueForReview(c.fixture),/AUTHORITY_DENIED/);
  assert.deepEqual(c.calls,['secret','nonce']);
});
test('module is fixture-only and contains no production I/O or persisted secret',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const s=fs.readFileSync(path.join(__dirname,'fixtures/receipt-v2-authority-admission.cjs'),'utf8');
  assert.doesNotMatch(s,/\brequire\(['"](?:pg|http|https|fs|net|child_process)['"]\)/);
  assert.doesNotMatch(s,/\bprocess\.env\b|\bconsole\.log\b/);
});
