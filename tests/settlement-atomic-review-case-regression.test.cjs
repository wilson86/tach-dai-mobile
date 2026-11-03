'use strict';
// PostgreSQL 16 previously rejected the review function body at $fn$.
// Static checks constrain the fix; real PG16 DDL remains NOT_RUN here.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'..','team-settlement','candidate','atomic-review-v1.sql'),'utf8');
const first=sql.split('AS $fn$')[1]?.split('$fn$;')[0];
test('atomic review maps two allowed actions without CASE within receipt IF',()=>{
  assert.ok(first);
  assert.match(first,/v_expected_state text; v_expected_event_kind text;/);
  assert.match(first,/IF p_action='submit_review' THEN\s+v_expected_state:='PENDING_REVIEW';\s+v_expected_event_kind:='SUBMITTED';\s+ELSE\s+v_expected_state:='REVIEWED';\s+v_expected_event_kind:='REVIEWED';\s+END IF;/);
  assert.doesNotMatch(first,/CASE\s+p_action\s+WHEN/);
  assert.match(first,/v_result->>'state' IS DISTINCT FROM v_expected_state/);
  assert.match(first,/AND e\.event_kind=v_expected_event_kind/);
});
test('receipt still binds actor, digest, event, revision, feed, and scope',()=>{
  assert.match(first,/r\.request_sha256=p_request_sha256 AND e\.payload_sha256=p_request_sha256/);
  assert.match(first,/e\.actor_user_id=v_user AND e\.partner_id=p_partner_id/);
  assert.match(first,/e\.business_date=p_business_date AND e\.region=p_region/);
  assert.match(first,/e\.scope_revision=p_expected_revision\+1/);
  assert.match(first,/e\.event_id=v_result->>'event_id'/);
  assert.match(first,/e\.feed_seq::text=v_result->>'feed_seq'/);
  assert.match(first,/RAISE EXCEPTION 'TEAM_ATOMIC_RECEIPT_MISMATCH'/);
});
test('no runtime grants; other three candidate functions remain defined',()=>{
  assert.doesNotMatch(sql,/GRANT EXECUTE/i);
  assert.match(sql,/REVOKE ALL ON FUNCTION kts_team\.atomic_review_v1/);
  assert.match(sql,/ALTER FUNCTION kts_team\.atomic_review_v1[\s\S]+OWNER TO kts_atomic_owner/);
  for(const marker of ['AS $lookup$','AS $draft$','AS $draft_lookup$'])assert.ok(sql.includes(marker));
});
