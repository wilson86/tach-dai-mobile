'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'../team-settlement/candidate/receipt-v2-key-store-review.sql'),'utf8');
const signer=fs.readFileSync(path.join(__dirname,'../team-settlement/candidate/receipt-v2-trusted-signer.cjs'),'utf8');
test('key store SQL is review-only and always rolls back, never provisions secrets',()=>{
  assert.match(sql,/NOT APPROVED/);
  assert.match(sql,/^BEGIN;/m);
  assert.match(sql,/^ROLLBACK;/m);
  assert.doesNotMatch(sql,/^COMMIT;/m);
  assert.doesNotMatch(sql,/^\s*(?:GRANT|INSERT|UPDATE|DELETE|CREATE ROLE|CREATE USER)\b/im);
  assert.match(sql,/REVOKE ALL ON TABLE kts_auth\.receipt_v2_verifier_keys FROM PUBLIC/);
});
test('key table is schema-compatible with candidate V2 key metadata',()=>{
  for(const field of ['key_id','secret_bytes','activated_at','stop_signing_at','stop_verify_at','revoked_at'])
    assert.match(sql,new RegExp('\\b'+field+'\\b'));
  assert.match(sql,/secret_bytes\)=32/);
  assert.match(sql,/key_id ~ '\^\[a-f0-9\]\{16\}\$'/);
  assert.match(sql,/stop_signing_at > activated_at/);
  assert.match(sql,/stop_verify_at >= stop_signing_at/);
  assert.match(signer,/fetched\.stop_signing_at_ms/);
  assert.match(signer,/fetched\.stop_verify_at_ms/);
});
test('no schema overwrite or extension provisioning',()=>{
  assert.match(sql,/to_regclass\('kts_auth\.receipt_v2_verifier_keys'\) IS NOT NULL/);
  assert.match(sql,/CREATE TABLE kts_auth\.receipt_v2_verifier_keys/);
  assert.doesNotMatch(sql,/CREATE TABLE IF NOT EXISTS/);
  assert.doesNotMatch(sql,/^\s*CREATE EXTENSION\b/im);
});
