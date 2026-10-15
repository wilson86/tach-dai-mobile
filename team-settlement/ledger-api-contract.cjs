'use strict';

// Synthetic M1 API boundary. This is an in-memory contract implementation,
// not a replacement for the PostgreSQL transaction function or a production
// HTTP service. It demonstrates the server-side invariants before a reviewed
// repository adapter is wired to the isolated database.

const crypto = require('node:crypto');
const C = require('./core-contract.cjs');

function stable(value) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol')
      throw new Error('TEAM_PAYLOAD_INVALID');
    return value;
  }
  if (Array.isArray(value)) return value.map(stable);
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createLedgerApi({ auth, clock = () => Date.now() } = {}) {
  if (!auth || typeof auth.verifySession !== 'function' || typeof clock !== 'function')
    throw new Error('TEAM_API_CONFIG_INVALID');
  const scopes = new Map();
  const events = new Map();
  const receipts = new Map();

  function actor(token) {
    return auth.verifySession(token);
  }

  function checkedScope(trustedActor, input) {
    const scope = C.requireScope(input);
    if (scope.workspace_id !== trustedActor.workspace_id) throw new Error('TEAM_WORKSPACE_DENIED');
    return scope;
  }

  function receiptKey(workspaceId, idempotencyKey) {
    if (typeof idempotencyKey !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(idempotencyKey))
      throw new Error('TEAM_IDEMPOTENCY_KEY_REQUIRED');
    return `${workspaceId}:${idempotencyKey}`;
  }

  function event(scope, state, actorUserId, eventKind, payloadDigest) {
    const key = C.scopeKey(scope);
    const nextRevision = state.revision + 1;
    const entry = Object.freeze({
      event_id: `event_${crypto.randomBytes(12).toString('hex')}`,
      scope_key: key, scope_revision: nextRevision, actor_user_id: actorUserId,
      event_kind: eventKind, payload_sha256: payloadDigest, recorded_at: clock()
    });
    const list = events.get(key) || [];
    list.push(entry);
    events.set(key, list);
    return entry;
  }

  function mutateDraft(sessionToken, input) {
    const trustedActor = actor(sessionToken);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('TEAM_INTENT_INVALID');
    const scope = checkedScope(trustedActor, input.scope);
    const action = input.action || 'create_draft';
    if (!['create_draft', 'edit_draft'].includes(action)) throw new Error('TEAM_INTENT_ACTION_FORBIDDEN');
    if (!Number.isSafeInteger(input.expected_revision) || input.expected_revision < 0)
      throw new Error('TEAM_REVISION_INVALID');
    const key = C.scopeKey(scope);
    const current = scopes.get(key) || {
      ...scope, status: 'DRAFT', revision: 0, submitted_by: trustedActor.user_id
    };
    const payload = input.payload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('TEAM_PAYLOAD_INVALID');
    const requestDigest = digest({ action, scope, payload, expected_revision: input.expected_revision });
    const rkey = receiptKey(scope.workspace_id, input.idempotency_key);
    const prior = receipts.get(rkey);
    if (prior) {
      if (prior.request_sha256 !== requestDigest) throw new Error('TEAM_IDEMPOTENCY_CONFLICT');
      return Object.freeze({ ...clone(prior.result), replayed: true });
    }
    const intent = { workspace_id: scope.workspace_id, action,
      expected_revision: input.expected_revision, idempotency_key: input.idempotency_key,
      offline: input.offline === true };
    const checked = C.checkMutationIntent(trustedActor, intent, current);
    const entry = event(scope, current, trustedActor.user_id, action === 'create_draft' ? 'DRAFT_CREATED' : 'DRAFT_CHANGED', requestDigest);
    const next = Object.freeze({ ...current, revision: checked.next_revision, updated_at: clock(), payload: clone(payload) });
    scopes.set(key, next);
    const result = { scope_key: key, event_id: entry.event_id, new_revision: next.revision, sync_status: 'SYNCED' };
    receipts.set(rkey, Object.freeze({ request_sha256: requestDigest, result }));
    return Object.freeze({ ...result, replayed: false });
  }

  function submit(sessionToken, input) {
    const trustedActor = actor(sessionToken);
    if (!input || typeof input !== 'object') throw new Error('TEAM_INTENT_INVALID');
    const scope = checkedScope(trustedActor, input.scope);
    const key = C.scopeKey(scope);
    const current = scopes.get(key);
    if (!current) throw new Error('TEAM_SCOPE_NOT_FOUND');
    if (!Number.isSafeInteger(input.expected_revision) || input.expected_revision < 0)
      throw new Error('TEAM_REVISION_INVALID');
    const rkey = receiptKey(scope.workspace_id, input.idempotency_key);
    const requestDigest = digest({ action: 'submit_review', scope, expected_revision: input.expected_revision });
    const prior = receipts.get(rkey);
    if (prior) {
      if (prior.request_sha256 !== requestDigest) throw new Error('TEAM_IDEMPOTENCY_CONFLICT');
      return Object.freeze({ ...clone(prior.result), replayed: true });
    }
    const transition = C.transition(trustedActor, 'submit_review', current);
    if (transition.expected_revision !== input.expected_revision) throw new Error('TEAM_REVISION_CONFLICT');
    const entry = event(scope, current, trustedActor.user_id, 'SUBMITTED', requestDigest);
    const next = Object.freeze({ ...current, status: 'PENDING_REVIEW', revision: current.revision + 1, submitted_by: trustedActor.user_id, updated_at: clock() });
    scopes.set(key, next);
    const result = { scope_key: key, event_id: entry.event_id, new_revision: next.revision, sync_status: 'SYNCED' };
    receipts.set(rkey, Object.freeze({ request_sha256: requestDigest, result }));
    return Object.freeze({ ...result, replayed: false });
  }

  function getScope(sessionToken, input) {
    const trustedActor = actor(sessionToken);
    const scope = checkedScope(trustedActor, input);
    const current = scopes.get(C.scopeKey(scope));
    if (!current) throw new Error('TEAM_SCOPE_NOT_FOUND');
    return Object.freeze(clone(current));
  }

  function getEvents(sessionToken, input) {
    const trustedActor = actor(sessionToken);
    const scope = checkedScope(trustedActor, input);
    return Object.freeze((events.get(C.scopeKey(scope)) || []).map(clone));
  }

  return Object.freeze({ mutateDraft, submit, getScope, getEvents });
}

module.exports = Object.freeze({ stable, digest, createLedgerApi });
