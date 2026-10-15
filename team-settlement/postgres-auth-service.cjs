'use strict';

// M1 durable-auth candidate. Never creates a Pool, listens on a socket, or
// exposes Router/Telegram/production data. Requires reviewed auth DB privileges.
// Verify DB membership on every request, including after restart/role changes.
const crypto=require('node:crypto');
const {hashPassword,verifyPasswordAsync,PASSWORD_MIN,SESSION_TTL_MS}=require('./auth-contract.cjs');
const {actorFromServer}=require('./core-contract.cjs');
const KEY=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
function error(code){throw new Error(code);}
function key(value,code){if(typeof value!=='string'||!KEY.test(value))error(code);return value;}
function tokenHash(token){
  if(typeof token!=='string'||!/^[A-Za-z0-9_-]{32,128}$/.test(token))error('AUTH_SESSION_INVALID');
  return crypto.createHash('sha256').update(token).digest('hex');
}
const dummyHash=hashPassword('not-a-real-user-password',Buffer.alloc(16,0x4d));
// Dummy scrypt verification reduces username enumeration timing differences;
// it is not an alternative to HTTP rate limiting and secure credential handling.
function createPostgresAuthService({db,clock=()=>Date.now(),sessionTtlMs=SESSION_TTL_MS}={}){
  if(!db||typeof db.transaction!=='function'||typeof clock!=='function'||
      !Number.isSafeInteger(sessionTtlMs)||sessionTtlMs<=0||sessionTtlMs>24*60*60*1000)
    error('AUTH_PERSISTENCE_CONFIG_INVALID');

  async function scoped(tx,workspaceId){
    await tx.query("SELECT set_config('kts.workspace_id',$1,true)",[workspaceId]);
  }
  function rows(result){
    if(!result||!Array.isArray(result.rows))error('AUTH_DATABASE_RESULT_INVALID');
    return result.rows;
  }

  async function login({auth_subject,password,workspace_id}={}){
    key(auth_subject,'AUTH_LOGIN_DENIED');
    key(workspace_id,'AUTH_LOGIN_DENIED');
    if(typeof password!=='string'||password.length<PASSWORD_MIN||password.length>256)
      error('AUTH_LOGIN_DENIED');
    return db.transaction(async tx=>{
      await scoped(tx,workspace_id);
      const result=rows(await tx.query(
        `SELECT i.user_id,i.disabled_at,c.password_hash,m.team_role
           FROM kts_team.identities i
           JOIN kts_auth.credentials c ON c.user_id=i.user_id
           JOIN kts_team.memberships m ON m.user_id=i.user_id
          WHERE i.auth_subject=$1 AND m.workspace_id=$2
            AND m.revoked_at IS NULL`,[auth_subject,workspace_id]));
      const account=result.length===1?result[0]:null;
      const valid=await verifyPasswordAsync(password,account?account.password_hash:dummyHash);
      if(!account||account.disabled_at!==null||!valid)error('AUTH_LOGIN_DENIED');
      const now=clock();
      if(!Number.isSafeInteger(now)||now<0||!Number.isSafeInteger(now+sessionTtlMs))
        error('AUTH_CLOCK_INVALID');
      const token=crypto.randomBytes(32).toString('base64url');
      const expectedHash=tokenHash(token);
      const inserted=rows(await tx.query(
        `INSERT INTO kts_auth.sessions(session_hash,user_id,workspace_id,issued_at,expires_at)
         VALUES($1,$2,$3,$4::timestamptz,$5::timestamptz)
         RETURNING session_hash`,
        [expectedHash,account.user_id,workspace_id,
         new Date(now).toISOString(),new Date(now+sessionTtlMs).toISOString()]));
      // A successful SQL round trip is NOT a persisted login receipt.
      // Deny a bearer when a broken adapter returns no or inconsistent rows.
      if(inserted.length!==1||inserted[0]?.session_hash!==expectedHash)
        error('AUTH_DATABASE_RESULT_INVALID');
      return Object.freeze({session_token:token,expires_at:now+sessionTtlMs});
    });
  }

  async function verifySession(token,requestedWorkspace){
    const hash=tokenHash(token);
    return db.transaction(async tx=>{
      const now=clock();
      if(!Number.isSafeInteger(now)||now<0)error('AUTH_CLOCK_INVALID');
      const sessions=rows(await tx.query(
        `SELECT user_id,workspace_id
           FROM kts_auth.sessions
          WHERE session_hash=$1 AND revoked_at IS NULL AND expires_at > $2::timestamptz
          FOR SHARE`,[hash,new Date(now).toISOString()]));
      if(sessions.length!==1)error('AUTH_SESSION_INVALID');
      const session=sessions[0];
      if(requestedWorkspace!==undefined&&session.workspace_id!==requestedWorkspace)
        error('AUTH_WORKSPACE_DENIED');
      await scoped(tx,session.workspace_id);
      const members=rows(await tx.query(
        `SELECT m.team_role
           FROM kts_team.memberships m
           JOIN kts_team.identities i ON i.user_id=m.user_id
          WHERE m.workspace_id=$1 AND m.user_id=$2
            AND m.revoked_at IS NULL AND i.disabled_at IS NULL`,
        [session.workspace_id,session.user_id]));
      if(members.length!==1)error('AUTH_SESSION_REVOKED');
      const actor={server_verified:true,membership_active:true,
        user_id:session.user_id,workspace_id:session.workspace_id,role:members[0].team_role};
      actorFromServer(actor);
      return Object.freeze(actor);
    });
  }

  async function revokeSession(token){
    const hash=tokenHash(token);
    return db.transaction(async tx=>{
      const result=await tx.query(
        `UPDATE kts_auth.sessions SET revoked_at=now()
          WHERE session_hash=$1 AND revoked_at IS NULL`,[hash]);
      if(!result||!Number.isSafeInteger(result.rowCount)||
          result.rowCount<0||result.rowCount>1)
        error('AUTH_DATABASE_RESULT_INVALID');
      return result.rowCount===1;
    });
  }
  function unavailable(){error('AUTH_ADMIN_UNAVAILABLE');}
  return Object.freeze({login,verifySession,revokeSession,
    manageMembership:unavailable,setIdentityDisabled:unavailable});
}
module.exports=Object.freeze({createPostgresAuthService,tokenHash});
