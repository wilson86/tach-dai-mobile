'use strict';

// Server API composition seam: authenticated session -> trusted actor ->
// canonical request digest -> injected PostgreSQL repository. This module is
// still a contract layer; it does not open sockets, calculate money, or select
// a database. The repository owns the transaction/CAS/idempotency boundary.

const crypto = require('node:crypto');
const C = require('./core-contract.cjs');
const { stable } = require('./ledger-api-contract.cjs');

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function createServerLedgerApi({ auth, repository, eventId = () => `event_${crypto.randomBytes(12).toString('hex')}` } = {}) {
  if (!auth || typeof auth.verifySession !== 'function' || !repository ||
      typeof repository.appendDraft !== 'function' || typeof repository.getScope !== 'function' ||
      typeof eventId !== 'function') throw new Error('TEAM_SERVER_API_CONFIG_INVALID');

  async function actor(sessionToken) {
    const trusted = await auth.verifySession(sessionToken);
    C.actorFromServer(trusted);
    return trusted;
  }

  async function appendDraft(sessionToken, input) {
    const trustedActor = await actor(sessionToken);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('TEAM_INTENT_INVALID');
    const scope = C.requireScope(input.scope);
    if (scope.workspace_id !== trustedActor.workspace_id) throw new Error('TEAM_WORKSPACE_DENIED');
    if (!['create_draft', 'edit_draft'].includes(input.action || 'create_draft')) throw new Error('TEAM_INTENT_ACTION_FORBIDDEN');
    if (!Number.isSafeInteger(input.expected_revision) || input.expected_revision < 0) throw new Error('TEAM_REVISION_INVALID');
    if (input.offline === true) throw new Error('TEAM_OFFLINE_NOT_AUTHORITATIVE');
    if (!input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)) throw new Error('TEAM_PAYLOAD_INVALID');
    const request_sha256 = digest({
      action: input.action || 'create_draft', scope, expected_revision: input.expected_revision, payload: input.payload
    });
    const result = await repository.appendDraft(trustedActor, {
      scope, expected_revision: input.expected_revision, event_id: eventId(),
      idempotency_key: input.idempotency_key, request_sha256, snapshot: stable(input.payload)
    });
    return Object.freeze({ ...result, scope_key: C.scopeKey(scope), sync_status: 'SYNCED' });
  }

  async function getScope(sessionToken, scope) {
    const trustedActor = await actor(sessionToken);
    return repository.getScope(trustedActor, C.requireScope(scope));
  }

  async function getChanges(sessionToken, options) {
    const trustedActor = await actor(sessionToken);
    if (typeof repository.getChanges !== 'function') throw new Error('TEAM_ROUTE_NOT_ENABLED');
    return repository.getChanges(trustedActor, options);
  }

  return Object.freeze({ appendDraft, getScope, getChanges });
}

module.exports = Object.freeze({ digest, createServerLedgerApi });
