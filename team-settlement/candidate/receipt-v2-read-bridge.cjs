'use strict';
// REVIEW-ONLY, DEFAULT OFF. Backend-only bridge from a DB-authenticated V2
// signer to an independently reviewed SQL verifier. No Pool/HTTP/secret setup.
// Never use this bridge to bypass the missing SQL owner/key/tenant proof gates.
const HEX16=/^[a-f0-9]{16}$/;
const HEX32=/^[a-f0-9]{32}$/;
const HEX64=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const RECEIPT=/^draft_[a-f0-9]{32}$/;
const MAX_BIGINT=9223372036854775807n;
const SQL=`SELECT workspace_id,idempotency_key,request_sha256,event_id,
  actor_user_id,partner_id,business_date,region,scope_revision,feed_seq,
  event_kind,payload_sha256
  FROM kts_team.candidate_receipt_read_v2(
    $1::text,$2::text,$3::text,$4::text,$5::text[],
    $6::text,$7::bigint,$8::bigint,$9::text)`;
function deny(){throw Error('TEAM_RECEIPT_V2_READ_UNQUALIFIED');}
function numberBigint(value,zeroOk=true){
  if(typeof value==='number')return Number.isSafeInteger(value)&&(zeroOk?value>=0:value>0);
  return typeof value==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(value)&&
    (zeroOk||value!=='0')&&BigInt(value)<=MAX_BIGINT;
}
function checkEnvelope(e,nowMs){
  if(!e||typeof e!=='object'||Array.isArray(e)||
      typeof e.key_id!=='string'||!HEX16.test(e.key_id)||
      typeof e.session_handle!=='string'||!HEX32.test(e.session_handle)||
      typeof e.user_id!=='string'||!ID.test(e.user_id)||
      typeof e.workspace_id!=='string'||!ID.test(e.workspace_id)||
      typeof e.nonce!=='string'||!HEX32.test(e.nonce)||
      typeof e.proof!=='string'||!HEX64.test(e.proof)||
      !Array.isArray(e.keys)||e.keys.length<1||e.keys.length>30||
      !Number.isSafeInteger(e.issued_at)||!Number.isSafeInteger(e.expires_at)||
      e.issued_at<0||e.expires_at<=e.issued_at||e.expires_at-e.issued_at>30||
      nowMs<e.issued_at*1000||nowMs>=e.expires_at*1000)deny();
  for(let i=0;i<e.keys.length;i++){
    if(typeof e.keys[i]!=='string'||!RECEIPT.test(e.keys[i])||
        (i>0&&e.keys[i-1]>=e.keys[i]))deny();
  }
}
function checkRow(row,e,known){
  if(!row||typeof row!=='object'||Array.isArray(row)||
      row.workspace_id!==e.workspace_id||row.actor_user_id!==e.user_id||
      typeof row.idempotency_key!=='string'||!known.has(row.idempotency_key)||
      typeof row.request_sha256!=='string'||!HEX64.test(row.request_sha256)||
      typeof row.payload_sha256!=='string'||!HEX64.test(row.payload_sha256)||
      typeof row.event_id!=='string'||!ID.test(row.event_id)||
      typeof row.partner_id!=='string'||!ID.test(row.partner_id)||
      typeof row.business_date!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(row.business_date)||
      !['mn','mt','mb'].includes(row.region)||
      !numberBigint(row.scope_revision)||!numberBigint(row.feed_seq,false)||
      typeof row.event_kind!=='string'||!ID.test(row.event_kind))deny();
}
function createReceiptV2ReadBridge({signer,ledgerDb,clock=()=>Date.now(),enabled=false}={}){
  if(typeof enabled!=='boolean'||typeof clock!=='function')deny();
  if(enabled&&(!signer||typeof signer.signReceiptRead!=='function'||
      !ledgerDb||typeof ledgerDb.transaction!=='function'))deny();
  async function lookup({bearerToken,keys}={}){
    if(!enabled)throw Error('TEAM_RECEIPT_V2_READ_NOT_ENABLED');
    // Only the protected backend signer may produce an envelope. SQL must
    // independently recheck HMAC, live session/member and tenant authority.
    const e=await signer.signReceiptRead({bearerToken,keys});
    let now=clock();
    if(!Number.isSafeInteger(now)||now<0)deny();
    checkEnvelope(e,now);
    const params=[e.key_id,e.session_handle,e.workspace_id,e.user_id,
      [...e.keys],e.nonce,e.issued_at,e.expires_at,e.proof];
    const known=new Set(e.keys);
    // Dedicated Ledger function EXECUTE only; no direct table SELECT, no
    // persistent financial mutation, no retries on uncertain COMMIT/transport.
    const rows=await ledgerDb.transaction(async tx=>{
      if(!tx||typeof tx.query!=='function')deny();
      now=clock();
      if(!Number.isSafeInteger(now)||now<0)deny();
      checkEnvelope(e,now); // connection acquisition may outlive proof TTL
      const result=await tx.query(SQL,params);
      if(!result||!Array.isArray(result.rows)||result.rows.length>known.size)deny();
      const seen=new Set();
       const found=[];
      for(const row of result.rows){
        checkRow(row,e,known);
        if(seen.has(row.idempotency_key))deny();
        seen.add(row.idempotency_key);
        found.push(Object.freeze({...row}));
      }
      now=clock();
      if(!Number.isSafeInteger(now)||now<0)deny();
      checkEnvelope(e,now); // SQL may have spent time behind a row lock
      return Object.freeze(found);
    });
    // Return is intentionally only a read receipt list, never SYNCED state.
    // A lostÑÉ¹ÍÑ¥½¸½ÕÑ½µÍÑåÌU9-9=]8ì¼¹½ÐÕÑ¼ÉÑÉä¸(¹½Üõ±½¬ ¤ì(¥ 9ÕµÈ¹¥ÍM%¹ÑÈ¡¹½Ü¥ññ¹½ÜðÀ¥¹ä ¤ì(¡­¹Ù±½Á¡±¹½Ü¤ì(ÉÑÕÉ¸É½ÝÌì(ô(ÉÑÕÉ¸=©Ð¹Éé¡í±½½­ÕÁô¤ì)ô)µ½Õ±¹áÁ½ÉÑÌõ=©Ð¹Éé¡íÉÑI¥ÁÑXÉI	É¥ô¤ì(￿