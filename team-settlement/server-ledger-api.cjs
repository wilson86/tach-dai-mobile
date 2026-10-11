'use strict';

// Server API composition seam: authenticated session -> trusted actor ->
// canonical request digest -> injected PostgreSQL repository. This module is
// still a contract layer; it does not open sockets, calculate money, or select
// a database. The repository owns the transaction/CAS/idempotency boundary.

const crypto = require('node:crypto');
const C = require('./core-contract.cjs');
const { stable } = require('./ledger-api-contract.cjs');

// Do not advertise a financial draft as SYNCED merely because SQL/HTTP
// returned successfully. The durable draft SQL function issues these exact
// receipt fields; idempotent replays return the original event ID.
const EVENT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
function requireVerifiedDraftReceipt(result, proposedEventId, expectedRevision) {
  if (!result || typeof result !== 'object' || Array.isArray(result) ||
      typeof result.event_id !== 'string' || !EVENT_ID_RE.test(result.event_id) ||
      typeof result.replayed !== 'boolean' ||
      !Number.isSafeInteger(result.new_revision) ||
      result.new_revision !== expectedRevision + 1 ||
      (!result.replayed && result.event_id !== proposedEventId)) {
    throw new Error('TEAM_DRAFT_RECEIPT_UNVERIFIED');
  }
  return result;
}


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
    if (!Number.isSafeInteger(input.expected_revision) || input.expected_revision < 0 ||
        !Number.isSafeInteger(input.expected_revision + 1)) throw new Error('TEAM_REVISION_INVALID');
    if (input.offline === true) throw new Error('TEAM_OFFLINE_NOT_AUTHORITATIVE');
    if (!input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)) throw new Error('TEAM_PAYLOAD_INVALID');
    const request_sha256 = digest({
      action: input.action || 'create_draft', scope, expected_revision: input.expected_revision, payload: input.payload
    });
    const proposedEventId = eventId();
    const result = await repository.appendDraft(trustedActor, {
      scope, expected_revision: input.expected_revision, event_id: proposedEventId,
      idempotency_key: input.idempotency_key, request_sha256, snapshot: stable(input.payload)
    });
    const verified = requireVerifiedDraftReceipt(result, proposedEventId, input.expected_revision);
    return Object.freeze({ ...verified, scope_key: C.scopeKey(scope), sync_status: 'SYNCED' });
  }

  async function getScope(sessionToken, scope) {
    const trustedActor = await actor(sessionToken);
    const checked = C.requireScope(scope);
    if (checked.workspace_id !== trustedActor.workspace_id)
      throw new Error('TEAM_WORKSPACE_DENIED');
    const result = await repository.getScope(trustedActor, checked);
    // An injected repository or stale cache must not leak another financial
    // scope even if the HTTP handler and the browser validate independently.
    if (!result || typeof result !== 'object' || Array.isArray(result) ||
        result.workspace_id !== checked.workspace_id ||
        result.partner_id !== checked.partner_id ||
        result.business_date !== checked.business_date ||
        result.region !== checked.region)
      throw new Error('TEAM_SCOPE_RESPONSE_UNVERIFIED');
    return result;
  }

  async function getChanges(sessionToken, options) {
    const trustedActor = await actor(sessionToken);
    if (typeof repository.getChanges !== 'function') throw new Error('TEAM_ROUTE_NOT_ENABLED');
    return repository.getChanges(trustedActor, options);
  }

  return Object.freeze({ appendDraft, getScope, getChanges });
}

module.exports = Object.freeze({ digest, createServerLedgerApi });
