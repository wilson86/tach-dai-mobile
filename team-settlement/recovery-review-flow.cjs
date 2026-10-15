'use strict';
// DEFAULT-OFF manual synthetic-only review composition. No persistence,
// network, read/write HTTP route, automatic financial resend or PWA wiring.
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const KEY=/^draft_[a-f0-9]{32}$/;
const EVENT=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const POSITIVE=/^[1-9][0-9]{0,18}$/;
function positiveBigInt(value){
 return typeof value==='string'&&POSITIVE.test(value)&&
   BigInt(value)<=9223372036854775807n;
}
function deny(code){throw Error(code);}
function createSyntheticRecoveryReviewFlow({vault,reconciliation,syntheticOnly=false}={}){
  if(syntheticOnly!==true||!vault||typeof vault.inspect!=='function'||
     !reconciliation||typeof reconciliation.inspect!=='function')
    deny('TEAM_RECOVERY_FLOW_DISABLED');
  async function review({sessionToken,passphrase,explicitConsent=false}={}){
    if(explicitConsent!==true)deny('TEAM_RECOVERY_FLOW_EXPLICIT_CONSENT_REQUIRED');
    const restored=await vault.inspect({sessionToken,passphrase,explicitConsent:true});
    if(!restored||typeof restored!=='object'||Array.isArray(restored)||
       restored.auto_send_enabled!==false||restored.durability!=='UNVERIFIED')
      deny('TEAM_RECOVERY_FLOW_UNVERIFIED_BACKUP');
    if(restored.status==='NO_ENCRYPTED_BACKUP'){
      if(!Array.isArray(restored.items)||restored.items.length!==0)
        deny('TEAM_RECOVERY_FLOW_UNVERIFIED_BACKUP');
      return Object.freeze({status:'NO_ENCRYPTED_BACKUP',durability:'UNVERIFIED',
        auto_send_enabled:false,all_receipts_verified:false,
        items:Object.freeze([])});
    }
    if(restored.status!=='QUARANTINED'||restored.requires_server_receipt_review!==true||
       restored.needs_server_reauthentication!==true||
       !ID.test(restored.authenticated_user_id||'')||
       !ID.test(restored.workspace_id||'')||
       !Array.isArray(restored.items)||restored.items.length<1||restored.items.length>30||
       restored.items.some(x=>!x||x.status!=='QUARANTINED'||
         x.auto_retry!==false||typeof x.id!=='string'||!KEY.test(x.id)))
      deny('TEAM_RECOVERY_FLOW_UNVERIFIED_BACKUP');
    // Independently fence even a forged/quasi-restored adapter result.
    // Duplicated original keys must never manufacture an 'all matched'
    // outcome by replaying one receipt twice.
    const originalIds=restored.items.map(x=>x.id);
    if(new Set(originalIds).size!==originalIds.length)
      deny('TEAM_RECOVERY_FLOW_DUPLICATE_INTENT');
    const review=await reconciliation.inspect(sessionToken,restored.items);
    if(!review||typeof review!=='object'||Array.isArray(review)||
       review.status!=='REVIEW_ONLY'||review.auto_send_enabled!==false||
       review.authenticated_user_id!==restored.authenticated_user_id||
       review.workspace_id!==restored.workspace_id||
       !Array.isArray(review.items)||review.items.length!==restored.items.length)
      deny('TEAM_RECOVERY_FLOW_IDENTITY_MISMATCH');
    const allowed=new Set(['MATCHED_SERVER_RECEIPT','UNVERIFIED_NOT_SAFE_TO_RETRY']);
    for(let i=0;i<review.items.length;i++){
      const current=review.items[i];
      if(!current||typeof current!=='object'||Array.isArray(current)||
         current.id!==restored.items[i].id||!allowed.has(current.classification)||
         current.auto_retry!==false||
         (current.classification==='MATCHED_SERVER_RECEIPT'&&
           (!EVENT.test(current.event_id||'')||
             !positiveBigInt(current.feed_seq)||
             !positiveBigInt(current.server_revision)))||
         (current.classification==='UNVERIFIED_NOT_SAFE_TO_RETRY'&&
           (current.event_id!==undefined||current.feed_seq!==undefined||
             current.server_revision!==undefined)))
        deny('TEAM_RECOVERY_FLOW_RECEIPT_UNVERIFIED');
    }
    const everyMatched=review.items.every(x=>x.classification==='MATCHED_SERVER_RECEIPT');
    if(review.all_receipts_verified!==everyMatched)
      deny('TEAM_RECOVERY_FLOW_RECEIPT_UNVERIFIED');
    // Report only original IDs and nonfinancial classification; the full
    // decrypted payload never leaves quarantine into a sendable draft queue.
    const items=review.items.map(x=>Object.freeze({
      id:x.id,classification:x.classification,auto_retry:false
    }));
    return Object.freeze({status:'REVIEW_ONLY',durability:'UNVERIFIED',
      authenticated_user_id:restored.authenticated_user_id,
      workspace_id:restored.workspace_id,all_receipts_verified:everyMatched,
      auto_send_enabled:false,needs_human_resolution:true,
      items:Object.freeze(items)});
  }
  return Object.freeze({review});
}
module.exports=Object.freeze({createSyntheticRecoveryReviewFlow});
