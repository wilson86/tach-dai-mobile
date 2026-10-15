'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const {createSyntheticRecoveryVault,SLOT}=require('../team-settlement/recovery-vault.cjs');
const actor={server_verified:true,membership_active:true,user_id:'fake_operator',
 workspace_id:'group_a',role:'operator'};
const token='a'.repeat(43),secret='distinct-synthetic-backup-passphrase';
const draft=()=>({id:'draft_'+'a'.repeat(32),status:'PENDING',
 scope:{workspace_id:'group_a',partner_id:'fake_partner_1',
   business_date:'2026-10-15',region:'mn'},
 base_revision:0,payload:{synthetic:true,note:'fake private device data'}});
function storage(){
 const data=new Map(),calls=[];
 return {data,calls,async read(key){calls.push(['read',key]);return data.has(key)?data.get(key):null;},
 async writeIfAbsent(key,value){
   calls.push(['cas',key]);
   if(data.has(key))return false;
   data.set(key,value);return true;
 }};
}
function create(store,{identity=()=>actor,verifyDelay}={}){
 const calls=[];
 const auth={async verifySession(t){calls.push(t);if(verifyDelay)await verifyDelay();return identity();}};
 return {vault:createSyntheticRecoveryVault({auth,store,syntheticOnly:true,
   cryptoProvider:webcrypto}),calls};
}

test('manual synthetic encrypted store survives a fresh instance; nothing auto-sends',async()=>{
 const store=storage(),first=create(store);
 const saved=await first.vault.save({sessionToken:token,passphrase:secret,
   drafts:[draft()],explicitConsent:true});
 assert.equal(saved.status,'ENCRYPTED_ADAPTER_ACK');
 assert.equal(saved.durability,'UNVERIFIED');
 assert.equal(saved.auto_send_enabled,false);
 assert.equal(first.calls.length,3); // before seal, after PBKDF2, after read-back
 const ciphertext=store.data.get(SLOT);
 assert.equal(typeof ciphertext,'string');
 assert.equal(ciphertext.includes('fake private device data'),false);
 assert.equal(ciphertext.includes('fake_partner_1'),false);
 assert.equal(ciphertext.includes(secret),false);
 assert.equal(ciphertext.includes(token),false);
 const second=create(store); // new JS client, same injected opaque storage
 const recovered=await second.vault.inspect({sessionToken:token,
   passphrase:secret,explicitConsent:true});
 assert.equal(recovered.status,'QUARANTINED');
 assert.equal(recovered.durability,'UNVERIFIED');
 assert.equal(recovered.auto_send_enabled,false);
 assert.equal(recovered.items[0].id,draft().id);
 assert.equal(recovered.items[0].status,'QUARANTINED');
 assert.equal(recovered.items[0].auto_retry,false);
 assert.equal(recovered.requires_server_receipt_review,true);
 assert.equal(second.calls.length,2);
 assert.deepEqual(store.calls.map(x=>x[0]),['read','cas','read','read']);
});

test('default-off and explicit per-operation consent prevent access to storage',async()=>{
 const s=storage();
 assert.throws(()=>createSyntheticRecoveryVault({store:s,auth:{verifySession(){}},
   cryptoProvider:webcrypto}),/TEAM_VAULT_DISABLED/);
 const v=create(s).vault;
 await assert.rejects(v.save({sessionToken:token,passphrase:secret,drafts:[draft()]}),
   /TEAM_VAULT_EXPLICIT_CONSENT_REQUIRED/);
 await assert.rejects(v.inspect({sessionToken:token,passphrase:secret}),
   /TEAM_VAULT_EXPLICIT_CONSENT_REQUIRED/);
 assert.deepEqual(s.calls,[]);
});

test('old sealed backup is never overwritten; CAS loss is not treated as safe backup',async()=>{
 const s=storage(),v=create(s).vault;
 await v.save({sessionToken:token,passphrase:secret,drafts:[draft()],
   explicitConsent:true});
 const original=s.data.get(SLOT);
 await assert.rejects(v.save({sessionToken:token,passphrase:secret,drafts:[draft()],
   explicitConsent:true}),/TEAM_VAULT_BACKUP_ALREADY_EXISTS/);
 assert.equal(s.data.get(SLOT),original);
 const racing={async read(){return null;},async writeIfAbsent(){return false;}};
 await assert.rejects(create(racing).vault.save({sessionToken:token,passphrase:secret,
   drafts:[draft()],explicitConsent:true}),/TEAM_VAULT_SAVE_UNVERIFIED/);
});

test('recovery requires matching membership and separate secret; tampering fails closed',async()=>{
 const s=storage();
 await create(s).vault.save({sessionToken:token,passphrase:secret,drafts:[draft()],
   explicitConsent:true});
 for(const identity of [()=>({...actor,user_id:'fake_other'}),
   ()=>({...actor,workspace_id:'group_b'}),()=>({...actor,role:'viewer'})]){
   await assert.rejects(create(s,{identity}).vault.inspect({
     sessionToken:token,passphrase:secret,explicitConsent:true}),
     /TEAM_RECOVERY_AUTH_FAILED|TEAM_VAULT_ROLE_DENIED/);
 }
 await assert.rejects(create(s).vault.inspect({sessionToken:token,
   passphrase:'wrong-synthetic-vault-passphrase',explicitConsent:true}),
   /TEAM_RECOVERY_AUTH_FAILED/);
 const original=s.data.get(SLOT);
 s.data.set(SLOT,original.replace(/"version":0/,'"version":1'));
 await assert.rejects(create(s).vault.inspect({sessionToken:token,passphrase:secret,
   explicitConsent:true}),/TEAM_RECOVERY_FORMAT_INVALID/);
 s.data.set(SLOT,original);
});

test('authorization change during slow seal/restore refuses claim of verified recovery',async()=>{
 const s=storage();
 let role='operator';
 const o=()=>({...actor,role});
 const vault=create(s,{identity:o}).vault;
 // Role becomes revoked at the post-cryptography verifier.
 let count=0;
 const dynamic=create(s,{identity:()=>{
   count++;return count===1?actor:{...actor,role:'viewer'};
 }}).vault;
 await assert.rejects(dynamic.save({sessionToken:token,passphrase:secret,
   drafts:[draft()],explicitConsent:true}),/TEAM_VAULT_ROLE_DENIED/);
 assert.equal(s.data.has(SLOT),false);
 role='operator';
 await vault.save({sessionToken:token,passphrase:secret,
   drafts:[draft()],explicitConsent:true});
 count=0;
 await assert.rejects(dynamic.inspect({sessionToken:token,
   passphrase:secret,explicitConsent:true}),/TEAM_VAULT_ROLE_DENIED/);
});

test('unknown/no storage content is not called recovered or durable',async()=>{
 const s=storage();
 const empty=await create(s).vault.inspect({sessionToken:token,
   passphrase:secret,explicitConsent:true});
 assert.equal(empty.status,'NO_ENCRYPTED_BACKUP');
 assert.equal(empty.durability,'UNVERIFIED');
 assert.deepEqual(empty.items,[]);
 s.data.set(SLOT,{plaintext:draft()});
 await assert.rejects(create(s).vault.inspect({sessionToken:token,
   passphrase:secret,explicitConsent:true}),/TEAM_VAULT_BACKUP_INVALID/);
});

test('injected backend failures never create a positive encrypted backup receipt',async()=>{
 const s={async read(){throw Error('STORAGE_READ_FAILED');},
   async writeIfAbsent(){throw Error('MUST_NOT_SAVE');}};
 await assert.rejects(create(s).vault.save({sessionToken:token,
   passphrase:secret,drafts:[draft()],explicitConsent:true}),/STORAGE_READ_FAILED/);
 const s2={async read(){return null;},
   async writeIfAbsent(){throw Error('STORAGE_WRITE_FAILED');}};
 await assert.rejects(create(s2).vault.save({sessionToken:token,
   passphrase:secret,drafts:[draft()],explicitConsent:true}),/STORAGE_WRITE_FAILED/);
});

test('adapter false-positive ACK without stored ciphertext never counts as a backup',async()=>{
 let reads=0;
 const store={async read(){reads++;return null;},
   async writeIfAbsent(){return true;}};
 const client=create(store);
 await assert.rejects(client.vault.save({sessionToken:token,passphrase:secret,
   drafts:[draft()],explicitConsent:true}),/TEAM_VAULT_SAVE_UNVERIFIED/);
 assert.equal(reads,2);
 // Never call a retry method. A future attempt must first investigate
 // whether an unknown remote/adapter write happened.
});

test('backup replacement between write and read-back must not return success',async()=>{
 let count=0,stored=null;
 const s={async read(){count++;return count===1?null:'{"mismatched":true}';},
   async writeIfAbsent(_,text){stored=text;return true;}};
 await assert.rejects(create(s).vault.save({sessionToken:token,passphrase:secret,
   drafts:[draft()],explicitConsent:true}),/TEAM_VAULT_SAVE_UNVERIFIED/);
 assert.equal(typeof stored,'string'); // Do not delete disputed bytes.
 assert.equal(stored.includes('fake private device data'),false);
});

test('role revocation after successful encrypted write/read-back denies saved claim',async()=>{
 const s=storage();let checks=0;
 const x=create(s,{identity:()=>{
   checks++;return checks>=3?{...actor,role:'viewer'}:actor;
 }});
 await assert.rejects(x.vault.save({sessionToken:token,passphrase:secret,
   drafts:[draft()],explicitConsent:true}),/TEAM_VAULT_ROLE_DENIED/);
 assert.equal(checks,3);
 const original=s.data.get(SLOT);
 assert.equal(typeof original,'string'); // partial outcome remains preserved
 assert.equal(original.includes(secret),false);
 // A later authorized caller can inspect, but cannot silently overwrite.
 await assert.rejects(create(s).vault.save({sessionToken:token,passphrase:secret,
   drafts:[draft()],explicitConsent:true}),/TEAM_VAULT_BACKUP_ALREADY_EXISTS/);
 assert.equal(s.data.get(SLOT),original);
});

test('identity revoked while checking an empty backup denies any no-backup claim',async()=>{
 const s=storage();let checks=0;
 const x=create(s,{identity:()=>{
   checks++;return checks===1?actor:{...actor,role:'viewer'};
 }});
 await assert.rejects(x.vault.inspect({sessionToken:token,passphrase:secret,
   explicitConsent:true}),/TEAM_VAULT_ROLE_DENIED/);
 assert.equal(checks,2);
});
