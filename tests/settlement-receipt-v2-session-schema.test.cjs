'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'../team-settlement/candidate/receipt-v2-session-handle.sql'),'utf8');
const auth=fs.readFileSync(path.join(__dirname,'../team-settlement/candidate/receipt-v2-auth-boundary.cjs'),'utf8');
test('V2 handle migration is isolated review-only and does not rewrite old sessions',()=>{
  assert.match(sql,/REVIEW-ONLY/);assert.match(sql,/BEGIN;/);assert.match(sql,/COMMIT;/);
  assert.match(sql,/ALTER TABLE kts_auth\.sessions ADD COLUMN session_handle text;/);
  assert.match(sql,/session_handle IS NULL OR session_handle ~ '\^\[a-f0-9\]\{32\}\$'/);
  assert.match(sql,/CREATE UNIQUE INDEX receipt_v2_session_handle_unique/);
  assert.match(sql,/WHERE session_handle IS NOT NULL/);
  assert.doesNotMatch(sql,/\bUPDATE\b\s+kts_auth\.sessions|\bGRANT\s+(?:SELECT|EXECUTE)|\bDELETE\s+FROM/i);
});
test('candidate Auth boundary requires a random independent handle, never SHA256 bearer as handle',()=>{
  assert.match(auth,/session_handle/);
  assert.match(auth,/const HANDLE = \/\^\[a-f0-9\]\{32\}\$\//);
  assert.match(auth,/session_hash=\$1/);
  assert.match(auth,/FOR SHARE/);
  assert.doesNotMatch(auth,/session_handle\s*=\s*hash|session_handle\s*=\s*token/);
});
