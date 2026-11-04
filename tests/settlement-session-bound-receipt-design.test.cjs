'use strict';
// Source-contract checks only: native PostgreSQL16 DDL and privileges NOT_RUN.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const candidate=read('team-settlement/candidate/session-bound-receipt-read-v1.sql');
const composer=read('team-settlement/team-composition.cjs');
const legacyRepository=read('team-settlement/postgres-ledger-repository.cjs');
const migration=read('team-settlement/migrations/001_team_ledger.sql');
test('candidate is a non-deployed SECURITY DEFINER with no implicit PUBLIC/RUNTIME grant',()=>{
 assert.match(candidate,/CREATE FUNCTION kts_team\.candidate_receipt_read_v1\(/);
 assert.match(candidate,/SECURITY DEFINER\s+SET search_path=pg_catalog/);
 assert.match(candidate,/REVOKE ALL ON FUNCTION kts_team\.candidate_receipt_read_v1\(/);
 assert.match(candidate,/FROM PUBLIC;/);
 assert.match(candidate,/OWNER TO kts_receipt_read_owner;/);
 assert.match(candidate,/NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls/);
 assert.match(candidate,/pg_catalog\.pg_auth_members m/);
 assert.match(candidate,/r\.rolname='kts_receipt_read_owner'/);
 assert.doesNotMatch(candidate,/\bGRANT\s+(?:SELECT|EXECUTE|ALL)\s+/i);
 assert.doesNotMatch(candidate,/\bDROP\s+(?:TABLE|ROLE|FUNCTION)\s+/i);
});
test('signature and scope are derived from ACTIVE authenticated DB session, NOT arbitrary GUC',()=>{
 assert.match(candidate,/p_session_id[^]*p_workspace_id[^]*p_nonce[^]*p_expires[^]*p_keys[^]*p_proof/);
 assert.match(candidate,/s\.revoked_at IS NULL AND s\.expires_at > pg_catalog\.clock_timestamp\(\)/);
 assert.match(candidate,/IF v_workspace IS DISTINCT FROM p_workspace_id/);
 assert.match(candidate,/kts-receipt-read-v1/);
 assert.match(candidate,/kts_crypto\.hmac\(/);
 assert.match(candidate,/pg_catalog\.decode\(v_secret,'hex'\)/);
 assert.match(candidate,/session hash is derivable from the bearer/);
 assert.match(candidate,/set_config\('kts\.workspace_id',v_workspace,true\)/);
 assert.match(candidate,/m\.revoked_at IS NULL AND i\.disabled_at IS NULL/);
 assert.match(candidate,/v_role NOT IN \('admin','operator'\)/);
 assert.match(candidate,/e\.actor_user_id=v_user/);
 assert.match(candidate,/r\.workspace_id=v_workspace/);
});
test('a bearer holder can derive the proposed HMAC key; backend origin is not proven',()=>{
 const bearer='synthetic_bearer_'+ 'a'.repeat(40);
 const sessionHash=crypto.createHash('sha256').update(bearer).digest();
 const independentlyDerived=crypto.createHash('sha256').update(bearer).digest('hex');
 const message='kts-receipt-read-v1|synthetic|group_a|draft_key|nonce|123';
 assert.equal(crypto.createHmac('sha256',sessionHash).update(message).digest('hex'),
   crypto.createHmac('sha256',Buffer.from(independentlyDerived,'hex')).update(message).digest('hex'));
});
test('synthetic HMAC vectors bind tenant, keys, nonce and expiry but allow exact replay',()=>{
 const key=crypto.createHash('sha256').update('synthetic_bearer_'+ 'a'.repeat(40)).digest();
 const fields=['kts-receipt-read-v1','a'.repeat(64),'group_a','draft_'+ 'b'.repeat(32),'c'.repeat(32),'1793789000'];
 const sign=parts=>crypto.createHmac('sha256',key).update(parts.join('|')).digest('hex');
 const original=sign(fields);
 assert.equal(sign([...fields]),original,'exact replay is intentionally not prevented');
 for(const index of [1,2,3,4,5]){
   const changed=[...fields];changed[index]+='x';
   assert.notEqual(sign(changed),original,`field ${index} must be bound`);
 }
});
test('read request is bounded and deterministic; no mutation, locks or SQL injection interpolations',()=>{
 assert.match(candidate,/pg_catalog\.cardinality\(p_keys\) NOT BETWEEN 1 AND 30/);
 assert.match(candidate,/ARRAY\(SELECT DISTINCT t\.k[^]*ORDER BY t\.k\) IS DISTINCT FROM p_keys/);
 assert.match(candidate,/r\.idempotency_key=ANY\(p_keys\)/);
 assert.match(candidate,/RETURN QUERY/);
 assert.doesNotMatch(candidate,/\b(?:INSERT\s+INTO|UPDATE\s+kts_|DELETE\s+FROM|EXECUTE\s+FORMAT|EXECUTE\s+p_)/i);
 assert.doesNotMatch(candidate,/\bFOR\s+(?:SHARE|UPDATE)\s*;/i);
 assert.doesNotMatch(candidate,/RETURN QUERY[^]*password_hash|RETURN QUERY[^]*session_hash/i);
});
test('existing production write block and direct-read source stay unchanged by this review candidate',()=>{
 assert.match(composer,/TEAM_DB_ATOMIC_SESSION_BOUNDARY_UNAVAILABLE/);
 assert.match(composer,/appendDraft:denyUnqualifiedMutation/);
 assert.match(legacyRepository,/FROM kts_team\.idempotency_receipts r/);
 assert.match(migration,/FORCE ROW LEVEL SECURITY/);
 assert.match(migration,/current_setting\('kts\.workspace_id', true\)/);
 assert.doesNotMatch(legacyRepository,/candidate_receipt_read_v1/);
 assert.doesNotMatch(composer,/candidate_receipt_read_v1/);
});
