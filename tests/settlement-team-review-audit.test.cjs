'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Audit=require('../app/settlement-team-review-audit.js');
const sample=()=>({
 workspace_id:'group_a',event_id:'event_review_1',partner_id:'fake_partner_1',
 business_date:'2026-10-14',region:'mn',scope_revision:2,feed_seq:'2',
 actor_user_id:'operator_1',event_kind:'SUBMITTED',
 recorded_at:'2026-10-14T10:30:15.123Z',
 result_snapshot:{synthetic_review_only:true,from_state:'DRAFT',
   to_state:'PENDING_REVIEW',actor_user_id:'operator_1',submitted_by:'operator_1'}
});
test('read-only audit renders verified submitter/reviewer without trusting arbitrary raw JSON',()=>{
 const submit=sample();
 const review={...sample(),event_kind:'REVIEWED',event_id:'event_review_2',
   actor_user_id:'reviewer_2',scope_revision:3,feed_seq:'3',
   result_snapshot:{synthetic_review_only:true,from_state:'PENDING_REVIEW',
     to_state:'REVIEWED',actor_user_id:'reviewer_2',submitted_by:'operator_1'}};
 const rows=Audit.auditRows([submit,review],'group_a');
 assert.equal(rows.length,2);
 assert.equal(rows[1].actor,'reviewer_2');
 assert.equal(rows[1].submitted_by,'operator_1');
 assert.match(Audit.displayRow(rows[1]),/REVIEWED.*reviewer_2/);
 assert.equal(rows[1].result_snapshot,undefined);
});
test('cross-tenant, forged author, self-approval and malformed time fail closed',()=>{
 const cases=[
   {...sample(),workspace_id:'group_b'},
   {...sample(),actor_user_id:'forged'},
   {...sample(),partner_id:'actual_customer'},
   {...sample(),recorded_at:'not-a-date'},
   {...sample(),result_snapshot:{...sample().result_snapshot,submitted_by:'different'}},
   {...sample(),event_kind:'REVIEWED',result_snapshot:{
     synthetic_review_only:true,from_state:'PENDING_REVIEW',to_state:'REVIEWED',
     actor_user_id:'operator_1',submitted_by:'operator_1'}},
   {...sample(),feed_seq:0},{...sample(),scope_revision:'NaN'},
   {...sample(),result_snapshot:null}
 ];
 for(const item of cases)assert.throws(()=>Audit.auditRows([item],'group_a'),
   /SYNC_REVIEW_AUDIT_UNVERIFIED/);
});
test('draft/nonreview events are not presented as reviewer approval',()=>{
 const rows=Audit.auditRows([{event_kind:'DRAFT_CREATED'}],'group_a');
 assert.deepEqual(rows,[]);
});
