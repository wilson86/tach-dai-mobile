'use strict';
// DEFAULT-OFF. Authenticated synthetic recovery review only. NO HTTP, write,
// resend, decrypt, file/IndexedDB persistence or production integration.
const C=require('./core-contract.cjs');
const {digest}=require('./server-ledger-api.cjs');
const DRAFT=/^draft_[a-f0-9]{32}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const HASH=/^[a-f0-9]{64}$/;
const FAKE=/^(?:fake|demo|synthetic)_[a-z0-9_-]{1,64}$/;
const MAX_FEED=9223372036854775807n;
function fail(code){throw Error(code);}
function validSeq(v){
  if(typeof v==='number'&&!Number.isSafeInteger(v))return false;
  if(typeof v!=='string'&&typeof v!=='number')return false;
  const s=String(v);
  return /^[1-9][0-9]{0,18}$/.test(s)&&BigInt(s)<=MAX_FEED;
}
function validRevision(v,prior){
  if(typeof v==='number')return Number.isSafeInteger(v)&&v===prior+1;
  return typeof v==='string'&&/^[1-9][0-9]{0,16}$/.test(v)&&BigInt(v)===BigInt(prior)+1n;
}
function expectIntent(x,actor){
  if(!x||typeof x!=='object'||Array.isArray(x)||
     !DRAFT.test(x.id)||x.status!=='QUARANTINED'||x.auto_retry!==false||
     !['PENDING','CONFLICT','BLOCKED'].includes(x.original_status)||
     !Number.isSafeInteger(x.base_revision)||x.base_revision<0||
     !Number.isSafeInteger(x.base_revision+1)||
     !x.scope||typeof x.scope!=='object'||Array.isArray(x.scope)||
     x.scope.workspace_id!==actor.workspace_id||
     typeof x.scope.partner_id!=='string'||!FAKE.test(x.scope.partner_id)||
     !x.payload||typeof x.payload!=='object'||Array.isArray(x.payload)||
     x.payload.synthetic!==true)
    fail('TEAM_RECOVERY_QUARANTINE_REQUIRED');
  const scope=C.requireScope(x.scope);
  let hash;
  try{hash=digest({action:'create_draft',scope,
    expected_revision:x.base_revision,payload:x.payload});}
  catch(_){fail('TEAM_RECOVERY_QUARANTINE_REQUIRED');}
  return {id:x.id,scope,revision:x.base_revision,hash};
}
function checkReceipt(row,spec,actor){
  if(!row||typeof row!=='object'||Array.isArray(row)||
     row.workspace_id!==actor.workspace_id||
     row.actor_user_id!==actor.user_id||
     row.idempotency_key!==spec.id||
     row.partner_id!==spec.scope.partner_id||
     row.business_date!==spec.scope.business_date||
     row.region!==spec.scope.region||
     row.event_kind!==(spec.revision===0?'DRAFT_CREATED':'DRAFT_CHANGED')||
     typeof row.event_id!=='string'||!ID.test(row.event_id)||
     typeof row.request_sha256!=='string'||!HASH.test(row.request_sha256)||
     typeof row.payload_sha256!=='string'||!HASH.test(row.payload_sha256)||
     row.request_sha256!==spec.hash||row.payload_sha256!==spec.hash||
     !validRevision(row.scope_revision,spec.revision)||
     !validSeq(row.feed_seq))
    fail('TEAM_RECOVERY_RECEIPT_MISMATCH');
  return Object.freeze({id:spec.id,classification:'MATCHED_SERVER_RECEIPT',
    event_id:row.event_id,feed_seq:String(row.feed_seq),
    server_revision:String(row.scope_revision),auto_retry:false});
}
function createRecoveryReconciliation({auth,repository,syntheticOnly=false}={}){
  if(syntheticOnly!==true||!auth||typeof auth.verifySession!=='function'||
     !repository||typeof repository.lookupRecoveryReceipts!=='function')
    fail('TEAM_RECOVERY_RECONCILIATION_DISABLED');
  async function inspect(sessionToken,quarantined){
    if(typeof sessionToken!=='string'||!/^[A-Za-z0-9_-]{32,128}$/.test(sessionToken))
      fail('AUTH_SESSION_INVALID');
    const actor=C.actorFromServer(await auth.verifySession(sessionToken));
    if(!['admin','operator'].includes(actor.role))fail('TEAM_RECOVERY_ROLE_DENIED');
    if(!Array.isArray(quarantined)||quarantined.length<1||quarantined.length>30)
      fail('TEAM_RECOVERY_QUARANTINE_REQUIRED');
    const specs=quarantined.map(x=>expectIntent(x,actor));
    const keys=specs.map(x=>x.id);
    if(new Set(keys).size!==keys.length)fail('TEAM_RECOVERY_DUPLICATE_INTENT');
    // Required repository method must independently recheck membership within
    // a tenant-scoped READ-ONLY PostgreSQL transaction; never browser evidence.
    const rows=await repository.lookupRecoveryReceipts(actor,keys);
    if(!Array.isArray(rows)||rows.length>specs.length)
      fail('TEAM_RECOVERY_RECEIPT_UNVERIFIED');
    const seen=new Map(),allowed=new Set(keys);
    for(const row of rows){
      if(!row||typeof row!=='object'||Array.isArray(row)||
         typeof row.idempotency_key!=='string'||
         !allowed.has(row.idempotency_key)||seen.has(row.idempotency_key))
        fail('TEAM_RECOVERY_RECEIPT_UNVERIFIED');
      seen.set(row.idempotency_key,row);
    }
    const items=specs.map(spec=>seen.has(spec.id)?
      checkReceipt(seen.get(spec.id),spec,actor):
      Object.freeze({id:spec.id,classification:'UNVERIFIED_NOT_SAFE_TO_RETRY',
        auto_retry:false}));
    return Object.freeze({status:'REVIEW_ONLY',authenticated_user_id:actor.user_id,
      workspace_id:actor.workspace_id,auto_send_enabled:false,
      all_receipts_verified:items.every(x=>x.classification==='MATCHED_SERVER_RECEIPT'),
      items:Object.freeze(items)});
  }
  return Object.freeze({inspect});
}
module.exports=Object.freeze({createRecoveryReconciliation});
