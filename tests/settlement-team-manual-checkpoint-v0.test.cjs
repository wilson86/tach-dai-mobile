'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
const {createSyntheticManualCheckpoint}=require('../app/settlement-team-manual-checkpoint-v0.js');
const PASS='separate-strong-manual-recovery-secret';
const actor={server_verified:true,membership_active:true,
 user_id:'fake_operator_a',workspace_id:'group_a',role:'operator'};
const row=()=>({id:'draft_'+'a'.repeat(32),status:'PENDING',base_revision:0,
 scope:{workspace_id:'group_a',partner_id:'fake_partner_1',
  business_date:'2026-10-15',region:'mn'},
 payload:{synthetic:true,memo:'fake sensitive backup content'}});
function setup({who=()=>actor}={}){
 const state={authenticated:true,workspace_id:'group_a',session_epoch:1,
  drafts:[row()]};
 const map=new Map(),calls=[];
 const sync={snapshot(){calls.push('snapshot');return structuredClone(state);},
  async syncDraft(){throw Error('FORBIDDEN_SEND');},
  queueDraft(){throw Error('FORBIDDEN_IMPORT');}};
 const store={async read(k){calls.push('read');return map.get(k)??null;},
  async writeIfAbsent(k,v){calls.push('cas');
   if(map.has(k))return false;map.set(k,v);return true;}};
 let checked=0;
 const verifyActor=async()=>{calls.push('verify');checked++;return who(checked);};
 const make=()=>createSyntheticManualCheckpoint({sync,store,verifyActor,
  syntheticOnly:true,cryptoProvider:webcrypto});
 return {state,map,calls,make,sync,store,verifyActor};
}
test('default-off and explicit consent precede any actor, snapshot, storage or crypto',async()=>{
 const h=setup();
 assert.throws(()=>createSyntheticManualCheckpoint({
  sync:h.sync,store:h.store,verifyActor:h.verifyActor,cryptoProvider:webcrypto
 }),/TEAM_MANUAL_CHECKPOINT_DISABLED/);
 await assert.rejects(h.make().save({passphrase:PASS}),
  /TEAM_MANUAL_CHECKPOINT_CONSENT_REQUIRED/);
 await assert.rejects(h.make().inspect({passphrase:PASS}),
  /TEAM_MANUAL_CHECKPOINT_CONSENT_REQUIRED/);
 assert.deepEqual(h.calls,[]);
});
test('fake pending snapshot seals unchanged ID and manually reopens after new client instance',async()=>{
 const h=setup();
 const receipt=await h.make().save({passphrase:PASS,explicitConsent:true});
 assert.equal(receipt.status,'ENCRYPTED_ADAPTER_ACK');
 assert.equal(receipt.durability,'UNVERIFIED');
 assert.equal(receipt.auto_send_enabled,false);
 assert.equal(receipt.draft_count,1);
 const raw=[...h.map.values()][0];
 assert.equal(typeof raw,'string');
 for(const x of ['fake sensitive backup content','fake_partner_1',PASS])
  assert.equal(raw.includes(x),false);
 const restored=await h.make().inspect({passphrase:PASS,explicitConsent:true});
 assert.equal(restored.status,'QUARANTINED');
 assert.equal(restored.auto_send_enabled,false);
 assert.equal(restored.durability,'UNVERIFIED');
 assert.equal(restored.requires_manual_review,true);
 assert.equal(restored.items[0].id,row().id);
 assert.equal(restored.items[0].original_status,'PENDING');
 assert.equal(restored.items[0].auto_retry,false);
 assert.equal(h.state.drafts.length,1);
 assert.equal(h.state.drafts[0].status,'PENDING');
 assert.equal(h.calls.filter(x=>x==='cas').length,1);
});
test('existing sealed evidence cannot be overwritten even when queued drafts change',async()=>{
 const h=setup();
 await h.make().save({passphrase:PASS,explicitConsent:true});
 const raw=[...h.map.values()][0];
 h.state.drafts=[{...row(),id:'draft_'+'b'.repeat(32)}];
 await assert.rejects(h.make().save({passphrase:PASS,explicitConsent:true}),
  /TEAM_MANUAL_CHECKPOINT_ALREADY_EXISTS/);
 assert.equal([...h.map.values()][0],raw);
});
test('wrong actor, tenant or secret refuses decryption while leaving backup unchanged',async()=>{
 const h=setup();
 await h.make().save({passphrase:PASS,explicitConsent:true});
 const raw=[...h.map.values()][0];
 await assert.rejects(h.make().inspect({
  passphrase:'wrong-but-length-valid-secret',explicitConsent:true
 }),/TEAM_RECOVERY_AUTH_FAILED/);
 for(const x of ['fake_intruder','fake_operator_b']){
  const v=createSyntheticManualCheckpoint({
   sync:h.sync,store:h.store,cryptoProvider:webcrypto,
   syntheticOnly:true,verifyActor:async()=>({...actor,user_id:x})});
  await assert.rejects(v.inspect({passphrase:PASS,explicitConsent:true}),
   /TEAM_RECOVERY_AUTH_FAILED/);
 }
 h.state.workspace_id='group_b';
 await assert.rejects(h.make().inspect({passphrase:PASS,explicitConsent:true}),
  /TEAM_MANUAL_CHECKPOINT_SESSION_CHANGED/);
 assert.equal([...h.map.values()][0],raw);
});
test('a rotated session during PBKDF2 prevents a stale positive save',async()=>{
 const h=setup();
 let checked=0;
 const v=createSyntheticManualCheckpoint({sync:h.sync,store:h.store,
  cryptoProvider:webcrypto,syntheticOnly:true,
  verifyActor:async()=>{checked++;
   if(checked===2)h.state.session_epoch++;
   return actor;}});
 await assert.rejects(v.save({passphrase:PASS,explicitConsent:true}),
  /TEAM_MANUAL_CHECKPOINT_SESSION_CHANGED/);
 assert.equal(h.map.size,0);
});
test('changing original pending drafts before ciphertext write refuses checkpoint',async()=>{
 const h=setup();
 const v=createSyntheticManualCheckpoint({sync:h.sync,
  syntheticOnly:true,cryptoProvider:webcrypto,
  verifyActor:h.verifyActor,store:{
   ...h.store,
   async read(k){h.state.drafts[0].payload.memo='fake changed during read';
    return h.store.read(k);}
  }});
 await assert.rejects(v.save({passphrase:PASS,explicitConsent:true}),
  /TEAM_MANUAL_CHECKPOINT_DRAFTS_CHANGED/);
 assert.equal(h.map.size,0);
});
test('revoked membership after a slow restore refuses all plaintext reports',async()=>{
 const h=setup();
 await h.make().save({passphrase:PASS,explicitConsent:true});
 let checked=0;
 const v=createSyntheticManualCheckpoint({sync:h.sync,store:h.store,
  syntheticOnly:true,cryptoProvider:webcrypto,
  verifyActor:async()=>{checked++;return checked===1?actor:
   {...actor,membership_active:false};}});
 await assert.rejects(v.inspect({passphrase:PASS,explicitConsent:true}),
  /TEAM_MANUAL_CHECKPOINT_ACTOR_UNVERIFIED/);
});
test('no pending intents, malformed recovered ciphertext and no-backup are non-authorizing',async()=>{
 const h=setup();
 h.state.drafts=[];
 await assert.rejects(h.make().save({passphrase:PASS,explicitConsent:true}),
  /TEAM_MANUAL_CHECKPOINT_SOURCE_INVALID/);
 const r=await h.make().inspect({passphrase:PASS,explicitConsent:true});
 assert.equal(r.status,'NO_ENCRYPTED_BACKUP');
 assert.equal(r.auto_send_enabled,false);
 h.map.set('synthetic-team-recovery-v0','{not-an-envelope}');
 await assert.rejects(h.make().inspect({passphrase:PASS,explicitConsent:true}),
  /TEAM_RECOVERY_FORMAT_INVALID/);
});
test('no import or auto-send wiring into live pilot HTML, sync client or start script',()=>{
 const root=path.join(__dirname,'..');
 for(const file of ['app/settlement-team-pilot.html',
  'app/settlement-team-pilot-start.js','app/settlement-team-pilot-ui.js',
  'app/settlement-team-sync-client.js']){
  assert.doesNotMatch(fs.readFileSync(path.join(root,file),'utf8'),
   /settlement-team-manual-checkpoint-v0|KtsTeamSyntheticManualCheckpointV0/);
 }
});
