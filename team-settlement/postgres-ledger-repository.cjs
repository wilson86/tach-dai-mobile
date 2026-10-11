'use strict';

// PostgreSQL repository boundary. The caller supplies a reviewed transaction
// adapter; this module never opens a connection, selects a database, or
// falls back to KTS Router SQLite. It delegates draft atomicity to the
// SECURITY INVOKER kts_team.append_draft() function.

const C = require('./core-contract.cjs');
const HASH_RE = /^[a-f0-9]{64}$/;

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
    return db.transaction(async tx => {
      if (!tx || typeof tx.query !== 'function') throw new Error('TEAM_DB_TRANSACTION_INVALID');
      await tx.query(
        "SELECT set_config('kts.workspace_id',$1,true), set_config('kts.actor_user_id',$2,true)",
        [checked.workspace_id, trustedActor.user_id]
      );
      return work(tx, checked, trustedActor);
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

  return Object.freeze({ appendDraft, getScope });
}

module.exports = Object.freeze({ createPostgresLedgerRepository });
