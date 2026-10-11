'use strict';

// Explicit, read-only preflight for TWO supplied PostgreSQL Pool connections.
// Never creates pools, credentials, listening sockets or database objects.
// Synthetic candidate only; no live service admission from this result.
const PROBE_SQL = `SELECT current_user AS role,
  has_schema_privilege(current_user, 'kts_auth', 'USAGE') AS auth_schema,
  has_table_privilege(current_user, 'kts_team.scope_events', 'SELECT') AS event_read,
  has_function_privilege(current_user,
    'kts_team.append_draft(text,text,date,text,bigint,text,text,text,jsonb)',
    'EXECUTE') AS draft_execute,
  COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname=current_user),true) AS superuser,
  COALESCE((SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user),true) AS bypass_rls`;

function deny(){throw new Error('TEAM_DB_EFFECTIVE_ROLES_UNQUALIFIED');}
function requireClient(c){
  if(!c||typeof c.query!=='function'||typeof c.release!=='function')deny();
  return c;
}
async function qualifyIsolatedPoolRoles({authPool,ledgerPool,syntheticOnly=false}={}){
  if(syntheticOnly!==true)throw new Error('TEAM_RELEASE_NOT_AUTHORIZED');
  if(!authPool||!ledgerPool||authPool===ledgerPool||
     typeof authPool.connect!=='function'||typeof ledgerPool.connect!=='function')
    throw new Error('TEAM_DB_ROLES_NOT_ISOLATED');
  let a=null,l=null,qualified=false;
  try {
    a=await authPool.connect();
    requireClient(a);
    l=await ledgerPool.connect();
    requireClient(l);
    if(a===l)deny();
    const [authResult,ledgerResult]=await Promise.all([
      a.query(PROBE_SQL),l.query(PROBE_SQL)
    ]);
    const auth=authResult?.rows?.[0],ledger=ledgerResult?.rows?.[0];
    if(!auth||!ledger||authResult.rows.length!==1||ledgerResult.rows.length!==1 ||
       typeof auth.role!=='string'||!auth.role ||
       typeof ledger.role!=='string'||!ledger.role ||
       auth.role===ledger.role ||
       auth.superuser!==false || auth.bypass_rls!==false ||
       ledger.superuser!==false || ledger.bypass_rls!==false ||
       auth.auth_schema!==true || auth.event_read!==false ||
       auth.draft_execute!==false ||
       ledger.auth_schema!==false || ledger.event_read!==true ||
       ledger.draft_execute!==true)deny();
    qualified=true;
    return Object.freeze({qualified:true,auth_role:auth.role,ledger_role:ledger.role});
  } finally {
    // Failures destroy acquired clients so that a disputed role cannot be
    // reused. If distinct pool wrappers return one shared client, release once.
    if(l&&l!==a)try{l.release(!qualified);}catch{}
    if(a)try{a.release(!qualified);}catch{}
  }
}
module.exports=Object.freeze({qualifyIsolatedPoolRoles});
