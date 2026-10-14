'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const {createSyntheticIndexedDbStore,SLOT}=
 require('../app/settlement-team-recovery-idb-v0.js');
const Recovery=require('../app/settlement-team-recovery-v0.js');
const {createSyntheticRecoveryVault}=require('../team-settlement/recovery-vault.cjs');
const actor={workspace_id:'group_a',user_id:'fake_op'};
const secret='synthetic-idb-test-only-strong-key';
const draft={id:'draft_'+'a'.repeat(32),status:'PENDING',
 scope:{workspace_id:'group_a',partner_id:'fake_partner_1',region:'mn',
  business_date:'2026-10-15'},base_revision:0,
 payload:{synthetic:true,description:'fake_test_private'}};
const envelope=()=>Recovery.seal({actor,passphrase:secret,drafts:[draft],
 cryptoProvider:webcrypto}).then(x=>Recovery.serializeEnvelope(x));
function fakeIdb({blocked=false,failOpen=false,abortWrites=false,
  abortAfterSuccess=false,badKeyPath=false,missingStore=false}={}){
 const saved=new Map(),calls=[];
 const names=new Set(missingStore?[]:['sealed']);
 let version=missingStore?1:0;
 const db={get version(){return version;},
  objectStoreNames:{contains:x=>names.has(x)},
  createObjectStore(name){names.add(name);version=1;},
  close(){calls.push('close');},
  transaction(name,mode){
   calls.push('transaction:'+mode);
   if(!names.has(name))throw Error('MISSING_STORE');
   const tx={oncomplete:null,onabort:null,onerror:null,
    abort(){setImmediate(()=>tx.onabort?.());},
    objectStore(){
     return {
      keyPath:badKeyPath?'id':null,autoIncrement:false,
      get(key){
       const req={result:undefined};
       setImmediate(()=>{calls.push('get');req.result=saved.get(key);
        req.onsuccess?.();setImmediate(()=>tx.oncomplete?.());});
       return req;
      },
      add(value,key){
       const req={error:null};
       setImmediate(()=>{
        calls.push('add');
        if(saved.has(key)){req.error={name:'ConstraintError'};
         req.onerror?.();setImmediate(()=>tx.onabort?.());return;}
        if(abortWrites){req.error={name:'QuotaExceededError'};
         req.onerror?.();setImmediate(()=>tx.onabort?.());return;}
        if(abortAfterSuccess){
         req.onsuccess?.();
         setImmediate(()=>tx.onabort?.());
         return;
        }
        saved.set(key,value);req.onsuccess?.();
        setImmediate(()=>tx.oncomplete?.());
       });
       return req;
      }
     };
    }
   };
   return tx;
  }
 };
 return {saved,calls,api:{open(){
   calls.push('open');
   const request={result:db,transaction:{abort(){}},onerror:null,onblocked:null,
    onupgradeneeded:null,onsuccess:null};
   setImmediate(()=>{
    if(blocked){request.onblocked?.();return;}
    if(failOpen){request.onerror?.();return;}
    if(version===0&&!missingStore)
      request.onupgradeneeded?.({oldVersion:0});
    request.onsuccess?.();
   });
   return request;
  }}};
}
async function secure(fn){
 const original=Object.getOwnPropertyDescriptor(globalThis,'isSecureContext');
 Object.defineProperty(globalThis,'isSecureContext',{value:true,configurable:true});
 try{return await fn();}
 finally{
  if(original)Object.defineProperty(globalThis,'isSecureContext',original);
  else delete globalThis.isSecureContext;
 }
}
test('IDB adapter is default off; secure context and explicit synthetic flag mandatory',async()=>{
 const fake=fakeIdb();
 assert.throws(()=>createSyntheticIndexedDbStore({indexedDB:fake.api}),
   /TEAM_IDB_DISABLED/);
 assert.throws(()=>createSyntheticIndexedDbStore({indexedDB:fake.api,syntheticOnly:true}),
   /TEAM_IDB_DISABLED/);
 assert.deepEqual(fake.calls,[]);
});
test('atomic synthetic add persists only ciphertext and second factory reads same bytes',async()=>{
 await secure(async()=>{
  const fake=fakeIdb(),store=createSyntheticIndexedDbStore({
   indexedDB:fake.api,syntheticOnly:true});
  const bytes=await envelope();
  assert.equal(await store.read(SLOT),null);
  assert.equal(await store.writeIfAbsent(SLOT,bytes),true);
  assert.equal(fake.saved.get(SLOT),bytes);
  const second=createSyntheticIndexedDbStore({indexedDB:fake.api,syntheticOnly:true});
  assert.equal(await second.read(SLOT),bytes);
  assert.equal(await second.writeIfAbsent(SLOT,bytes),false);
  assert.equal(fake.saved.get(SLOT),bytes);
  assert.equal(bytes.includes('fake_test_private'),false);
  assert.equal(fake.calls.filter(x=>x==='add').length,2);
 });
});
test('concurrent synthetic writes only insert one encrypted envelope',{timeout:10000},async()=>{
 await secure(async()=>{
  const fake=fakeIdb(),store=createSyntheticIndexedDbStore({
   indexedDB:fake.api,syntheticOnly:true});
  const bytes=await envelope();
  const results=await Promise.all(Array.from({length:8},()=>store.writeIfAbsent(SLOT,bytes)));
  assert.equal(results.filter(x=>x===true).length,1);
  assert.equal(results.filter(x=>x===false).length,7);
 });
});
test('blocked, failed or incompatible IDB opens refuse to claim successful storage',async()=>{
 await secure(async()=>{
  for(const config of [{blocked:true},{failOpen:true},{missingStore:true}]){
   const fake=fakeIdb(config);
   const store=createSyntheticIndexedDbStore({indexedDB:fake.api,syntheticOnly:true});
   await assert.rejects(store.read(SLOT),/TEAM_IDB_BLOCKED|TEAM_IDB_OPEN_FAILED|TEAM_IDB_SCHEMA_INVALID/);
  }
 });
});
test('quota/abort is never treated as a saved transaction',async()=>{
 await secure(async()=>{
  const fake=fakeIdb({abortWrites:true});
  const store=createSyntheticIndexedDbStore({indexedDB:fake.api,syntheticOnly:true});
  await assert.rejects(store.writeIfAbsent(SLOT,await envelope()),
    /TEAM_IDB_TRANSACTION_ABORTED/);
  assert.equal(fake.saved.size,0);
 });
});
test('wrong key, unencrypted data, malformed persisted record are rejected',async()=>{
 await secure(async()=>{
  const fake=fakeIdb(),store=createSyntheticIndexedDbStore({indexedDB:fake.api,
   syntheticOnly:true});
  await assert.rejects(store.read('../outside'),/TEAM_IDB_SLOT_INVALID/);
  await assert.rejects(store.writeIfAbsent(SLOT,JSON.stringify(draft)),
   /TEAM_RECOVERY_FORMAT_INVALID/);
  assert.deepEqual(fake.calls,[]);
  fake.saved.set(SLOT,'{"plaintext":"fake"}');
  await assert.rejects(store.read(SLOT),/TEAM_RECOVERY_FORMAT_INVALID/);
  assert.equal(fake.saved.size,1); // never auto-delete corrupted evidence
 });
});
test('new IndexedDB adapter remains entirely unreferenced by actual PWA',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const root=path.join(__dirname,'..');
 for(const p of ['app/settlement-team-pilot.html','app/settlement-team-pilot-start.js',
  'app/settlement-team-pilot-ui.js','app/settlement-team-sync-client.js',
  'team-settlement/auth-http-contract.cjs']){
   assert.doesNotMatch(fs.readFileSync(path.join(root,p),'utf8'),
     /settlement-team-recovery-idb-v0|KtsTeamSyntheticIndexedDbV0/);
 }
});

test('encrypted draft survives independent synthetic vault clients on fake IndexedDB',async()=>{
 await secure(async()=>{
  const fake=fakeIdb();
  const auth={async verifySession(value){assert.equal(value,'a'.repeat(43));
    return {server_verified:true,membership_active:true,
      user_id:'fake_op',workspace_id:'group_a',role:'operator'};}};
  const makeVault=()=>createSyntheticRecoveryVault({
    auth,syntheticOnly:true,cryptoProvider:webcrypto,
    store:createSyntheticIndexedDbStore({indexedDB:fake.api,syntheticOnly:true})
  });
  const first=makeVault(),token='a'.repeat(43);
  const receipt=await first.save({sessionToken:token,passphrase:secret,
    drafts:[draft],explicitConsent:true});
  assert.equal(receipt.status,'ENCRYPTED_ADAPTER_ACK');
  assert.equal(receipt.durability,'UNVERIFIED');
  assert.equal(receipt.auto_send_enabled,false);
  const bytes=fake.saved.get(SLOT);
  for(const value of [secret,token,'fake_partner_1','fake_test_private'])
    assert.equal(bytes.includes(value),false);
  const recovered=await makeVault().inspect({sessionToken:token,
    passphrase:secret,explicitConsent:true});
  assert.equal(recovered.status,'QUARANTINED');
  assert.equal(recovered.auto_send_enabled,false);
  assert.equal(recovered.items[0].id,draft.id);
  assert.equal(recovered.items[0].auto_retry,false);
  assert.equal(recovered.requires_server_receipt_review,true);
  assert.equal(await makeVault().inspect({sessionToken:token,
    passphrase:'different-strong-synthetic-password',explicitConsent:true})
    .then(()=>false,()=>true),true);
  assert.equal(fake.saved.get(SLOT),bytes);
 });
});
test('IndexedDB schema with unexpected keyPath refuses reads and writes',async()=>{
 await secure(async()=>{
  const fake=fakeIdb({badKeyPath:true});
  const store=createSyntheticIndexedDbStore({indexedDB:fake.api,syntheticOnly:true});
  await assert.rejects(store.read(SLOT),/TEAM_IDB_SCHEMA_INVALID/);
  await assert.rejects(store.writeIfAbsent(SLOT,await envelope()),
    /TEAM_IDB_SCHEMA_INVALID/);
  assert.equal(fake.saved.size,0);
 });
});
test('transaction abort after add request success cannot produce a saved ACK',async()=>{
 await secure(async()=>{
  const fake=fakeIdb({abortAfterSuccess:true});
  const store=createSyntheticIndexedDbStore({indexedDB:fake.api,syntheticOnly:true});
  await assert.rejects(store.writeIfAbsent(SLOT,await envelope()),
    /TEAM_IDB_TRANSACTION_ABORTED/);
  assert.equal(fake.saved.size,0);
 });
});
