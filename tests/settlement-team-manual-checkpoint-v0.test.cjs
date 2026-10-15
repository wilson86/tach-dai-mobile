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

test('original edit action and authoritative metadata are not silently discarded',async()=>{
 for(const added of [
  {action:'edit_draft'},{action:'approve_review'},
  {server_result:{event_id:'fake_forged_receipt'}},
  {server_revision:1},{auto_retry:true},
  {session_token:'fake_nonsecret_token'},
  {opaque_unverified_field:'fake'}
 ]){
  const h=setup();
  h.state.drafts[0]={...row(),...added};
  await assert.rejects(h.make().save({passphrase:PASS,explicitConsent:true}),
   /TEAM_RECOVERY_DRAFT_INVALID/);
  assert.equal(h.map.size,0);
  assert.equal(h.calls.includes('cas'),false);
 }
});
test('voluntary checkpoint accepts original pending transient error without pretending receipt',async()=>{
 const h=setup();
 h.state.drafts[0].error='SYNC_DRAFT_RECEIPT_UNCERTAIN';
 await h.make().save({passphrase:PASS,explicitConsent:true});
 const r=await h.make().inspect({passphrase:PASS,explicitConsent:true});
 assert.equal(r.status,'QUARANTINED');
 assert.equal(r.items[0].original_status,'PENDING');
 assert.equal(r.items[0].auto_retry,false);
 assert.equal('error' in r.items[0],false);
});
test('ambiguous storage success followed by session drift preserves ciphertext for review',async()=>{
 const h=setup();
 const alteredStore={
  ...h.store,
  async writeIfAbsent(k,v){
   const result=await h.store.writeIfAbsent(k,v);
   h.state.session_epoch++;
   return result;
  }
 };
 const v=createSyntheticManualCheckpoint({sync:h.sync,store:alteredStore,
  verifyActor:h.verifyActor,cryptoProvider:webcrypto,syntheticOnly:true});
 await assert.rejects(v.save({passphrase:PASS,explicitConsent:true}),
  /TEAM_MANUAL_CHECKPOINT_SESSION_CHANGED/);
 assert.equal(h.map.size,1);
 assert.equal([...h.map.values()][0].includes('fake sensitive backup content'),false);
 // A second save cannot overwrite ambiguous encrypted evidence.
 await assert.rejects(h.make().save({passphrase:PASS,explicitConsent:true}),
  /TEAM_MANUAL_CHECKPOINT_ALREADY_EXISTS/);
});

test('real sync-client pending queue -> explicit encrypted backup -> new client quarantine, no import',async()=>{
 const Sync=require('../app/settlement-team-sync-client.js');
 const forbidden=async()=>{throw Error('FORBIDDEN_FINANCIAL_NETWORK_WRITE');};
 const createClient=()=>{
  const c=Sync.createSyncClient({fetchImpl:forbidden});
  c.setSessionToken('a'.repeat(43),'group_a');
  return c;
 };
 const original=createClient(),fake=setup();
 const queued=original.queueDraft(row().scope,row().payload,0);
 const backup=createSyntheticManualCheckpoint({sync:original,
  store:fake.store,verifyActor:fake.verifyActor,
  cryptoProvider:webcrypto,syntheticOnly:true});
 const receipt=await backup.save({passphrase:PASS,explicitConsent:true});
 assert.equal(receipt.status,'ENCRYPTED_ADAPTER_ACK');
 original.clearSession({discardPending:true}); // explicit synthetic QA discard
 const restarted=createClient();
 const recovered=createSyntheticManualCheckpoint({sync:restarted,
  store:fake.store,verifyActor:fake.verifyActor,
  cryptoProvider:webcrypto,syntheticOnly:true});
 const result=await recovered.inspect({passphrase:PASS,explicitConsent:true});
 assert.equal(result.status,'QUARANTINED');
 assert.equal(result.items[0].id,queued.id);
 assert.equal(result.items[0].base_revision,queued.base_revision);
 assert.equal(result.items[0].auto_retry,false);
 assert.equal(result.durability,'UNVERIFIED');
 assert.deepEqual(restarted.snapshot().drafts,[]);
 assert.equal(fake.map.size,1);
});

test('explicit sync-client GET /v1/session returns only validated server actor',async()=>{
 const Sync=require('../app/settlement-team-sync-client.js');
 const calls=[];
 const client=Sync.createSyncClient({fetchImpl:async(url,options)=>{
  calls.push({url,method:options.method,authorization:options.headers.authorization});
  return {ok:true,status:200,async json(){return actor;}};
 }});
 client.setSessionToken('a'.repeat(43),'group_a');
 assert.equal(calls.length,0); // no hidden polling or automatic verifier
 const result=await client.verifyActor();
 assert.deepEqual(result,actor);
 assert.deepEqual(calls,[{url:'/v1/session',method:'GET',
  authorization:'Bearer '+'a'.repeat(43)}]);
 assert.equal(Object.hasOwn(client.snapshot(),'session_token'),false);
});
test('server actor proof rejects inactive identity, foreign workspace and non-operator',async()=>{
 const Sync=require('../app/settlement-team-sync-client.js');
 for(const invalid of [
  {...actor,server_verified:false},
  {...actor,membership_active:false},
  {...actor,user_id:'invalid user'},
  {...actor,workspace_id:'group_b'},
  {...actor,role:'reviewer'}
 ]){
  const c=Sync.createSyncClient({fetchImpl:async()=>({
   ok:true,status:200,async json(){return invalid;}
  })});
  c.setSessionToken('a'.repeat(43),'group_a');
  await assert.rejects(c.verifyActor(),/SYNC_ACTOR_UNVERIFIED/);
 }
});
test('session rotation during delayed GET cannot authorize old account checkpoint',async()=>{
 const Sync=require('../app/settlement-team-sync-client.js');
 let unblock;
 const gate=new Promise(resolve=>{unblock=resolve;});
 const c=Sync.createSyncClient({fetchImpl:async()=>{
  await gate;
  return {ok:true,status:200,async json(){return actor;}};
 }});
 c.setSessionToken('a'.repeat(43),'group_a');
 const inFlight=c.verifyActor();
 c.clearSession({discardPending:true});
 unblock();
 await assert.rejects(inFlight,/SYNC_SESSION_CHANGED/);
});
