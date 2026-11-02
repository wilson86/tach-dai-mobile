'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {createReviewProof}=require('../team-settlement/candidate/atomic-review-proof.cjs');
const request={workspace_id:'fake_group',partner_id:'fake_partner',business_date:'2026-10-26',region:'mn',action:'approve_review',expected_revision:2,event_id:'event_a',idempotency_key:'draft_a',request_sha256:'a'.repeat(64)};
const opts={nonce:'b'.repeat(32),expires:1800000000};
test('proof binds review request without returning token or session verifier',()=>{
  const token='T'.repeat(43), result=createReviewProof(token,request,opts);
  const verifier=crypto.createHash('sha256').update(token).digest('hex');
  assert.equal(result.session_id,crypto.createHash('sha256').update(verifier).digest('hex'));
  // Cross-checked independently with Python hashlib/hmac, not with PostgreSQL.
  assert.equal(result.session_id,'e0664df9ebd2fa97a46ad581a91e133ceb2a710213bf17784ebccc31487697a1');
  assert.equal(result.proof,'177369a991d625596252a50c3fff564711e621a7ef64b43a1639f69c6b1c6c56');
  assert.match(result.proof,/^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(result),new RegExp(`${token}|${verifier}`));
  for(const [key,value] of Object.entries({workspace_id:'other_group',partner_id:'other_partner',business_date:'2026-10-27',region:'mt',action:'submit_review',expected_revision:3,event_id:'event_b',idempotency_key:'draft_b',request_sha256:'c'.repeat(64)}))
    assert.notEqual(createReviewProof(token,{...request,[key]:value},opts).proof,result.proof,key);
  assert.notEqual(createReviewProof(token,request,{...opts,nonce:'c'.repeat(32)}).proof,result.proof);
  assert.notEqual(createReviewProof(token,request,{...opts,expires:opts.expires+1}).proof,result.proof);
});
test('proof rejects unsafe or ambiguous inputs',()=>{
  for(const bad of [{workspace_id:'fake|other'},{business_date:'2026-02-30'},{expected_revision:Number.MAX_SAFE_INTEGER},{request_sha256:'x'.repeat(64)},{action:'close'}])
    assert.throws(()=>createReviewProof('T'.repeat(43),{...request,...bad},opts),/TEAM_ATOMIC_PROOF_INPUT_INVALID/);
  assert.throws(()=>createReviewProof('bad',request,opts),/TEAM_ATOMIC_PROOF_INPUT_INVALID/);
});
test('lookup proof has a separate domain and cannot authorize mutation',()=>{
  const lookupRequest={...request,event_id:'lookup'};
  const write=createReviewProof('T'.repeat(43),lookupRequest,opts);
  const read=createReviewProof('T'.repeat(43),lookupRequest,{...opts,purpose:'lookup'});
  assert.notEqual(write.proof,read.proof);
  assert.throws(()=>createReviewProof('T'.repeat(43),request,{...opts,purpose:'lookup'}),/TEAM_ATOMIC_PROOF_INPUT_INVALID/);
});
test('candidate SQL retains default-off, lock and proof source safeguards',()=>{
  // Static source assertions only: this does not parse or execute PostgreSQL.
  const sql=fs.readFileSync(path.join(__dirname,'../team-settlement/candidate/atomic-review-v1.sql'),'utf8').replace(/\r\n/g,'\n');
  for(const tag of ['check','fn','lookup'])assert.ok(sql.includes(`END;\n$${tag}$;`),`unterminated ${tag} body`);
  assert.match(sql,/SECURITY DEFINER\s+SET search_path=pg_catalog/i);
  assert.match(sql,/FROM kts_auth\.sessions[\s\S]+?FOR SHARE;/i);
  assert.match(sql,/FOR SHARE OF m,i/i);
  assert.match(sql,/kts_crypto\.hmac\(/i);
  assert.match(sql,/pg_catalog\.pg_extension[\s\S]+e\.extname='pgcrypto'/i);
  assert.match(sql,/pg_catalog\.pg_depend[\s\S]+d\.deptype='e'/i);
  assert.match(sql,/p\.proowner=e\.extowner AND owner_role\.rolsuper/i);
  assert.match(sql,/pg_catalog\.aclexplode[\s\S]+acl\.grantee=0 AND acl\.privilege_type='CREATE'/i);
  const reviewSql=sql.slice(0,sql.indexOf('CREATE FUNCTION kts_team.atomic_draft_v1'));
  assert.equal((reviewSql.match(/'hex'\) IS DISTINCT FROM p_proof/g)||[]).length,2);
  assert.match(sql,/replayed'\)='false'[\s\S]+?event_id' IS DISTINCT FROM p_event_id/i);
  assert.match(sql,/PRIMARY KEY \(session_id,nonce\)/i);
  assert.match(sql,/REVOKE ALL ON FUNCTION[\s\S]+?FROM PUBLIC/i);
  assert.doesNotMatch(sql,/\bGRANT\s/i);
  assert.ok(sql.indexOf('atomic_review_nonces(session_id,nonce) VALUES')<sql.indexOf('v_result:=kts_team.advance_review('));
  assert.match(sql,/JOIN kts_team\.scope_events e[\s\S]+e\.payload_sha256=p_request_sha256/i);
  assert.match(sql,/e\.actor_user_id=v_user[\s\S]+TEAM_ATOMIC_RECEIPT_MISMATCH/i);
  const lookup=sql.slice(sql.indexOf('CREATE FUNCTION kts_team.atomic_review_reconcile_v1'));
  assert.match(lookup,/kts-review-lookup-v1/);
  assert.match(lookup,/JOIN kts_team\.scope_events e[\s\S]+e\.actor_user_id=v_user/i);
  assert.match(lookup,/'classification','UNKNOWN'/);
  assert.match(lookup,/COALESCE\(v_role,''\) NOT IN/);
  assert.doesNotMatch(lookup,/kts_team\.advance_review\(/i);
});

test('static owner/RLS guard detects removal of either protection',()=>{
  // Positive and negative source-only tests. No PostgreSQL policy evaluation.
  const sql=fs.readFileSync(path.join(__dirname,'../team-settlement/candidate/atomic-review-v1.sql'),'utf8');
  function verify(source){
    assert.match(source,/r\.oid=am\.member OR r\.oid=am\.roleid/);
    assert.match(source,/NOT rolreplication/);
    assert.match(source,/c\.relrowsecurity AND c\.relforcerowsecurity\)<>6/);
    for(const name of ['workspaces','memberships','counterparties','scopes','scope_events','idempotency_receipts'])
      assert.ok(source.slice(0,source.indexOf('$check$;')).includes(`'${name}'`));
  }
  verify(sql);
  assert.throws(()=>verify(sql.replace(' OR r.oid=am.roleid','')));
  assert.throws(()=>verify(sql.replace(' AND c.relforcerowsecurity','')));
  assert.throws(()=>verify(sql.replace(' AND NOT rolreplication','')));
});

test('legacy dependency identity guard is present before candidate creation',()=>{
  // Source-only regression. This does NOT evaluate catalog data or compile SQL.
  const sql=fs.readFileSync(path.join(__dirname,'../team-settlement/candidate/atomic-review-v1.sql'),'utf8');
  function verify(source){
    const guard=source.slice(0,source.indexOf('CREATE TABLE'));
    assert.match(guard,/p\.prokind='f' AND NOT p\.prosecdef AND l\.lanname='plpgsql'/);
    assert.match(guard,/p\.prorettype='pg_catalog\.jsonb'::pg_catalog\.regtype/);
    assert.match(guard,/p\.proconfig=ARRAY\['search_path=pg_catalog, kts_team'\]::text\[\]\)<>2/);
    for(const signature of [
      'kts_team.append_draft(text,text,date,text,bigint,text,text,text,jsonb)',
      'kts_team.advance_review(text,text,date,text,text,bigint,text,text,text)'])
      assert.ok(guard.includes(`to_regprocedure('${signature}')`));
    assert.match(guard,/RAISE EXCEPTION 'TEAM_ATOMIC_LEGACY_DEPENDENCY_UNQUALIFIED'/);
  }
  verify(sql);
  for(const text of [' AND NOT p.prosecdef'," AND l.lanname='plpgsql'",
    "p.proconfig=ARRAY['search_path=pg_catalog, kts_team']::text[]",
    'kts_team.append_draft(text,text,date,text,bigint,text,text,text,jsonb)',
    'kts_team.advance_review(text,text,date,text,text,bigint,text,text,text)'])
    assert.throws(()=>verify(sql.replace(text,'')),text);
});
