'use strict';
// Static source contract only: this MUST NOT be interpreted as SQL compiling,
// cryptographic JS/SQL parity, effective DB ACLs, or tenant-isolation PASS.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'../team-settlement/candidate/session-bound-receipt-read-v2.sql'),'utf8');
const js=fs.readFileSync(path.join(__dirname,'fixtures/receipt-backend-proof-v2.cjs'),'utf8');
test('new verifier explicitly remains unexecuted and disconnected from production',()=>{
  assert.match(sql,/REVIEW-ONLY, UNAPPROVED/);
  assert.match(sql,/DO NOT EXECUTE/);
  assert.match(sql,/BEGIN;[\s\S]*COMMIT;/);
  assert.match(sql,/SECURITY DEFINER/);
  assert.match(sql,/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC/);
  assert.doesNotMatch(sql,/\bGRANT\s+EXECUTE\b/i);
  assert.doesNotMatch(sql,/\bINSERT\s+INTO\b|\bUPDATE\s+kts_auth\b|\bDELETE\s+FROM\b/i);
  assert.doesNotMatch(sql,/\bCREATE\s+(?:EXTENSION|ROLE|USER)\b/i);
});
test('proof material is externally provisioned, never bearer-derived',()=>{
  assert.match(sql,/receipt_v2_verifier_keys/);
  assert.match(sql,/k\.secret_bytes/);
  assert.match(sql,/k\.revoked_at IS NULL/);
  assert.match(sql,/k\.activated_at <=/);
  assert.match(sql,/k\.stop_verify_at >/);
  assert.match(sql,/kts_crypto\.hmac\(/);
  assert.doesNotMatch(sql,/sha256\(\s*pg_catalog\.convert_to\(s\.session_hash/i);
  assert.doesNotMatch(sql,/\bGRANT\b[^\n]*receipt_v2_verifier_keys/);
});
test('canonical field order and UTF8-length framing reflect signer fixture',()=>{
  assert.match(js,/PURPOSE = 'kts-receipt-read-v2'/);
  assert.match(js,/Buffer\.byteLength\(x, 'utf8'\) \+ ':' \+ x/);
  assert.match(sql,/FOREACH v_piece IN ARRAY ARRAY\[[\s\S]*'kts-receipt-read-v2',p_key_id,p_session_handle,p_workspace_id,\s*p_user_id,v_keys_count::text/);
  assert.match(sql,/FOREACH v_piece IN ARRAY p_keys LOOP/);
  assert.match(sql,/FOREACH v_piece IN ARRAY ARRAY\[p_nonce,p_issued::text,p_expires::text\]/);
  assert.match(sql,/pg_catalog\.octet_length\(pg_catalog\.convert_to\(v_piece,'UTF8'\)\)/);
  assert.match(sql,/\|\| ':' \|\| v_piece/);
  assert.match(sql,/pg_catalog\.encode\(kts_crypto\.hmac\(/);
});
test('session, membership, actor and GUC come from DB; locks require write-capable transaction',()=>{
  assert.match(sql,/s\.session_handle=p_session_handle/);
  assert.match(sql,/s\.revoked_at IS NULL/);
  assert.match(sql,/s\.expires_at > pg_catalog\.clock_timestamp\(\)/);
  assert.match(sql,/FOR SHARE;/);
  assert.match(sql,/FOR SHARE OF m,i;/);
  assert.match(sql,/i\.disabled_at IS NULL/);
  assert.match(sql,/v_workspace IS DISTINCT FROM p_workspace_id/);
  assert.match(sql,/v_user IS DISTINCT FROM p_user_id/);
  assert.match(sql,/set_config\('kts\.workspace_id',v_workspace,true\)/);
  assert.match(sql,/READ WRITE transaction/);
});
test('read-only receipt result and expiry after delayed query remain guarded',()=>{
  assert.match(sql,/cardinality\(p_keys\) NOT BETWEEN 1 AND 30/);
  assert.match(sql,/p_expires - p_issued > 30/);
  assert.match(sql,/ARRAY\(\s*SELECT DISTINCT e\.k/);
  assert.match(sql,/RETURN QUERY/);
  assert.match(sql,/r\.idempotency_key=ANY\(p_keys\)/);
  const pos=sql.indexOf('  RETURN QUERY');
  assert.ok(pos>0);
  assert.match(sql.slice(pos),/IF p_expires <= pg_catalog\.floor\([\s\S]*TEAM_RECEIPT_V2_EXPIRED/);
});
