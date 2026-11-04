'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createLocalPilotRunner}=require('../team-settlement/local-pilot-runner.cjs');
function scenario(fault){
  const scope={workspace_id:'fake_group_a',partner_id:'fake_customer_a',business_date:'2026-10-20',region:'mn'};
  let revision=0, state='EMPTY'; const events=[];
  const operator={workspace_id:scope.workspace_id,role:'operator',user_id:'operator_a'};
  const reviewer={workspace_id:scope.workspace_id,role:'reviewer',user_id:fault==='same_actor'?'operator_a':'reviewer_b'};
  const append=(next)=>{const v={event_id:'event_'+(revision+1),revision:++revision,feed_seq:revision,state:next};events.push(v);state=next;return v;};
  const deps={
    login:async who=>who==='operator'?operator:reviewer,
    createDraft:async()=>{const v=append('DRAFT');if(fault==='bad_draft_revision')return {...v,revision:-1};return v;},
    review:async(actor,s,input)=>{
      if(input.action==='approve'&&actor.role==='operator')throw Error('SELF_REVIEW_DENIED');
      const v=append(input.action==='submit'?'PENDING_REVIEW':'REVIEWED');
      if(fault==='repeat_event_id'&&input.action==='approve')return {...v,event_id:'event_1'};
      return v;
    },
    getScope:async()=>({revision,state}),
    getChanges:async()=>{
      if(fault==='feed_gap')return {items:events.map((e,i)=>({...e,feed_seq:i*2+1}))};
      if(fault==='feed_foreign')return {items:[...events.slice(0,2),{...events[2],event_id:'unrelated_event_3'}]};
      return {items:events};
    },
    assertDenied:async(label,fn)=>{await assert.rejects(fn,/SELF_REVIEW_DENIED/)},
    assertMembershipGuard:async()=>{},assertAdminRoutesDisabled:async()=>{}
  };
  return {scope,deps};
}
const keys={draftKey:'d'.repeat(16),submitKey:'s'.repeat(16),approveKey:'a'.repeat(16)};
async function exec(fault,override={}){
 const {scope,deps}=scenario(fault);
 return createLocalPilotRunner(deps).run({operator:'operator',reviewer:'reviewer',scope,...keys,...override});
}
test('valid synthetic pilot control completes',async()=>{assert.equal((await exec(null)).status,'PASS')});
test('same authenticated human must not approve own work after role change',async()=>{
 await assert.rejects(exec('same_actor'),/TEAM_PILOT_REVIEWER_INVALID/);
});
test('invalid negative receipt revision is rejected',async()=>{
 await assert.rejects(exec('bad_draft_revision'),/TEAM_PILOT_RECEIPT_INVALID/);
});
test('same event ID in draft and approval cannot be trusted',async()=>{
 await assert.rejects(exec('repeat_event_id'),/TEAM_PILOT_RECEIPT_INVALID/);
});
test('feed must include the actual workflow receipt events',async()=>{
 await assert.rejects(exec('feed_foreign'),/TEAM_PILOT_FEED_INVALID/);
});
test('idempotency keys cannot be reused for distinct workflow actions',async()=>{
 await assert.rejects(exec(null,{approveKey:'d'.repeat(16)}),/TEAM_PILOT_INPUT_INVALID/);
});
test('feed sequence gap or altered receipt sequence is denied',async()=>{
 await assert.rejects(exec('feed_gap'),/TEAM_PILOT_FEED_INVALID/);
});
test('invalid human identity shape is denied even when role matches',async()=>{
 const {scope,deps}=scenario(null);
 const previous=deps.login;
 deps.login=async who=>who==='reviewer'?{workspace_id:scope.workspace_id,role:'reviewer',user_id:123}:previous(who);
 await assert.rejects(createLocalPilotRunner(deps).run({operator:'operator',reviewer:'reviewer',scope,...keys}),/TEAM_PILOT_REVIEWER_INVALID/);
});
test('invalid operator identity is denied BEFORE synthetic draft creation',async()=>{
 const {scope,deps}=scenario(null);
 let draftWrites=0;
 const start=deps.login;deps.login=async who=>who==='operator'?{workspace_id:scope.workspace_id,role:'operator',user_id:null}:start(who);
 const write=deps.createDraft;deps.createDraft=async(...args)=>{draftWrites++;return write(...args)};
 await assert.rejects(createLocalPilotRunner(deps).run({operator:'operator',reviewer:'reviewer',scope,...keys}),/TEAM_PILOT_OPERATOR_INVALID/);
 assert.equal(draftWrites,0);
});
test('feed with forged cross-tenant workspace is rejected even when ID and sequence match',async()=>{
 const {scope,deps}=scenario(null);
 const original=deps.getChanges;
 deps.getChanges=async(...args)=>{
   const value=await original(...args);
   return {items:value.items.map((row,i)=>({...row,workspace_id:i===2?'fake_group_b':'fake_group_a'}))};
 };
 await assert.rejects(createLocalPilotRunner(deps).run({operator:'operator',reviewer:'reviewer',scope,...keys}),/TEAM_PILOT_FEED_INVALID/);
});
