'use strict';
// Isolated candidate; no pool, server, grants or automatic activation.
const crypto=require('node:crypto');
const KEY=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
function fail(){throw Error('TEAM_ATOMIC_DRAFT_PROOF_INVALID');}
function validDate(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const [year,month,day]=value.split('-').map(Number);
  if(year<1||month<1||month>12)return false;
  const leap=year%4===0&&(year%100!==0||year%400===0);
  return day>=1&&day<=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][month-1];
}
function createDraftProof(token,request,{nonce=crypto.randomBytes(16).toString('hex'),expires,purpose='write'}={}){
  if(typeof token!=='string'||!/^[A-Za-z0-9_-]{32,128}$/.test(token)||!request||typeof request!=='object'||Array.isArray(request))fail();
  const {workspace_id,partner_id,business_date,region,action,expected_revision,event_id,idempotency_key,request_sha256,snapshot_text}=request;
  if(![workspace_id,partner_id,event_id,idempotency_key].every(x=>typeof x==='string'&&KEY.test(x))||
     !validDate(business_date)||
     !['mn','mt','mb'].includes(region)||!['create_draft','edit_draft'].includes(action)||
     !Number.isSafeInteger(expected_revision)||expected_revision<0||!Number.isSafeInteger(expected_revision+1)||
     typeof request_sha256!=='string'||!/^[a-f0-9]{64}$/.test(request_sha256)||
     typeof snapshot_text!=='string'||Buffer.byteLength(snapshot_text,'utf8')>65536||
     typeof nonce!=='string'||!/^[a-f0-9]{32}$/.test(nonce)||!Number.isSafeInteger(expires)||expires<=0||
     !['write','lookup'].includes(purpose)||(purpose==='lookup'&&event_id!=='lookup'))fail();
  let snapshot;try{snapshot=JSON.parse(snapshot_text);}catch(_){fail();}
  if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))fail();
  const sessionHash=crypto.createHash('sha256').update(token,'utf8').digest('hex');
  const sessionId=crypto.createHash('sha256').update(sessionHash,'utf8').digest('hex');
  const snapshotHash=crypto.createHash('sha256').update(snapshot_text,'utf8').digest('hex');
  const message=[purpose==='write'?'kts-draft-v1':'kts-draft-lookup-v1',sessionId,workspace_id,partner_id,business_date,region,action,
    String(expected_revision),event_id,idempotency_key,request_sha256,snapshotHash,nonce,String(expires)].join('|');
  const proof=crypto.createHmac('sha256',Buffer.from(sessionHash,'hex')).update(message,'utf8').digest('hex');
  return Object.freeze({session_id:sessionId,nonce,expires,proof});
}
module.exports=Object.freeze({createDraftProof});
