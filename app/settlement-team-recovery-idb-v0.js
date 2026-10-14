(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else root.KtsTeamSyntheticIndexedDbV0=factory();
}(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// Experimental browser IndexedDB ciphertext adapter. DEFAULT OFF:
// not loaded by any pilot/PWA. All data is fake/synthetic only.
// Requires explicit factory creation on a secure context; no auto-open.
const SLOT='synthetic-team-recovery-v0';
const DB='KTS_Synthetic_Recovery_V0';
const STORE='sealed';
const Recovery=(typeof module==='object'&&module.exports)
 ? require('./settlement-team-recovery-v0.js')
 : (typeof globalThis!=='undefined'?globalThis.KtsTeamSyntheticRecoveryV0:null);
function reject(code){throw Error(code);}
function createSyntheticIndexedDbStore({indexedDB,syntheticOnly=false}={}){
 if(syntheticOnly!==true||!indexedDB||typeof indexedDB.open!=='function'||
    typeof globalThis==='undefined'||globalThis.isSecureContext!==true||
    !Recovery||typeof Recovery.parseEnvelope!=='function')
   reject('TEAM_IDB_DISABLED');
 function key(slot){if(slot!==SLOT)reject('TEAM_IDB_SLOT_INVALID');}
 function open(){
  return new Promise((resolve,rejectPromise)=>{
   let request;
   try{request=indexedDB.open(DB,1);}catch(_){rejectPromise(Error('TEAM_IDB_OPEN_FAILED'));return;}
   if(!request||typeof request!=='object'){
     rejectPromise(Error('TEAM_IDB_OPEN_FAILED'));return;
   }
   request.onblocked=()=>rejectPromise(Error('TEAM_IDB_BLOCKED'));
   request.onerror=()=>rejectPromise(Error('TEAM_IDB_OPEN_FAILED'));
   request.onupgradeneeded=event=>{
    try{
     if(event.oldVersion!==0||!request.result||
        typeof request.result.createObjectStore!=='function')
       throw Error('TEAM_IDB_SCHEMA_INVALID');
     request.result.createObjectStore(STORE);
    }catch(_){
     try{request.transaction?.abort();}catch(_){}
     rejectPromise(Error('TEAM_IDB_SCHEMA_INVALID'));
    }
   };
   request.onsuccess=()=>{
    const db=request.result;
    if(!db||typeof db.transaction!=='function'||
       !db.objectStoreNames||!db.objectStoreNames.contains(STORE)||
       db.version!==1){
      try{db?.close?.();}catch(_){}
      rejectPromise(Error('TEAM_IDB_SCHEMA_INVALID'));return;
    }
    db.onversionchange=()=>{try{db.close();}catch(_){}};
    resolve(db);
   };
  });
 }
 function operation(mode,action){
  return open().then(db=>new Promise((resolve,rejectPromise)=>{
   let tx,req,finished=false,seen=false,result,duplicate=false;
   const done=(error,value)=>{
    if(finished)return;finished=true;
    try{db.close();}catch(_){}
    error?rejectPromise(error):resolve(value);
   };
   try{
    tx=db.transaction(STORE,mode);
    if(!tx||typeof tx.objectStore!=='function')
      throw Error('TEAM_IDB_TRANSACTION_INVALID');
    tx.oncomplete=()=>{
     if(!seen){done(Error('TEAM_IDB_RESULT_UNVERIFIED'));return;}
     done(null,mode==='readonly'?result:true);
    };
    tx.onabort=()=>{
     if(duplicate&&mode==='readwrite')done(null,false);
     else done(Error('TEAM_IDB_TRANSACTION_ABORTED'));
    };
    tx.onerror=()=>{}; // Transaction abort owns final outcome.
    const objectStore=tx.objectStore(STORE);
    // The known schema has out-of-line keys; do not operate against an
    // unexpected keyPath/autoIncrement store created by a foreign script.
    if(!objectStore||objectStore.keyPath!==null||objectStore.autoIncrement!==false)
      throw Error('TEAM_IDB_SCHEMA_INVALID');
    req=action(objectStore);
    if(!req||typeof req!=='object')throw Error('TEAM_IDB_REQUEST_INVALID');
    req.onsuccess=()=>{seen=true;result=req.result;};
    req.onerror=()=>{duplicate=mode==='readwrite'&&req.error?.name==='ConstraintError';};
   }catch(e){
    try{tx?.abort?.();}catch(_){}
    done(Error(e&&e.message==='TEAM_IDB_SCHEMA_INVALID'
      ?'TEAM_IDB_SCHEMA_INVALID':'TEAM_IDB_TRANSACTION_INVALID'));
   }
  }));
 }
 async function read(slot){
  key(slot);
  const value=await operation('readonly',s=>s.get(SLOT));
  if(value===undefined)return null;
  if(typeof value!=='string')reject('TEAM_IDB_ENVELOPE_INVALID');
  Recovery.parseEnvelope(value); // never treat corrupted data as empty.
  return value;
 }
 async function writeIfAbsent(slot,ciphertext){
  key(slot);
  if(typeof ciphertext!=='string')reject('TEAM_IDB_ENVELOPE_INVALID');
  Recovery.parseEnvelope(ciphertext);
  // IDBStore.add(), not put(), prevents an existing backup from being
  // silently replaced. Resolve only after transaction.oncomplete.
  return operation('readwrite',s=>s.add(ciphertext,SLOT));
 }
 return Object.freeze({read,writeIfAbsent});
}
return Object.freeze({createSyntheticIndexedDbStore,SLOT,DB,STORE});
}));
