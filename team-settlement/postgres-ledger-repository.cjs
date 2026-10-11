'use strict';

// PostgreSQL repository boundary. The caller supplies a reviewed transaction
// adapter; this module never opens a connection, selects a database, or
// falls back to KTS Router SQLite. It delegates draft atomicity to the
// SECURITY INVOKER kts_team.append_draft() function.

const C = require('./core-contract.cjs');
const HASH_RE = /^[a-f0-9]{64}$/;

function encodeCursor(recordedAt, eventId) {
  return Buffer.from(JSON.stringify({ recorded_at: new Date(recordedAt).toISOString(), event_id: String(eventId) }), 'utf8').toString('base64url');
}

function decodeCursor(cursor) {
  if (cursor === null || cursor === undefined || cursor === '') return { recorded_at: '1970-01-01T00:00:00.000Z', event_id: '' };
  if (typeof cursor !== 'string' || cursor.length > 512) throw new Error('TEAM_CURSOR_INVALID');
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed.recorded_at !== 'string' || typeof parsed.event_id !== 'string' ||
        Number.isNaN(Date.parse(parsed.recorded_at)) || parsed.event_id.length < 1 || parsed.event_id.length > 128)
      throw new Error();
    return { recorded_at: new Date(parsed.recorded_at).toISOString(), event_id: parsed.event_id };
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

  async function inActorTransaction(actor, work) {
    const trustedActor = C.actorFromServer(actor);
    return db.transaction(async tx => {
      if (!tx || typeof tx.query !== 'function') throw new Error('TEAM_DB_TRANSACTION_INVALID');
      await tx.query(
        "SELECT set_config('kts.workspace_id',$1,true), set_config('kts.actor_user_id',$2,true)",
        [trustedActor.workspace_id, trustedActor.user_id]
      );
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
    const after = decodeCursor(cursor);
    return inActorTransaction(actor, async (tx, trustedActor) => {
      const result = await tx.query(
        `SELECT event_id,partner_id,business_date::text AS business_date,region,
                scope_revision,actor_user_id,event_kind,payload_sha256,result_snapshot,recorded_at
           FROM kts_team.scope_events
          WHERE workspace_id=$1
            AND (recorded_at,event_id)>($2::timestamptz,$3::text)
          ORDER BY recorded_at,event_id
          LIMIT $4::int`,
        [trustedActor.workspace_id, after.recorded_at, after.event_id, limit + 1]
      );
      if (!result || !Array.isArray(result.rows)) throw new Error('TEAM_DB_RESULT_INVALID');
      const hasMore = result.rows.length > limit;
      const items = result.rows.slice(0, limit).map(row => Object.freeze({ ...row }));
      const last = items.at(-1);
      return Object.freeze({
        items,
        next_cursor: hasMore && last ? encodeCursor(last.recorded_at, last.event_id) : null,
        sync_status: 'SYNCED'
      });
    });
  }

  return Object.freeze({ appendDraft, getScope, getChanges });
}

module.exports = Object.freeze({ createPostgresLedgerRepository, encodeCursor, decodeCursor });
