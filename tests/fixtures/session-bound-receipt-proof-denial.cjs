'use strict';
// Test-only, injected pool. No connections are created on import. No production
// signer, database setup, grants, or security qualification is performed here.
const {vector}=require('./session-bound-receipt-vectors.cjs');
const EXPECTED={forged:'TEAM_RECEIPT_READ_PROOF_INVALID',expired:'TEAM_RECEIPT_READ_PROOF_INVALID',
 revoked:'TEAM_RECEIPT_READ_SESSION_INVALID',membership_revoked:'TEAM_RECEIPT_READ_MEMBERSHIP_DENIED'};
async function probe({pool,syntheticOnly=false,mode,input}={}){
 if(syntheticOnly!==true||!pool||typeof pool.connect!=='function'||!Object.hasOwn(EXPECTED,mode))
  throw Error('SYNTHETIC_PROOF_DENIAL_DISABLED');
 const v=vector(input);
 const proof=mode==='forged'?(v.proof[0]==='0'?'1':'0')+v.proof.slice(1):v.proof;
 const expires=mode==='expired'?1:v.expires;
 const c=await pool.connect();
 if(!c||typeof c.query!=='function'||typeof c.release!=='function'){
  try{c?.release?.(true)}catch(_){}
  throw Error('SYNTHETIC_PROOF_DENIAL_CLIENT_INVALID');
 }
 let began=false,denied=false;
 try{
  await c.query('BEGIN');began=true;
  await c.query('SET TRANSACTION READ ONLY');
  const auth=await c.query('SELECT current_user::text AS role, session_user::text AS session_role');
  if(auth?.rows?.length!==1||auth.rows[0].role!=='synthetic_receipt_ledger'||
     auth.rows[0].session_role!=='synthetic_receipt_ledger')throw Error('SYNTHETIC_PROOF_DENIAL_ROLE_INVALID');
  try{
   await c.query('SELECT * FROM kts_team.candidate_receipt_read_v1($1,$2,$3,$4,$5,$6)',
    [v.session_id,v.workspace_id,v.nonce,expires,v.keys,proof]);
  }catch(e){
   if(e?.code!=='P0001'||e?.message!==EXPECTED[mode])throw Error('SYNTHETIC_PROOF_DENIAL_UNEXPECTED_ERROR');
   denied=true;
  }
  if(!denied)throw Error('SYNTHETIC_PROOF_DENIAL_NOT_ENFORCED');
 }finally{
  try{if(began){const r=await c.query('ROLLBACK');if(r?.command!=='ROLLBACK')throw Error('SYNTHETIC_PROOF_DENIAL_ROLLBACK_UNVERIFIED');}}
  finally{c.release(true)}
 }
 return Object.freeze({status:'SYNTHETIC_PROOF_DENIED',case:mode,sqlstate:'P0001',production_qualified:false});
}
module.exports=Object.freeze({probe});
