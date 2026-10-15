(function(root,factory){
 if(typeof module==='object'&&module.exports)
  module.exports=factory(require('./settlement-team-recovery-v0.js'));
 else root.KtsTeamSyntheticManualCheckpointV0=
  factory(root.KtsTeamSyntheticRecoveryV0);
}(typeof globalThis!=='undefined'?globalThis:this,function(Recovery){
'use strict';
// DEFAULT OFF — fake-data-only manual checkpoint adapter, not a PWA feature.
// No credentials stored, HTTP endpoint, automatic backup, active draft import,
// write retry, erase, timer, event listener or background persistence.
const SLOT='synthetic-team-recovery-v0';
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const ACCEPT=new Set(['PENDING','CONFLICT','BLOCKED']);
function deny(code){throw Error(code);}
function createSyntheticManualCheckpoint({
 sync,verifyActor,store,cryptoProvider,syntheticOnly=false
}={}){
 if(syntheticOnly!==true||!Recovery||
    typeof Recovery.seal!=='function'||typeof Recovery.open!=='function'||
    !sync||typeof sync.snapshot!=='function'||
    typeof verifyActor!=='function'||!store||
    typeof store.read!=='function'||typeof store.writeIfAbsent!=='function')
   deny('TEAM_MANUAL_CHECKPOINT_DISABLED');
 function snapshot(actor,epoch){
  const state=sync.snapshot();
  if(!state||state.authenticated!==true||
     state.workspace_id!==actor.workspace_id||
     !Number.isSafeInteger(state.session_epoch)||state.session_epoch<0||
     (epoch!==undefined&&state.session_epoch!==epoch))
   deny('TEAM_MANUAL_CHECKPOINT_SESSION_CHANGED');
  return state;
 }
 async function identity(){
  // Only a separately authenticated server-side actor verifier may supply
  // these markers. The browser's workspace form is NOT an identity.
  const actor=await verifyActor();
  if(!actor||typeof actor!=='object'||Array.isArray(actor)||
     actor.server_verified!==true||actor.membership_active!==true||
     !ID.test(actor.user_id||'')||!ID.test(actor.workspace_id||'')||
     !['operator','admin'].includes(actor.role))
   deny('TEAM_MANUAL_CHECKPOINT_ACTOR_UNVERIFIED');
  return Object.freeze({user_id:actor.user_id,workspace_id:actor.workspace_id,
   role:actor.role});
 }
 function sameActor(a,b){
  if(a.user_id!==b.user_id||a.workspace_id!==b.workspace_id||
     a.role!==b.role)deny('TEAM_MANUAL_CHECKPOINT_ACTOR_CHANGED');
 }
 function consent(flag){if(flag!==true)deny('TEAM_MANUAL_CHECKPOINT_CONSENT_REQUIRED');}
 function originals(state){
  if(!Array.isArray(state.drafts))deny('TEAM_MANUAL_CHECKPOINT_SOURCE_INVALID');
  const drafts=state.drafts.filter(x=>x&&ACCEPT.has(x.status));
  if(drafts.length<1||drafts.length>30)deny('TEAM_MANUAL_CHECKPOINT_SOURCE_INVALID');
  // Preserve the exact original idempotency key, scope, payload and revision.
  // All metadata and statuses are independently validated by Recovery.seal().
  return drafts.map(x=>({
   id:x.id,status:x.status,scope:x.scope,
   base_revision:x.base_revision,payload:x.payload
  }));
 }
 async function save({passphrase,explicitConsent=false}={}){
  consent(explicitConsent);
  const actor=await identity();
  const initial=snapshot(actor);
  const epoch=initial.session_epoch;
  const drafts=originals(initial);
  const signature=JSON.stringify(drafts);
  const existing=await store.read(SLOT);
  if(existing!==null)deny('TEAM_MANUAL_CHECKPOINT_ALREADY_EXISTS');
  const envelope=await Recovery.seal({actor,passphrase,drafts,cryptoProvider});
  const ciphertext=Recovery.serializeEnvelope(envelope);
  // Do not write a stale snapshot if account/drafts changed while PBKDF2 ran.
  if(JSON.stringify(originals(snapshot(actor,epoch)))!==signature)
   deny('TEAM_MANUAL_CHECKPOINT_DRAFTS_CHANGED');
  sameActor(actor,await identity());
  // identity() awaits a remote/mocked verifier. Recheck the exact local
  // generation AND original pending intents after that await, before write.
  if(JSON.stringify(originals(snapshot(actor,epoch)))!==signature)
   deny('TEAM_MANUAL_CHECKPOINT_DRAFTS_CHANGED');
  if(await store.writeIfAbsent(SLOT,ciphertext)!==true)
   deny('TEAM_MANUAL_CHECKPOINT_SAVE_UNVERIFIED');
  if(await store.read(SLOT)!==ciphertext)
   deny('TEAM_MANUAL_CHECKPOINT_SAVE_UNVERIFIED');
  if(JSON.stringify(originals(snapshot(actor,epoch)))!==signature)
   deny('TEAM_MANUAL_CHECKPOINT_DRAFTS_CHANGED');
  sameActor(actor,await identity());
  return Object.freeze({status:'ENCRYPTED_ADAPTER_ACK',
   durability:'UNVERIFIED',draft_count:drafts.length,
   auto_send_enabled:false,requires_manual_review:true});
 }
 async function inspect({passphrase,explicitConsent=false}={}){
  consent(explicitConsent);
  const actor=await identity();
  const epoch=snapshot(actor).session_epoch;
  const ciphertext=await store.read(SLOT);
  if(ciphertext===null){
   sameActor(actor,await identity());
   snapshot(actor,epoch);
   return Object.freeze({status:'NO_ENCRYPTED_BACKUP',
    durability:'UNVERIFIED',auto_send_enabled:false,items:Object.freeze([])});
  }
  const envelope=Recovery.parseEnvelope(ciphertext);
  const recovered=await Recovery.open({envelope,actor,passphrase,cryptoProvider});
  sameActor(actor,await identity());
  snapshot(actor,epoch);
  // Quarantined items exist ONLY in this ephemeral explicit-call result,
  // never in the sync client's PENDING queue or any HTTP request.
  return Object.freeze({...recovered,status:'QUARANTINED',
   durability:'UNVERIFIED',needs_manual_receipt_reconciliation:true,
   auto_send_enabled:false,requires_manual_review:true});
 }
 return Object.freeze({save,inspect});
}
return Object.freeze({createSyntheticManualCheckpoint});
}));
