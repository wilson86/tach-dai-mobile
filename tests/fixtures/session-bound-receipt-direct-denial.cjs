'use strict';
// TEST-ONLY preparation for a future reviewed synthetic cluster; no pool is
// created, and no SQL executes unless a caller explicitly supplies one.
// A passing fixture test is not a PostgreSQL or production security result.
async function probe({pool,syntheticOnly=false}={}){
 if(syntheticOnly!==true||!pool||typeof pool.connect!=='function')
  throw Error('SYNTHETIC_DIRECT_DENIAL_DISABLED');
 const c=await pool.connect();
 if(!c||typeof c.query!=='function'||typeof c.release!=='function'){
  try{c?.release?.(true)}catch(_){}
  throw Error('SYNTHETIC_DIRECT_DENIAL_CLIENT_INVALID');
 }
 let begun=false,denied=false;
 try{
  await c.query('BEGIN');begun=true;
  await c.query('SET TRANSACTION READ ONLY');
  const auth=await c.query('SELECT current_user::text AS role, session_user::text AS session_role');
  if(auth?.rows?.length!==1||auth.rows[0].role!=='synthetic_receipt_ledger'||
     auth.rows[0].session_role!=='synthetic_receipt_ledger')
    throw Error('SYNTHETIC_DIRECT_DENIAL_ROLE_INVALID');
  const guc=await c.query("SELECT set_config('kts.workspace_id',$1,true) AS workspace",['synthetic_group_b']);
  if(guc?.rows?.length!==1||guc.rows[0].workspace!=='synthetic_group_b')
   throw Error('SYNTHETIC_DIRECT_DENIAL_GUC_UNVERIFIED');
  try{
   await c.query('SELECT count(*) FROM kts_team.idempotency_receipts WHERE workspace_id=$1', ['synthetic_group_b']);
  }catch(e){if(e?.code!=='42501')throw Error('SYNTHETIC_DIRECT_DENIAL_UNEXPECTED_SQLSTATE');denied=true;}
  if(!denied)throw Error('SYNTHETIC_DIRECT_DENIAL_NOT_ENFORCED');
 }finally{
  try{if(begun){const r=await c.query('ROLLBACK');if(r?.command!=='ROLLBACK')throw Error('SYNTHETIC_DIRECT_DENIAL_ROLLBACK_UNVERIFIED');}}
  finally{c.release(true)}
 }
 return Object.freeze({status:'SYNTHETIC_DIRECT_SELECT_DENIED',sqlstate:'42501',production_qualified:false});
}
module.exports=Object.freeze({probe});
