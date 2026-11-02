'use strict';
// Offline candidate for the paired SQL boundary. Never log token, key or proof.
// No connection, grant, runtime registration or automatic activation.
const crypto=require('node:crypto');
const KEY=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const TOKEN=/^[A-Za-z0-9_-]{32,128}$/;
const HEX=/^[a-f0-9]{64}$/;
const NONCE=/^[a-f0-9]{32}$/;
function fail(){throw Error('TEAM_ATOMIC_PROOF_INPUT_INVALID');}
function validDate(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const [year,month,day]=value.split('-').map(Number);
  if(year<1||month<1||month>12)return false;
  const leap=year%4===0&&(year%100!==0||year%400===0);
  return day>=1&&day<=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][month-1];
}
function createReviewProof(token,request,{nonce=crypto.randomBytes(16).toString('hex'),expires,purpose='write'}={}){
  if(typeof token!=='string'||!TOKEN.test(token)||!request||typeof request!=='object'||Array.isArray(request))fail();
  const {workspace_id,partner_id,business_date,region,action,expected_revision,event_id,idempotency_key,request_sha256}=request;
  if(![workspace_id,partner_id,event_id,idempotency_key].every(x=>typeof x==='string'&&KEY.test(x))||
     !validDate(business_date)||
     !['mn','mt','mb'].includes(region)||!['submit_review','approve_review'].includes(action)||
     !Number.isSafeInteger(expected_revision)||expected_revision<0||!Number.isSafeInteger(expected_revision+1)||
     typeof request_sha256!=='string'||!HEX.test(request_sha256)||typeof nonce!=='string'||!NONCE.test(nonce)||
     !Number.isSafeInteger(expires)||expires<=0||!['write','lookup'].includes(purpose)||
     (purpose==='lookup'&&event_id!=='lookup'))fail();
  const sessionHash=crypto.createHash('sha256').update(token,'utf8').digest('hex');
  const sessionId=crypto.createHash('sha256').update(sessionHash,'utf8').digest('hex');
  const message=[purpose==='write'?'kts-review-v1':'kts-review-lookup-v1',sessionId,workspace_id,partner_id,business_date,region,action,
    String(expected_revision),event_id,idempotency_key,request_sha256,nonce,String(expires)].join('|');
  const proof=crypto.createHmac('sha256',Buffer.from(sessionHash,'hex')).update(message,'utf8').digest('hex');
  return Object.freeze({session_id:sessionId,nonce,expires,proof});
}
module.exports=Object.freeze({createReviewProof});
