'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../team-settlement/sync-contract.cjs');

test('offline reconnect with no local intent refreshes a changed server snapshot', () => {
  assert.deepEqual(S.reconnectDecision({ base_revision: 1, local_revision: 1, server_revision: 2 }), { status: 'PENDING', action: 'REFRESH_SERVER' });
  assert.deepEqual(S.reconnectDecision({ base_revision: 1, local_revision: 1, server_revision: 1 }), { status: 'SYNCED', action: 'NOOP' });
});

test('local intent retries only when its base is still current; otherwise manual conflict', () => {
  assert.deepEqual(S.reconnectDecision({ base_revision: 2, local_revision: 3, server_revision: 2, local_intent: true }), { status: 'PENDING', action: 'RETRY_WITH_CAS' });
  assert.deepEqual(S.reconnectDecision({ base_revision: 2, local_revision: 3, server_revision: 3, local_intent: true }), { status: 'CONFLICT', action: 'MANUAL_REVIEW' });
  assert.deepEqual(S.reconnectDecision({ base_revision: 2, local_revision: 3, server_revision: 3, local_intent: true, server_blocked: true }), { status: 'BLOCKED', action: 'WAIT_FOR_SERVER_REVIEW' });
});

test('sync contract rejects invalid revisions and unknown statuses', () => {
  assert.throws(() => S.reconnectDecision({ base_revision: -1, local_revision: 0, server_revision: 0 }), /SYNC_BASE_REVISION_INVALID/);
  assert.throws(() => S.reconnectDecision({ base_revision: 0, local_revision: 0, server_revision: 0, local_intent: 'yes' }), /SYNC_FLAGS_INVALID/);
  assert.throws(() => S.assertStatus('MERGED'), /SYNC_STATUS_INVALID/);
  for (const status of S.STATUSES) assert.equal(S.assertStatus(status), status);
});

test('unsent local intent cannot be labeled SYNCED merely because server revision matches', () => {
  const planned = S.reconnectDecision({ base_revision: 6, local_revision: 7, server_revision: 6, local_intent: true });
  assert.equal(planned.status, 'PENDING');
  assert.equal(planned.action, 'RETRY_WITH_CAS');
});
