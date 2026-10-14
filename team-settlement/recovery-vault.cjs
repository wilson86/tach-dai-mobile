'use strict';
// DEFAULT OFF: isolated, manual, synthetic-only encrypted backup adapter proof.
// No filesystem, IndexedDB, HTTP, PWA, automatic retry or data deletion.
// An injected store is NOT proof of persistence unless separately qualified.
const C = require('./core-contract.cjs');
const Recovery = require('../app/settlement-team-recovery-v0.js');
const SLOT = 'synthetic-team-recovery-v0';
const TOKEN = /^[A-Za-z0-9_-]{32,128}$/;
function deny(code){throw Error(code);}
function createSyntheticRecoveryVault({auth,store,cryptoProvider,syntheticOnly=false}={}){
  if(syntheticOnly!==true||!auth||typeof auth.verifySession!=='function'||
    !store||typeof store.read!=='function'||typeof store.writeIfAbsent!=='function')
    deny('TEAM_VAULT_DISABLED');
  async function verified(token){
    if(typeof token!=='string'||!TOKEN.test(token))deny('AUTH_SESSION_INVALID');
    const actor=C.actorFromServer(await auth.verifySession(token));
    if(!['operator','admin'].includes(actor.role))deny('TEAM_VAULT_ROLE_DENIED');
    return actor;
  }
  function sameActor(before,after){
    if(before.user_id!==after.user_id||before.workspace_id!==after.workspace_id||
       before.role!==after.role)deny('TEAM_VAULT_SESSION_CHANGED');
  }
  function consent(value){
    if(value!==true)deny('TEAM_VAULT_EXPLICIT_CONSENT_REQUIRED');
  }
  async function save({sessionToken,passphrase,drafts,explicitConsent=false}={}){
    consent(explicitConsent);
    const actor=await verified(sessionToken);
    // Fail closed if even an obsolete encrypted backup exists. Never overwrite
    // unreviewed evidence; writeIfAbsent must be atomic in the injected store.
    const existing=await store.read(SLOT);
    if(existing!==null)deny('TEAM_VAULT_BACKUP_ALREADY_EXISTS');
    const envelope=await Recovery.seal({actor,passphrase,drafts,cryptoProvider});
    const text=Recovery.serializeEnvelope(envelope);
    sameActor(actor,await verified(sessionToken)); // reauth after slow key derivation
    const acknowledged=await store.writeIfAbsent(SLOT,text);
    if(acknowledged!==true)deny('TEAM_VAULT_SAVE_UNVERIFIED');
    return Object.freeze({status:'ENCRYPTED_ADAPTER_ACK',durability:'UNVERIFIED',
      ciphertext_bytes:text.length,auto_send_enabled:false,backup_slot:SLOT});
  }
  async function inspect({sessionToken,passphrase,explicitConsent=false}={}){
    consent(explicitConsent);
    const actor=await verified(sessionToken);
    const text=await store.read(SLOT);
    if(text===null)return Object.freeze({status:'NO_ENCRYPTED_BACKUP',
      durability:'UNVERIFIED',auto_send_enabled:false,items:Object.freeze([])});
    if(typeof text!=='string')deny('TEAM_VAULT_BACKUP_INVALID');
    const envelope=Recovery.parseEnvelope(text);
    const restored=await Recovery.open({envelope,actor,passphrase,cryptoProvider});
    sameActor(actor,await verified(sessionToken)); // recheck after any delayed IO/KDF
    return Object.freeze({...restored,durability:'UNVERIFIED',
      status:'QUARANTINED',requires_server_receipt_review:true,
      auto_send_enabled:false});
  }
  return Object.freeze({save,inspect});
}
module.exports=Object.freeze({createSyntheticRecoveryVault,SLOT});
