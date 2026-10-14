(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.KtsTeamReviewAudit=factory();
}(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// Read-only, synthetic-only formatting. Nothing here authorizes a mutation.
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const PARTNER=/^(?:fake|demo|synthetic)_[a-z0-9_-]{1,64}$/;
function validBusinessDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day >= 1 && day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month-1];
}
const TIME=/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/;
function validRecordedAt(value){
  if(typeof value!=='string')return false;
  const m=TIME.exec(value);
  if(!m||!validBusinessDate(m[1])||
     Number(m[2])>23||Number(m[3])>59||Number(m[4])>59||
     (m[7]&&(Number(m[8])>23||Number(m[9])>59)))return false;
  // Date.parse by itself may normalize impossible dates; the explicit
  // calendar and clock-field checks above prevent counterfeit audit times.
  return Number.isFinite(Date.parse(value));
}
const MAX=9223372036854775807n;
function positive(value){
  if(typeof value==='number')return Number.isSafeInteger(value)&&value>0;
  return typeof value==='string'&&/^[1-9][0-9]{0,18}$/.test(value)&&BigInt(value)<=MAX;
}
function auditRows(items,workspace){
  if(!Array.isArray(items)||typeof workspace!=='string'||!ID.test(workspace))
    throw Error('SYNC_REVIEW_AUDIT_UNVERIFIED');
  const out=[];let prev=0n;
  for(const x of items){
    // Draft events are part of the general feed but are not review approvals.
    if(!x||typeof x!=='object'||Array.isArray(x))
      throw Error('SYNC_REVIEW_AUDIT_UNVERIFIED');
    if(x.event_kind!=='SUBMITTED'&&x.event_kind!=='REVIEWED')continue;
    const s=x.result_snapshot;
    if(x.workspace_id!==workspace||!ID.test(x.event_id)||!PARTNER.test(x.partner_id)||
       !validBusinessDate(x.business_date)||!['mn','mt','mb'].includes(x.region)||
       !positive(x.feed_seq)||!positive(x.scope_revision)||
       !ID.test(x.actor_user_id)||
       !validRecordedAt(x.recorded_at)||
       !s||typeof s!=='object'||Array.isArray(s)||
       s.synthetic_review_only!==true||s.actor_user_id!==x.actor_user_id||
       !ID.test(s.submitted_by)){
      throw Error('SYNC_REVIEW_AUDIT_UNVERIFIED');
    }
    const expected=x.event_kind==='SUBMITTED'
      ?{from:'DRAFT',to:'PENDING_REVIEW'}
      :{from:'PENDING_REVIEW',to:'REVIEWED'};
    if(s.from_state!==expected.from||s.to_state!==expected.to||
       (x.event_kind==='SUBMITTED'&&s.submitted_by!==x.actor_user_id)||
       (x.event_kind==='REVIEWED'&&s.submitted_by===x.actor_user_id)||
       BigInt(x.feed_seq)<=prev)
      throw Error('SYNC_REVIEW_AUDIT_UNVERIFIED');
    prev=BigInt(x.feed_seq);
    out.push(Object.freeze({
      event_id:x.event_id,kind:x.event_kind,actor:x.actor_user_id,
      submitted_by:s.submitted_by,partner:x.partner_id,
      region:x.region,business_date:x.business_date,
      revision:String(x.scope_revision),feed_seq:String(x.feed_seq),
      recorded_at:x.recorded_at
    }));
  }
  return Object.freeze(out);
}
function displayRow(x){
  return x.kind+' • '+x.partner+' / '+x.business_date+' / '+x.region+
    ' • actor '+x.actor+' • submitter '+x.submitted_by+
    (x.kind==='REVIEWED'?' • reviewer '+x.actor:'')+
    ' • revision '+x.revision+' • feed_seq '+x.feed_seq+
    ' • '+x.recorded_at+' • '+x.event_id;
}
return Object.freeze({auditRows,displayRow});
}));