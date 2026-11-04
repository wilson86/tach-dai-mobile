'use strict';
// Test-only, default-off preparation. The supplied pool must be a separately
// authenticated synthetic role with NO candidate function EXECUTE privilege.
const {vector}=require('./session-bound-receipt-vectors.cjs');
async function probe({pool,syntheticOnly=false,input}={}){
 if(syntheticOnly!==true||!pool||typeof pool.connect!=='function')throw Error('SYNTHETIC_EXECUTE_DENIAL_DISABLED');
 const v=vector(input),c=await pool.connect();
 if(!c||typeof c.query!=='function'||typeof c.release!=='function'){
  try{c?.release?.(true)}catch(_){}
  throw Error('SYNTHETIC_EXECUTE_DENIAL_CLIENT_INVALID');
 }
 let began=false,denied=false;
 try{
  await c.query('BEGIN');began=true;
  await c.query('SET TRANSACTION READ ONLY');
  const auth=await c.query('SELECT current_user::text AS role, session_user::text AS session_role');
  if(auth?.rows?.length!==1||auth.rows[0].role!=='synthetic_receipt_unprivileged'||
     auth.rows[0].session_role!=='synthetic_receipt_unprivileged')throw Error('SYNTHETIC_EXECUTE_DENIAL_ROLE_INVALID');
  const catalog=await c.query("SELECT has_schema_privilege(current_user,'kts_team','USAGE') AS schema_usage, to_regprocedure('kts_team.candidate_receipt_read_v1(text,text,text,bigint,text[],text)') IS NOT NULL AS function_present, has_function_privilege(current_user,to_regprocedure('kts_team.candidate_receipt_read_v1(text,text,text,bigint,text[],text)'),'EXECUTE') AS can_execute");
  if(catalog?.rows?.length!==1||catalog.rows[0].schema_usage!==true||catalog.rows[0].function_present!==true||catalog.rows[0].can_execute!==false)
   throw Error('SYNTHETIC_EXECUTE_DENIAL_PREREQUISITE_INVALID');
  try{
   await c.query('SELECT * FROM kts_team.candidate_receipt_read_v1($1,$2,$3,$4,$5,$6)',
    [v.session_id,v.workspace_id,v.nonce,v.expires,v.keys,v.proof]);
  }catch(e){if(e?.code!=='42501')throw Error('SYNTHETIC_EXECUTE_DENIAL_UNEXPECTED_SQLSTATE');denied=true;}
  if(!denied)throw Error('SYNTHETIC_EXECUTE_DENIAL_NOT_ENFORCED');
 }finally{
  try{if(began){const r=await c.query('ROLLBACK');if(r?.command!=='ROLLBACK')throw Error('SYNTHETIC_EXECUTE_DENIAL_ROLLBACK_UNVERIFIED');}}
  finally{c.release(true)}
 }
 return Object.freeze({status:'SYNTHETIC_EXECUTE_DENIED',sqlstate:'42501',production_qualified:false});
}
module.exports=Object.freeze({probe});
