'use strict';
// Deliberate synthetic-only security diagnostic. This proves whether a database
// LOGIN with existing receipt SELECT privilege can change the caller-settable
// custom tenant GUC inside its own READ ONLY transaction. No operational QA.
const EXPECTED_ROLE='synthetic_recovery_ledger';
const TABLE='kts_team.idempotency_receipts';
function deny(code){throw Error(code)}
async function observeSyntheticTenantGucExposure({pool,syntheticOnly=false}={}){
 if(syntheticOnly!==true||!pool||typeof pool.connect!=='function')
   deny('TEAM_GUC_PROBE_SYNTHETIC_ONLY');
 const client=await pool.connect();
 if(!client||typeof client.query!=='function'||typeof client.release!=='function')
   deny('TEAM_GUC_PROBE_CLIENT_INVALID');
 let began=false;
 try{
   await client.query('BEGIN');
   began=true;
   await client.query('SET TRANSACTION READ ONLY');
   const authority=await client.query('SELECT current_user::text AS role, session_user::text AS session_role');
   if(!Array.isArray(authority?.rows)||authority.rows.length!==1||
      authority.rows[0].role!==EXPECTED_ROLE||
      authority.rows[0].session_role!==EXPECTED_ROLE)
      deny('TEAM_GUC_PROBE_ROLE_UNVERIFIED');
   const scoped=async tenant=>{
     const config=await client.query("SELECT set_config('kts.workspace_id',$1,true) AS effective_workspace",[tenant]);
     if(config?.rows?.length!==1||config.rows[0].effective_workspace!==tenant)
       deny('TEAM_GUC_PROBE_SETTING_UNVERIFIED');
     const result=await client.query(
       "SELECT count(*)::int AS count FROM "+TABLE+" WHERE workspace_id=$1 AND idempotency_key=$2",
       ['group_b','req_1']);
     if(!Array.isArray(result?.rows)||result.rows.length!==1||
       !Number.isInteger(result.rows[0].count)||result.rows[0].count<0||result.rows[0].count>1)
       deny('TEAM_GUC_PROBE_RESULT_UNVERIFIED');
     return result.rows[0].count;
   };
   // A fixture admin planted one receipt belonging ONLY to group_b.
   // group_a should not see it even with a SELECT privilege.
   const before=await scoped('group_a');
   const after=await scoped('group_b');
   if(before!==0||after!==1)deny('TEAM_GUC_PROBE_FIXTURE_INCONCLUSIVE');
   // Do NOT log query rows, password, token, hashes, or fixture identifiers.
   return Object.freeze({status:'SYNTHETIC_CALLER_WRITABLE_GUC_EXPOSURE_OBSERVED',
     direct_role_can_switch_tenant:true,server_http_scope_qualified:false,
     db_connection_compromise_isolated:false,production_qualified:false,
     write_block:'ENABLED'});
 } finally {
   if(began)try{await client.query('ROLLBACK')}catch(_){}
   client.release(true);
 }
}
module.exports=Object.freeze({observeSyntheticTenantGucExposure});
