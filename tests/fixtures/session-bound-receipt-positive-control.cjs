'use strict';
// Prepared synthetic-only injected-pool control, not a production signer or
// proof of PostgreSQL security. The caller must seed a reviewed scratch DB.
const {vector}=require('./session-bound-receipt-vectors.cjs');
async function probe({pool,syntheticOnly=false,input}={}){
 if(syntheticOnly!==true||!pool||typeof pool.connect!=='function')throw Error('SYNTHETIC_POSITIVE_DISABLED');
 const v=vector(input),c=await pool.connect();
 if(!c||typeof c.query!=='function'||typeof c.release!=='function'){
  try{c?.release?.(true)}catch(_){}
  throw Error('SYNTHETIC_POSITIVE_CLIENT_INVALID');
 }
 let began=false;
 try{
  await c.query('BEGIN');began=true;
  await c.query('SET TRANSACTION READ ONLY');
  const auth=await c.query('SELECT current_user::text AS role, session_user::text AS session_role');
  if(auth?.rows?.length!==1||auth.rows[0].role!=='synthetic_receipt_ledger'||
     auth.rows[0].session_role!=='synthetic_receipt_ledger')throw Error('SYNTHETIC_POSITIVE_ROLE_INVALID');
  const result=await c.query('SELECT * FROM kts_team.candidate_receipt_read_v1($1,$2,$3,$4,$5,$6)',
   [v.session_id,v.workspace_id,v.nonce,v.expires,v.keys,v.proof]);
  if(!Array.isArray(result?.rows)||result.rows.length!==1||
     result.rows[0].workspace_id!==v.workspace_id||result.rows[0].actor_user_id!=='synthetic_operator'||
     !v.keys.includes(result.rows[0].idempotency_key))throw Error('SYNTHETIC_POSITIVE_RECEIPT_INVALID');
 }finally{
  try{if(began){const r=await c.query('ROLLBACK');if(r?.command!=='ROLLBACK')throw Error('SYNTHETIC_POSITIVE_ROLLBACK_UNVERIFIED');}}
  finally{c.release(true)}
 }
 return Object.freeze({status:'SYNTHETIC_POSITIVE_CONTROL',production_qualified:false});
}
module.exports=Object.freeze({probe});
