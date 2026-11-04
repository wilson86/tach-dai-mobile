'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {vector}=require('./fixtures/session-bound-receipt-vectors.cjs');
const base=Object.freeze({bearer:'synthetic_'+ 'a'.repeat(40),workspace:'synthetic_group_a',
 nonce:'c'.repeat(32),expires:1793789000,keys:['draft_'+ '1'.repeat(32),'draft_'+ '2'.repeat(32)]});
test('synthetic vector matches SQL envelope and hashes session hash text for identifier',()=>{
 const result=vector(base);
 const sessionHash=crypto.createHash('sha256').update(base.bearer).digest('hex');
 const sessionId=crypto.createHash('sha256').update(sessionHash,'utf8').digest('hex');
 const message=['kts-receipt-read-v1',sessionId,base.workspace,base.keys.join(','),base.nonce,String(base.expires)].join('|');
 assert.equal(result.session_id,sessionId);
 assert.equal(result.proof,crypto.createHmac('sha256',Buffer.from(sessionHash,'hex')).update(message).digest('hex'));
});
test('field changes alter proof; exact replay remains possible',()=>{
 const first=vector(base);assert.deepEqual(vector(base),first);
 for(const changed of [{workspace:'synthetic_group_b'},{nonce:'d'.repeat(32)},
   {expires:base.expires+1},{keys:['draft_'+ '3'.repeat(32)]},
   {bearer:'synthetic_'+ 'b'.repeat(40)}])
   assert.notEqual(vector({...base,...changed}).proof,first.proof);
});
test('reject non-synthetic bearer, duplicate or unordered keys and invalid envelope',()=>{
 for(const changed of [{bearer:'a'.repeat(43)},{workspace:'group_a'},
   {keys:[base.keys[0],base.keys[0]]},{keys:[...base.keys].reverse()},
   {keys:[]},{nonce:'nope'},{expires:0}])
   assert.throws(()=>vector({...base,...changed}),/SYNTHETIC_VECTOR_INVALID/);
});
