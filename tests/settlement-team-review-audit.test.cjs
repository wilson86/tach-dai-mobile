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

test('review audit preserves 64-bit SQL revision exactly for read-only evidence',()=>{
 const row=sample();row.scope_revision='9223372036854775807';
 const observed=Audit.auditRows([row],'group_a')[0];
 assert.equal(observed.revision,'9223372036854775807');
 assert.match(Audit.displayRow(observed),/revision 9223372036854775807/);
 row.scope_revision='9223372036854775808';
 assert.throws(()=>Audit.auditRows([row],'group_a'),/SYNC_REVIEW_AUDIT_UNVERIFIED/);
});

test('review audit rejects impossible business dates and accepts Gregorian leap day',()=>{
 for(const business_date of ['2026-02-29','2026-04-31','2026-00-15','0000-01-01'])
   assert.throws(()=>Audit.auditRows([{...sample(),business_date}],'group_a'),
     /SYNC_REVIEW_AUDIT_UNVERIFIED/);
 const observed=Audit.auditRows([{...sample(),business_date:'2028-02-29'}],'group_a');
 assert.equal(observed[0].business_date,'2028-02-29');
});

test('read-only review audit fails closed on normalized dates and out-of-range clock/zone',()=>{
 const invalid=[
   '2026-02-30T10:30:15.123Z','2026-04-31T10:30:15.123Z',
   '2026-10-14T24:30:15Z','2026-10-14T10:60:15Z',
   '2026-10-14T10:30:60Z','2026-10-14T10:30:15+24:00',
   '2026-10-14T10:30:15+07:60'
 ];
 for(const recorded_at of invalid)
   assert.throws(()=>Audit.auditRows([{...sample(),recorded_at}],'group_a'),
     /SYNC_REVIEW_AUDIT_UNVERIFIED/,recorded_at);
 const valid=[
   '2028-02-29T23:59:59.123456Z',
   '2028-02-29T23:59:59.123+07:00'
 ];
 for(const recorded_at of valid)
   assert.equal(Audit.auditRows([{...sample(),recorded_at}],'group_a')[0].recorded_at,recorded_at);
});

test('review audit label names distinct reviewer and exact tenant feed sequence',()=>{
 const approved={...sample(),event_id:'event_approved',event_kind:'REVIEWED',
   actor_user_id:'fake_checker',feed_seq:'9223372036854775807',
   result_snapshot:{synthetic_review_only:true,from_state:'PENDING_REVIEW',
      to_state:'REVIEWED',actor_user_id:'fake_checker',submitted_by:'operator_1'}};
 const display=Audit.displayRow(Audit.auditRows([approved],'group_a')[0]);
 assert.match(display,/reviewer fake_checker/);
 assert.match(display,/submitter operator_1/);
 assert.match(display,/feed_seq 9223372036854775807/);
});
