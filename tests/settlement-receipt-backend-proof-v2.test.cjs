'use strict';
// Synthetic source-contract tests ONLY; no PostgreSQL, HTTP, or key provisioning.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {signForReview, verifyForReview} = require('./fixtures/receipt-backend-proof-v2.cjs');
const key = Buffer.alloc(32, 0x41); // synthetic key; not a credential
const session = Object.freeze({server_verified:true, membership_active:true,
  role:'operator', session_handle:'b'.repeat(32), workspace_id:'synthetic_group_a', user_id:'synthetic_user_a'});
const keys = ['draft_'+'1'.repeat(32), 'draft_'+'2'.repeat(32)];
const NOW = 1793789000;
const options = {backendKey:key, keyId:'a'.repeat(16), verifiedSession:session,
  keys, nonce:'c'.repeat(32), nowSeconds:NOW};
const make = () => signForReview(options);
const verify = (envelope, expectedSession = session, verifierKey = key, nowSeconds = NOW + 1) =>
  verifyForReview({verifierKey, envelope, expectedSession, nowSeconds});

test('synthetic server-side proof binds purpose, scope, actor and exact keys', () => {
  const signed = make();
  assert.deepEqual(verify(signed), {verified:true, workspace_id:session.workspace_id,
    user_id:session.user_id, keys});
  assert.equal(make().proof, signed.proof, 'exact replay of a read remains possible');
  assert.equal(Object.hasOwn(signed,'backendKey'),false);
  assert.equal(Object.hasOwn(signed,'bearer'),false);
});

test('adversarial changes to every signed dimension deny without returning secrets', () => {
  const signed = make();
  for (const modified of [
    {key_id:'d'.repeat(16)}, {session_handle:'d'.repeat(32)},
    {workspace_id:'synthetic_group_b'}, {user_id:'synthetic_user_b'},
    {keys:['draft_'+'3'.repeat(32)]}, {nonce:'d'.repeat(32)},
    {issued_at:signed.issued_at+1}, {expires_at:signed.expires_at+1},
    {proof:'0'.repeat(64)}
  ]) assert.throws(() => verify({...signed,...modified}), /^Error: TEAM_RECEIPT_V2_PROOF_DENIED$/);
  assert.throws(() => verify(signed, {...session, workspace_id:'synthetic_group_b'}), /PROOF_DENIED/);
  assert.throws(() => verify(signed, {...session, user_id:'synthetic_user_b'}), /PROOF_DENIED/);
  assert.throws(() => verify(signed, {...session, session_handle:'d'.repeat(32)}), /PROOF_DENIED/);
});

test('expiry, key rotation, invalid caller roles and malformed arrays fail closed', () => {
  const signed = make();
  assert.throws(() => verify(signed, session, Buffer.alloc(32,0x42)), /PROOF_DENIED/);
  assert.throws(() => verify(signed, session, key, signed.expires_at), /PROOF_DENIED/);
  assert.throws(() => verify(signed, session, key, NOW-1), /PROOF_DENIED/);
  for (const role of ['viewer','reviewer', 'administrator'])
    assert.throws(() => verify(signed, {...session,role}), /PROOF_DENIED/);
  for (const badKeys of [[],[keys[0],keys[0]],keys.slice().reverse(),new Array(31).fill(keys[0])])
    assert.throws(() => signForReview({...options,keys:badKeys}), /PROOF_DENIED/);
  assert.throws(() => signForReview({...options,backendKey:Buffer.alloc(16)}), /PROOF_DENIED/);
  assert.throws(() => signForReview({...options,ttlSeconds:31}), /PROOF_DENIED/);
  assert.throws(() => signForReview({...options,verifiedSession:{...session,server_verified:false}}), /PROOF_DENIED/);
});

test('no module path to production and no database side effects', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const fixture = fs.readFileSync(path.join(__dirname,'fixtures/receipt-backend-proof-v2.cjs'),'utf8');
  assert.doesNotMatch(fixture, /\b(?:INSERT|UPDATE|DELETE|GRANT|REVOKE|CREATE\s+FUNCTION|SET\s+ROLE)\s+/i);
  assert.doesNotMatch(fixture, /\bprocess\.env\b|\bconsole\.log\b|\bhttp\.request\b|\bfetch\s*\(/i);
});
