'use strict';

// Workflow orchestration seam for the synthetic local pilot. Dependencies are
// supplied only by a local launcher/test process; no HTTP request can select
// them. Construction is fail-closed and opens no database, browser or socket.
function fail(code){throw Error(code);}
function requireFn(value,name){if(typeof value!=='function')fail('TEAM_PILOT_DEPENDENCY_INVALID:'+name);return value;}
function receipt(value){
  if(!value||typeof value!=='object'||typeof value.event_id!=='string'||
     !Number.isSafeInteger(value.revision)||!Number.isSafeInteger(value.feed_seq))
    fail('TEAM_PILOT_RECEIPT_INVALID');
  return value;
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
    if(!operator||!reviewer||!scope||![draftKey,submitKey,approveKey].every(x=>typeof x==='string'&&x.length>=16))fail('TEAM_PILOT_INPUT_INVALID');
    const op=await login(operator);if(!op||op.workspace_id!==scope.workspace_id||op.role!=='operator')fail('TEAM_PILOT_OPERATOR_INVALID');
    const draft=receipt(await createDraft(op,scope,{idempotency_key:draftKey,expected_revision:0}));
    if(draft.state!=='DRAFT')fail('TEAM_PILOT_DRAFT_INVALID');
    const submitted=receipt(await review(op,scope,{action:'submit',expected_revision:draft.revision,idempotency_key:submitKey}));
    if(submitted.state!=='PENDING_REVIEW')fail('TEAM_PILOT_SUBMIT_INVALID');
    await assertDenied('SELF_REVIEW',()=>review(op,scope,{action:'approve',expected_revision:submitted.revision,idempotency_key:approveKey}));
    const rv=await login(reviewer);if(!rv||rv.workspace_id!==scope.workspace_id||rv.role!=='reviewer')fail('TEAM_PILOT_REVIEWER_INVALID');
    const approved=receipt(await review(rv,scope,{action:'approve',expected_revision:submitted.revision,idempotency_key:approveKey}));
    if(approved.state!=='REVIEWED')fail('TEAM_PILOT_APPROVAL_INVALID');
    const state=await getScope(rv,scope);if(!state||state.revision!==approved.revision||state.state!=='REVIEWED')fail('TEAM_PILOT_STATE_INVALID');
    const feed=await getChanges(rv,{cursor:null,limit:20});
    if(!Array.isArray(feed?.items)||feed.items.length<3||feed.items.some((x,i,a)=>i&&x.feed_seq<=a[i-1].feed_seq))fail('TEAM_PILOT_FEED_INVALID');
    await assertMembershipGuard();await assertAdminRoutesDisabled();
    return Object.freeze({status:'PASS',draft,submitted,approved,feed_count:feed.items.length});
  }
  return Object.freeze({run});
}
module.exports=Object.freeze({createLocalPilotRunner});
