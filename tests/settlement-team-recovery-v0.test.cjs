'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const Recovery=require('../app/settlement-team-recovery-v0.js');
const actor={workspace_id:'group_a',user_id:'fake_user_a'};
const secret='separate-synthetic-recovery-secret-strong';
const draft=(id='a'.repeat(32))=>({
 id:'draft_'+id,status:'PENDING',
 scope:{workspace_id:'group_a',partner_id:'fake_partner_1',
   business_date:'2028-02-29',region:'mn'},
 base_revision:1,payload:{synthetic:true,device:'phone_a',note:'demo'}
});
const seal=rows=>Recovery.seal({drafts:rows,actor,passphrase:secret,cryptoProvider:webcrypto});
const open=(envelope,changes={})=>Recovery.open({envelope,actor,
 passphrase:secret,cryptoProvider:webcrypto,...changes});

test('opt-in crypto never writes browser storage or network and returns sealed ciphertext only',async()=>{
 const envelope=await seal([draft()]);
 assert.equal(envelope.kind,Recovery.KIND);
 assert.equal(envelope.iterations,310000);
 assert.equal(envelope.cipher,'AES-256-GCM');
 assert.equal(envelope.kdf,'PBKDF2-SHA256');
 assert.equal(Object.isFrozen(envelope),true);
 assert.equal(JSON.stringify(envelope).includes('fake_partner_1'),false);
 assert.equal(JSON.stringify(envelope).includes('demo'),false);
 assert.equal(JSON.stringify(envelope).includes(secret),false);
 const restored=await open(envelope);
 assert.equal(restored.status,'QUARANTINED');
 assert.equal(restored.auto_send_enabled,false);
 assert.equal(restored.needs_server_reauthentication,true);
 assert.equal(restored.needs_manual_receipt_reconciliation,true);
 assert.equal(restored.items[0].id,draft().id);
 assert.equal(restored.items[0].original_status,'PENDING');
 assert.equal(restored.items[0].status,'QUARANTINED');
 assert.equal(restored.items[0].auto_retry,false);
 assert.deepEqual(restored.items[0].payload,draft().payload);
 assert.equal(Object.isFrozen(restored.items),true);
});

test('same draft idempotency and payload survive round-trip without any live queue mutation',async()=>{
 const rows=[draft('a'.repeat(32)),{...draft('b'.repeat(32)),
   status:'BLOCKED',payload:{synthetic:true,original:'unchanged'}}];
 const restored=await open(await seal(rows));
 assert.deepEqual(restored.items.map(x=>x.id),rows.map(x=>x.id));
 assert.deepEqual(restored.items.map(x=>x.base_revision),[1,1]);
 assert.equal(restored.items[1].original_status,'BLOCKED');
 assert.equal(restored.items[1].payload.original,'unchanged');
 assert.equal(restored.items.every(x=>x.status==='QUARANTINED'&&!x.auto_retry),true);
});

test('incorrect secret, another workspace/user and modified ciphertext are cryptographic failures',async()=>{
 const envelope=await seal([draft()]);
 await assert.rejects(open(envelope,{passphrase:'different-strong-synthetic-password'}),
   /TEAM_RECOVERY_AUTH_FAILED/);
 await assert.rejects(open(envelope,{actor:{workspace_id:'group_b',user_id:actor.user_id}}),
   /TEAM_RECOVERY_AUTH_FAILED/);
 await assert.rejects(open(envelope,{actor:{workspace_id:actor.workspace_id,user_id:'fake_user_b'}}),
   /TEAM_RECOVERY_AUTH_FAILED/);
 const tampered={...envelope,ciphertext:envelope.ciphertext.replace(/^./,
   envelope.ciphertext[0]==='A'?'B':'A')};
 await assert.rejects(open(tampered),/TEAM_RECOVERY_AUTH_FAILED/);
});

test('unapproved statuses, non-synthetic tenant and duplicate keys cannot be sealed',async()=>{
 for(const rows of [
   [{...draft(),status:'SYNCED'}],[{...draft(),status:'REVIEWED'}],
   [{...draft(),scope:{...draft().scope,workspace_id:'group_b'}}],
   [{...draft(),scope:{...draft().scope,partner_id:'live_customer'}}],
   [{...draft(),payload:{synthetic:false}}],
   [{...draft(),server_result:{event_id:'claimed_saved'}}],
   [draft(),draft()],[]
 ])await assert.rejects(seal(rows),/TEAM_RECOVERY_DRAFT_INVALID/);
});

test('malformed envelope, unknown version/keys and weak credentials fail closed',async()=>{
 const env=await seal([draft()]);
 for(const envelope of [
   {...env,version:1},{...env,kind:'financial-authoritative'},
   {...env,iterations:1},{...env,extra:'test'},
   {...env,salt:'A'},{...env,iv:'!'},null
 ])await assert.rejects(open(envelope),/TEAM_RECOVERY_FORMAT_INVALID/);
 await assert.rejects(open(env,{passphrase:'short'}),/TEAM_RECOVERY_PASSPHRASE_INVALID/);
 await assert.rejects(Recovery.seal({drafts:[draft()],actor,passphrase:secret,
   cryptoProvider:{}}),/TEAM_RECOVERY_CRYPTO_REQUIRED/);
});

test('size, multiplicity, unsafe numbers and impossible dates are rejected',async()=>{
 await assert.rejects(seal(Array.from({length:31},(_,i)=>draft(i.toString(16).padStart(32,'0')))),
   /TEAM_RECOVERY_DRAFT_INVALID/);
 await assert.rejects(seal([{...draft(),base_revision:Number.MAX_SAFE_INTEGER}]),
   /TEAM_RECOVERY_DRAFT_INVALID/);
 await assert.rejects(seal([{...draft(),scope:{...draft().scope,business_date:'2026-02-29'}}]),
   /TEAM_RECOVERY_DRAFT_INVALID/);
 await assert.rejects(seal([{...draft(),payload:{synthetic:true,anything:'a'.repeat(50000)}}]),
   /TEAM_RECOVERY_DRAFT_INVALID|TEAM_RECOVERY_SIZE_LIMIT/);
});

test('recovery remains default-off in browser and its source is a CI path trigger',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const root=path.join(__dirname,'..');
 for(const file of [
   'app/settlement-team-pilot.html',
   'app/settlement-team-pilot-start.js',
   'app/settlement-team-pilot-ui.js',
   'app/settlement-team-sync-client.js'
 ]){
   const body=fs.readFileSync(path.join(root,file),'utf8');
   assert.doesNotMatch(body,/settlement-team-recovery-v0|KtsTeamSyntheticRecoveryV0/,file);
 }
 const workflow=fs.readFileSync(path.join(root,
   '.github/workflows/settlement-team-contract.yml'),'utf8');
 assert.match(workflow,/app\/settlement-team-recovery-v0\.js/);
 assert.match(workflow,/node --test tests\/settlement-team-\*\.test\.cjs/);
});

test('strict transport roundtrip preserves only canonical encrypted envelope after cold start',async()=>{
 const encrypted=await seal([draft()]);
 const serialized=Recovery.serializeEnvelope(encrypted);
 assert.equal(serialized,JSON.stringify(encrypted));
 assert.equal(serialized.includes('fake_partner_1'),false);
 assert.equal(serialized.includes('demo'),false);
 assert.equal(serialized.includes(secret),false);
 const payload=Recovery.parseEnvelope(serialized);
 assert.equal(Object.isFrozen(payload),true);
 assert.equal(Recovery.serializeEnvelope(payload),serialized);
 // Instantiate a second copy to model a new JS runtime without browser memory.
 const modulePath=require.resolve('../app/settlement-team-recovery-v0.js');
 delete require.cache[modulePath];
 const independent=require(modulePath);
 const recovered=await independent.open({envelope:independent.parseEnvelope(serialized),
   actor,passphrase:secret,cryptoProvider:webcrypto});
 assert.equal(recovered.status,'QUARANTINED');
 assert.equal(recovered.items[0].id,draft().id);
 assert.equal(recovered.auto_send_enabled,false);
 assert.equal(recovered.items[0].auto_retry,false);
 assert.equal(Object.isFrozen(recovered.items[0].scope),true);
 assert.equal(Object.isFrozen(recovered.items[0].payload),true);
 assert.equal(Object.isFrozen(recovered.items[0].payload.nested||{}),false);
 assert.throws(()=>{recovered.items[0].payload.device='changed';},TypeError);
 assert.equal(recovered.items[0].payload.device,'phone_a');
});

test('serialized recovery transport rejects injected, duplicate, reordered or oversized envelopes',async()=>{
 const valid=Recovery.serializeEnvelope(await seal([draft()]));
 const malformed=[
   valid+' ', ' '+valid,valid+'{}', valid.replace('"version":0','"version":1'),
   valid.replace('"version":0','"version":0,"version":0'),
   valid.replace('"kind":','"unexpected":null,"kind":'),
   'null','[]','{}',
   JSON.stringify({version:0,...JSON.parse(valid)}),
   'x'.repeat(120001)
 ];
 for(const entry of malformed)
   await assert.rejects(async()=>Recovery.parseEnvelope(entry),
     /TEAM_RECOVERY_FORMAT_INVALID/,entry.slice(0,45));
 const original=JSON.parse(valid);
 const accessor=Object.defineProperty({...original},'salt',{get(){throw Error('CALLED');}});
 await assert.rejects(async()=>Recovery.serializeEnvelope(accessor),
   /TEAM_RECOVERY_FORMAT_INVALID/);
});

test('quarantined nested payload data is immutable without external state mutation',async()=>{
 const nested={synthetic:true, details:{notes:['demo',{marker:'synthetic'}]}};
 const env=await seal([{...draft(),payload:nested}]);
 const out=await open(env);
 assert.equal(Object.isFrozen(out.items[0]),true);
 assert.equal(Object.isFrozen(out.items[0].scope),true);
 assert.equal(Object.isFrozen(out.items[0].payload.details),true);
 assert.equal(Object.isFrozen(out.items[0].payload.details.notes),true);
 assert.equal(Object.isFrozen(out.items[0].payload.details.notes[1]),true);
 assert.throws(()=>out.items[0].payload.details.notes.push('tamper'),TypeError);
 assert.throws(()=>{out.items[0].scope.region='mt';},TypeError);
 assert.deepEqual(out.items[0].payload,nested);
});
