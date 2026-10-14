'use strict';

// PostgreSQL repository boundary. The caller supplies a reviewed transaction
// adapter; this module never opens a connection, selects a database, or
// falls back to KTS Router SQLite. It delegates draft atomicity to the
// SECURITY INVOKER kts_team.append_draft() function.

const C = require('./core-contract.cjs');
const HASH_RE = /^[a-f0-9]{64}$/;

const MAX_FEED_SEQ = 9223372036854775807n;

function normalizedFeedSeq(value) {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint')
    throw new Error('TEAM_CURSOR_INVALID');
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0))
    throw new Error('TEAM_CURSOR_INVALID');
  const str=String(value);
  if (!/^(0|[1-9][0-9]{0,18})$/.test(str)) throw new Error('TEAM_CURSOR_INVALID');
  if (BigInt(str)>MAX_FEED_SEQ) throw new Error('TEAM_CURSOR_INVALID');
  return str;
}

function encodeCursor(feedSeq, workspaceId) {
  if (typeof workspaceId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(workspaceId))
    throw new Error('TEAM_CURSOR_INVALID');
  return Buffer.from(JSON.stringify({
    feed_seq: normalizedFeedSeq(feedSeq), workspace_id: workspaceId
  }),'utf8').toString('base64url');
}

function decodeCursor(cursor, workspaceId) {
  if (cursor === null || cursor === undefined || cursor === '') return { feed_seq: '0' };
  if (typeof cursor !== 'string' || cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(cursor))
    throw new Error('TEAM_CURSOR_INVALID');
  try {
    const parsed = JSON.parse(Buffer.from(cursor,'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
        Object.keys(parsed).length !== 2 ||
        !Object.prototype.hasOwnProperty.call(parsed,'feed_seq') ||
        !Object.prototype.hasOwnProperty.call(parsed,'workspace_id') ||
        parsed.workspace_id !== workspaceId ||
        typeof parsed.feed_seq !== 'string' ||
        encodeCursor(parsed.feed_seq,workspaceId) !== cursor) throw new Error();
    return { feed_seq: normalizedFeedSeq(parsed.feed_seq) };
  } catch { throw new Error('TEAM_CURSOR_INVALID'); }
}

function assertHash(value, code = 'TEAM_REQUEST_INVALID') {
  if (typeof value !== 'string' || !HASH_RE.test(value)) throw new Error(code);
  return value;
}

function assertDb(db) {
  if (!db || typeof db.transaction !== 'function') throw new Error('TEAM_DB_ADAPTER_REQUIRED');
}

function createPostgresLedgerRepository({ db } = {}) {
  assertDb(db);

  async function inScopeTransaction(actor, scope, work) {
    const trustedActor = C.actorFromServer(actor);
    const checked = C.requireScope(scope);
    if (checked.workspace_id !== trustedActor.workspace_id) throw new Error('TEAM_WORKSPACE_DENIED');
    return inActorTransaction(actor, (tx, verifiedActor) => work(tx, checked, verifiedActor));
  }

  async function inActorTransaction(actor, work, { readOnly = false } = {}) {
    const trustedActor = C.actorFromServer(actor);
    return db.transaction(async tx => {
      if (!tx || typeof tx.query !== 'function') throw new Error('TEAM_DB_TRANSACTION_INVALID');
      // Recovery reconciliation can never mutate a ledger even when called
      // with an injected transaction adapter accidentally holding writer rights.
      // PostgreSQL requires SET TRANSACTION before the first SELECT.
      if (readOnly) await tx.query('SET TRANSACTION READ ONLY');
      await tx.query(
        "SELECT set_config('kts.workspace_id',$1,true), set_config('kts.actor_user_id',$2,true)",
        [trustedActor.workspace_id, trustedActor.user_id]
      );
      // An in-memory signed-in actor is insufficient after an account/role
      // has been revoked or changed in the authoritative database.
      // Recheck membership and disabled identity inside EVERY ledger transaction,
      // including read-only change-feed queries. Never trust browser role claims.
      const membership = await tx.query(
        `SELECT m.team_role
           FROM kts_team.memberships m
           JOIN kts_team.identities i ON i.user_id=m.user_id
          WHERE m.workspace_id=$1 AND m.user_id=$2
            AND m.revoked_at IS NULL AND i.disabled_at IS NULL`,
        [trustedActor.workspace_id, trustedActor.user_id]
      );
      if (!membership || !Array.isArray(membership.rows) ||
          membership.rows.length !== 1 ||
          membership.rows[0].team_role !== trustedActor.role)
        throw new Error('AUTH_SESSION_REVOKED');
      return work(tx, trustedActor);
    });
  }

  async function appendDraft(actor, {
    scope, expected_revision, event_id, idempotency_key, request_sha256, snapshot
  } = {}) {
    const checked = C.requireScope(scope);
    if (!Number.isSafeInteger(expected_revision) || expected_revision < 0) throw new Error('TEAM_REVISION_INVALID');
    if (typeof event_id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(event_id)) throw new Error('TEAM_REQUEST_INVALID');
    if (typeof idempotency_key !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(idempotency_key)) throw new Error('TEAM_IDEMPOTENCY_KEY_REQUIRED');
    assertHash(request_sha256);
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw new Error('TEAM_DRAFT_SNAPSHOT_INVALID');
    return inScopeTransaction(actor, checked, async tx => {
      const result = await tx.query(
        `SELECT kts_team.append_draft(
          $1::text,$2::text,$3::date,$4::text,$5::bigint,
          $6::text,$7::text,$8::text,$9::jsonb
        ) AS result`,
        [checked.workspace_id, checked.partner_id, checked.business_date, checked.region,
          expected_revision, event_id, idempotency_key, request_sha256, JSON.stringify(snapshot)]
      );
      if (!result || !Array.isArray(result.rows) || result.rows.length !== 1) throw new Error('TEAM_DB_RESULT_INVALID');
      return result.rows[0].result;
    });
  }


  // PostgreSQL function rechecks session roles, transaction state, CAS, SoD and RLS.
  async function advanceReview(actor,{scope,action,expected_revision,event_id,idempotency_key,request_sha256}={}) {
    if(!['submit_review','approve_review'].includes(action))throw Error('TEAM_REVIEW_ACTION_FORBIDDEN');
    const checked=C.requireScope(scope);
    if(!Number.isSafeInteger(expected_revision)||expected_revision<0||!Number.isSafeInteger(expected_revision+1))
      throw Error('TEAM_REVISION_INVALID');
    if(typeof event_id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(event_id))
      throw Error('TEAM_REQUEST_INVALID');
    if(typeof idempotency_key!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(idempotency_key))
      throw Error('TEAM_IDEMPOTENCY_KEY_REQUIRED');
    assertHash(request_sha256);
    return inScopeTransaction(actor,checked,async tx=>{
      const result=await tx.query(
        `SELECT kts_team.advance_review($1::text,$2::text,$3::date,$4::text,$5::text,
          $6::bigint,$7::text,$8::text,$9::text) AS result`,
        [checked.workspace_id,checked.partner_id,checked.business_date,checked.region,
          action,expected_revision,event_id,idempotency_key,request_sha256]
      );
      if(!result||!Array.isArray(result.rows)||result.rows.length!==1)
        throw Error('TEAM_DB_RESULT_INVALID');
      return result.rows[0].result;
    });
  }

  async function getScope(actor, scope) {
    return inScopeTransaction(actor, scope, async tx => {
      const result = await tx.query(
        `SELECT workspace_id,partner_id,business_date::text AS business_date,region,
                state,revision,submitted_by,reviewed_by,verified_kqxs_sha256,locked_at
           FROM kts_team.scopes
          WHERE workspace_id=$1 AND partner_id=$2 AND business_date=$3::date AND region=$4`,
        [scope.workspace_id, scope.partner_id, scope.business_date, scope.region]
      );
      if (!result || !Array.isArray(result.rows)) throw new Error('TEAM_DB_RESULT_INVALID');
      if (result.rows.length === 0) throw new Error('TEAM_SCOPE_NOT_FOUND');
      return Object.freeze({ ...result.rows[0] });
    });
  }

  async function getChanges(actor, { cursor = null, limit = 100 } = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new Error('TEAM_LIMIT_INVALID');
    const verifiedActor = C.actorFromServer(actor);
    const after = decodeCursor(cursor, verifiedActor.workspace_id);
    return inActorTransaction(actor, async (tx, trustedActor) => {
      const result = await tx.query(
        `SELECT workspace_id,event_id,partner_id,business_date::text AS business_date,region,
                scope_revision,feed_seq,actor_user_id,event_kind,payload_sha256,result_snapshot,recorded_at
           FROM kts_team.scope_events
          WHERE workspace_id=$1 AND feed_seq > $2::bigint
          ORDER BY feed_seq
          LIMIT $3::int`,
        [trustedActor.workspace_id, after.feed_seq, limit + 1]
      );
      if (!result || !Array.isArray(result.rows) ||
          result.rows.length > limit + 1) throw new Error('TEAM_DB_RESULT_INVALID');
      // Defense in depth: a stale/misrouted SQL adapter must never skip feed
      // events or leak a different tenant, even if database RLS is misconfigured.
      let previous = BigInt(after.feed_seq);
      for (const row of result.rows) {
        if (!row || typeof row !== 'object' || Array.isArray(row) ||
            row.workspace_id !== trustedActor.workspace_id)
          throw new Error('TEAM_FEED_RESPONSE_UNVERIFIED');
        let sequence;
        try { sequence = BigInt(normalizedFeedSeq(row.feed_seq)); }
        catch { throw new Error('TEAM_FEED_RESPONSE_UNVERIFIED'); }
        // A per-workspace sequence is allocated only inside the event commit.
        // A gap means the SQL adapter omitted an immutable event: reject the
        // whole page instead of issuing a cursor that permanently skips it.
        if (sequence !== previous + 1n) throw new Error('TEAM_FEED_RESPONSE_UNVERIFIED');
        previous = sequence;
      }
      const hasMore = result.rows.length > limit;
      const items = result.rows.slice(0, limit).map(row => Object.freeze({ ...row }));
      const last = items.at(-1);
      return Object.freeze({
        items,
        // The last full/partial page also advances the cursor. Otherwise
        // successive polls replay the terminal page forever.
        next_cursor: last ? encodeCursor(last.feed_seq, trustedActor.workspace_id) : null,
        has_more: hasMore,
        sync_status: 'SYNCED'
      });
    });
  }


  // DEFAULT OFF: read-only recovery proof; not exposed by HTTP or the PWA.
  // The active DB membership is rechecked by inActorTransaction, followed by
  // an actor/tenant-limited receipt-event JOIN in the very same transaction.
  async function lookupRecoveryReceipts(actor,keys){
    const a=C.actorFromServer(actor);
    if(!['admin','operator'].includes(a.role))
      throw Error('TEAM_RECOVERY_ROLE_DENIED');
    if(!Array.isArray(keys)||keys.length<1||keys.length>30||
       new Set(keys).size!==keys.length||
       keys.some(k=>typeof k!=='string'||!/^draft_[a-f0-9]{32}$/.test(k)))
      throw Error('TEAM_RECOVERY_KEY_INVALID');
    const result=await inActorTransaction(actor,async(tx,trusted)=>{
      const queried=await tx.query(
        `SELECT r.workspace_id,r.idempotency_key,r.request_sha256,
                e.event_id,e.actor_user_id,e.partner_id,
                e.business_date::text AS business_date,e.region,
                e.scope_revision,e.feed_seq,e.event_kind,e.payload_sha256
           FROM kts_team.idempotency_receipts r
           JOIN kts_team.scope_events e
             ON e.workspace_id=r.workspace_id AND e.event_id=r.event_id
          WHERE r.workspace_id=$1 AND e.actor_user_id=$2
            AND r.idempotency_key=ANY($3::text[])
          ORDER BY r.idempotency_key`,
        [trusted.workspace_id,trusted.user_id,keys]
      );
      if(!queried||!Array.isArray(queried.rows)||queried.rows.length>keys.length)
        throw Error('TEAM_RECOVERY_RECEIPT_UNVERIFIED');
      const allowed=new Set(keys),seen=new Set();
      return queried.rows.map(row=>{
        if(!row||typeof row!=='object'||Array.isArray(row)||
           row.workspace_id!==trusted.workspace_id||
           row.actor_user_id!==trusted.user_id||
           !allowed.has(row.idempotency_key)||
           seen.has(row.idempotency_key))
          throw Error('TEAM_RECOVERY_RECEIPT_UNVERIFIED');
        seen.add(row.idempotency_key);
        return Object.freeze({...row});
      });
    }, {readOnly:true});
    return Object.freeze(result);
  }
  return Object.freeze({ appendDraft, advanceReview, getScope, getChanges,
    lookupRecoveryReceipts });
}

module.exports = Object.freeze({ createPostgresLedgerRepository, encodeCursor, decodeCursor });
