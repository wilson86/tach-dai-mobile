'use strict';
// Default-off candidate, NOT a deployed signer or receipt reader. Its only
// responsibility is to prove live Auth session/membership inside ONE Auth DB
// transaction before allowing a trusted backend callback to produce a proof.
// SQL verifier MUST independently recheck revocation; this lock cannot span
// a separate Ledger transaction. Schema session_handle is not yet migrated.
const crypto = require('node:crypto');
const TOKEN = /^[A-Za-z0-9_-]{32,128}$/;
const HANDLE = /^[a-f0-9]{32}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const reject = () => { throw Error('TEAM_RECEIPT_V2_AUTH_DENIED'); };
function resultRows(result) {
  if (!result || !Array.isArray(result.rows)) reject();
  return result.rows;
}
function createReceiptV2AuthBoundary({db,clock=()=>Date.now(),enabled=false}={}) {
  if (!db || typeof db.transaction !== 'function' || typeof clock !== 'function' ||
      typeof enabled !== 'boolean') reject();
  async function authorizeReceiptRead(token,backendCallback) {
    if (!enabled) throw Error('TEAM_RECEIPT_V2_NOT_ENABLED');
    if (typeof token !== 'string' || !TOKEN.test(token) ||
        typeof backendCallback !== 'function') reject();
    const timestamp=clock();
    if (!Number.isSafeInteger(timestamp) || timestamp < 0) reject();
    const hash=crypto.createHash('sha256').update(token,'utf8').digest('hex');
    // Never return the bearer or its hash to backendCallback or Ledger.
    return db.transaction(async tx => {
      if (!tx || typeof tx.query !== 'function') reject();
      const sessions=resultRows(await tx.query(
        `SELECT session_handle,user_id,workspace_id
           FROM kts_auth.sessions
          WHERE session_hash=$1 AND revoked_at IS NULL
            AND expires_at > $2::timestamptz
          FOR SHARE`,[hash,new Date(timestamp).toISOString()]));
      if (sessions.length !== 1) reject();
      const s=sessions[0];
      if (!s || typeof s !== 'object' ||
          typeof s.session_handle !== 'string' || !HANDLE.test(s.session_handle) ||
          typeof s.user_id !== 'string' || !ID.test(s.user_id) ||
          typeof s.workspace_id !== 'string' || !ID.test(s.workspace_id)) reject();
      const scoped=resultRows(await tx.query(
        "SELECT set_config('kts.workspace_id',$1,true) AS workspace_id",[s.workspace_id]));
      if (scoped.length!==1 || scoped[0]?.workspace_id!==s.workspace_id) reject();
      const active=resultRows(await tx.query(
        `SELECT m.team_role
           FROM kts_team.memberships m
           JOIN kts_team.identities i ON i.user_id=m.user_id
          WHERE m.workspace_id=$1 AND m.user_id=$2
            AND m.revoked_at IS NULL AND i.disabled_at IS NULL
          FOR SHARE OF m,i`,[s.workspace_id,s.user_id]));
      if (active.length !== 1 || !['admin','operator'].includes(active[0]?.team_role)) reject();
      // Connection acquisition and row-lock waits can outlive the timestamp
      // captured before entering the transaction. Check database wall time
      // again immediately before invoking the signer; the verifier must still
      // independently enforce session validity after this transaction ends.
      const fresh=resultRows(await tx.query(
        `SELECT session_handle,user_id,workspace_id
           FROM kts_auth.sessions
          WHERE session_hash=$1 AND revoked_at IS NULL
            AND expires_at > pg_catalog.clock_timestamp()
          FOR SHARE`,[hash]));
      if(fresh.length!==1||fresh[0]?.session_handle!==s.session_handle||
         fresh[0]?.user_id!==s.user_id||fresh[0]?.workspace_id!==s.workspace_id)reject();
      // Caller must be trusted backend code; this callback is never exposed
      // through HTTP, never accepted from browser JSON, and never persisted.
      const identity=Object.freeze({server_verified:true,membership_active:true,
        session_handle:s.session_handle,user_id:s.user_id,
        workspace_id:s.workspace_id,role:active[0].team_role});
      return backendCallback(identity);
    });
  }
  return Object.freeze({authorizeReceiptRead});
}
module.exports=Object.freeze({createReceiptV2AuthBoundary});
