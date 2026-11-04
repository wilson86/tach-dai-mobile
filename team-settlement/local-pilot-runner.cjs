'use strict';

// Workflow orchestration seam for the synthetic local pilot. Dependencies are
// supplied only by a local launcher/test process; no HTTP request can select
// them. Construction is fail-closed and opens no database, browser or socket.
function fail(code){throw Error(code);}
function requireFn(value,name){if(typeof value!=='function')fail('TEAM_PILOT_DEPENDENCY_INVALID:'+name);return value;}
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
function positiveSequence(value){return Number.isSafeInteger(value)&&value>0;}
function receipt(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||
     typeof value.event_id!=='string'||!ID.test(value.event_id)||
     !positiveSequence(value.revision)||!positiveSequence(value.feed_seq))
    fail('TEAM_PILOT_RECEIPT_INVALID');
  return value;
}
function verifyFeed(feed,receipts,workspaceId){
  const items=feed?.items;
  if(!Array.isArray(items)||items.length<receipts.length||items.length>20)
    fail('TEAM_PILOT_FEED_INVALID');
  const byId=new Map();let prev=0;
  for(const item of items){
    if(!item||typeof item!=='object'||Array.isArray(item)||
       typeof item.event_id!=='string'||!ID.test(item.event_id)||
       !positiveSequence(item.feed_seq)||item.feed_seq<=prev||
       (item.workspace_id!==undefined&&item.workspace_id!==workspaceId)||
       byId.has(item.event_id))fail('TEAM_PILOT_FEED_INVALID');
    byId.set(item.event_id,item);prev=item.feed_seq;
  }
  for(const item of receipts){
    const actual=byId.get(item.event_id);
    if(!actual||actual.feed_seq!==item.feed_seq||
       (actual.state!==undefined&&actual.state!==item.state))
      fail('TEAM_PILOT_FEED_INVALID');
  }
  return items.length;
}
function createLocalPilotRunner(deps={}){
  const login=requireFn(deps.login,'login');
  const createDraft=requireFn(deps.createDraft,'createDraft');
  const review=requireFn(deps.review,'review');
  const getScope=requireFn(deps.getScope,'getScope');
  const getChanges=requireFn(deps.getChanges,'getChanges');
  const assertDenied=requireFn(deps.assertDenied,'assertDenied');
  const assertMembershipGuard=requireFn(deps.assertMembershipGuard,'assertMembershipGuard');
  const assertAdminRoutesDisabled=requireFn(deps.assertAdminRoutesDisabled,'assertAdminRoutesDisabled');
  async function run({operator,reviewer,scope,draftKey,submitKey,approveKey}={}){
    if(!operator||!reviewer||!scope||![draftKey,submitKey,approveKey].every(x=>typeof x==='string'&&x.length>=16)||new Set([draftKey,submitKey,approveKey]).size!==3)fail('TEAM_PILOT_INPUT_INVALID');
    const op=await login(operator);if(!op||op.workspace_id!==scope.workspace_id||op.role!=='operator'||typeof op.user_id!=='string'||!ID.test(op.user_id))fail('TEAM_PILOT_OPERATOR_INVALID');
    const draft=receipt(await createDraft(op,scope,{idempotency_key:draftKey,expected_revision:0}));
    if(draft.state!=='DRAFT'||draft.revision!==1)fail('TEAM_PILOT_DRAFT_INVALID');
    const submitted=receipt(await review(op,scope,{action:'submit',expected_revision:draft.revision,idempotency_key:submitKey}));
    if(submitted.state!=='PENDING_REVIEW'||submitted.revision!==draft.revision+1||submitted.feed_seq<=draft.feed_seq||submitted.event_id===draft.event_id)fail('TEAM_PILOT_SUBMIT_INVALID');
    await assertDenied('SELF_REVIEW',()=>review(op,scope,{action:'approve',expected_revision:submitted.revision,idempotency_key:approveKey}));
    const rv=await login(reviewer);if(!rv||rv.workspace_id!==scope.workspace_id||rv.role!=='reviewer'||typeof rv.user_id!=='string'||typeof op.user_id!=='string'||!ID.test(rv.user_id)||!ID.test(op.user_id)||rv.user_id===op.user_id)fail('TEAM_PILOT_REVIEWER_INVALID');
    const approved=receipt(await review(rv,scope,{action:'approve',expected_revision:submitted.revision,idempotency_key:approveKey}));
    if(approved.state!=='REVIEWED'||approved.revision!==submitted.revision+1||approved.feed_seq<=submitted.feed_seq||approved.event_id===draft.event_id||approved.event_id===submitted.event_id)fail('TEAM_PILOT_RECEIPT_INVALID');
    const state=await getScope(rv,scope);if(!state||state.revision!==approved.revision||state.state!=='REVIEWED')fail('TEAM_PILOT_STATE_INVALID');
    const feed=await getChanges(rv,{cursor:null,limit:20});
    const verifiedFeedCount=verifyFeed(feed,[draft,submitted,approved],scope.workspace_id);
    await assertMembershipGuard();await assertAdminRoutesDisabled();
    return Object.freeze({status:'PASS',draft,submitted,approved,feed_count:verifiedFeedCount});
  }
  return Object.freeze({run});
}
module.exports=Object.freeze({createLocalPilotRunner});
