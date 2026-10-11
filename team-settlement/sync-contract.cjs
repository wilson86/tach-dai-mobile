'use strict';

// Client reconnect contract. It never auto-merges financial rows: a changed
// server revision with a local intent always requires explicit review.

const STATUSES = Object.freeze(['PENDING', 'SYNCED', 'CONFLICT', 'BLOCKED']);

function revision(value, code) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(code);
  return value;
}

function reconnectDecision({ base_revision, local_revision, server_revision, local_intent = false, server_blocked = false } = {}) {
  const base = revision(base_revision, 'SYNC_BASE_REVISION_INVALID');
  const local = revision(local_revision, 'SYNC_LOCAL_REVISION_INVALID');
  const server = revision(server_revision, 'SYNC_SERVER_REVISION_INVALID');
  if (typeof local_intent !== 'boolean' || typeof server_blocked !== 'boolean') throw new Error('SYNC_FLAGS_INVALID');
  if (server_blocked) return Object.freeze({ status: 'BLOCKED', action: 'WAIT_FOR_SERVER_REVIEW' });
  if (!local_intent) return Object.freeze({
    status: server === base ? 'SYNCED' : 'PENDING',
    action: server === base ? 'NOOP' : 'REFRESH_SERVER'
  });
  if (server === base && local >= base) return Object.freeze({ status: 'SYNCED', action: 'RETRY_WITH_CAS' });
  return Object.freeze({ status: 'CONFLICT', action: 'MANUAL_REVIEW' });
}

function assertStatus(value) {
  if (!STATUSES.includes(value)) throw new Error('SYNC_STATUS_INVALID');
  return value;
}

module.exports = Object.freeze({ STATUSES, reconnectDecision, assertStatus });
