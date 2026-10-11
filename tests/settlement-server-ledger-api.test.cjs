'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const A = require('../team-settlement/auth-contract.cjs');
const { createPostgresLedgerRepository } = require('../team-settlement/postgres-ledger-repository.cjs');
const { createServerLedgerApi } = require('../team-settlement/server-ledger-api.cjs');

const scope = { workspace_id: 'group_a', partner_id: 'counterparty_1', business_date: '2026-10-12', region: 'mn' };

function setup(resultRows = [{ result: { event_id: 'event_1', replayed: false, new_revision: 1 } }]) {
  const auth = A.createAuthService({ clock: () => 1_000, sessionTtlMs: 10_000 });
  auth.registerIdentity({ user_id: 'operator_1', auth_subject: 'subject_operator', password: 'synthetic-operator-password' });
  auth.setMembership({ workspace_id: 'group_a', user_id: 'operator_1', role: 'operator' });
  const session = auth.login({ auth_subject: 'subject_operator', password: 'synthetic-operator-password', workspace_id: 'group_a' });
  const calls = [];
  const db = { async transaction(work) { return work({ query: async (text, params) => { calls.push({ text, params }); return { rows: resultRows }; } }); } };
  return { auth, calls, api: createServerLedgerApi({ auth, repository: createPostgresLedgerRepository({ db }), eventId: () => 'event_1' }), token: session.session_token };
}

test('server API authenticates session, canonicalizes request and delegates to repository', async () => {
  const { api, calls, token } = setup();
  const result = await api.appendDraft(token, { scope, expected_revision: 0, idempotency_key: 'request_1', payload: { synthetic: true, selector: '123' } });
  assert.deepEqual(result, { event_id: 'event_1', replayed: false, new_revision: 1, scope_key: 'group_a:counterparty_1:2026-10-12:mn', sync_status: 'SYNCED' });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].params[0], 'group_a');
  assert.match(calls[1].params[7], /^[a-f0-9]{64}$/);
  assert.equal(calls[1].params[8], '{"selector":"123","synthetic":true}');
});

test('server API blocks offline, cross-tenant and malformed requests before repository access', async () => {
  const { api, calls, token } = setup();
  await assert.rejects(() => api.appendDraft(token, { scope, expected_revision: 0, idempotency_key: 'x', offline: true, payload: { synthetic: true } }), /TEAM_OFFLINE_NOT_AUTHORITATIVE/);
  await assert.rejects(() => api.appendDraft(token, { scope: { ...scope, workspace_id: 'group_b' }, expected_revision: 0, idempotency_key: 'x', payload: { synthetic: true } }), /TEAM_WORKSPACE_DENIED/);
  await assert.rejects(() => api.appendDraft(token, { scope, expected_revision: 0, idempotency_key: 'x', payload: ['not-an-object'] }), /TEAM_PAYLOAD_INVALID/);
  assert.equal(calls.length, 0);
});

test('server API never accepts a client role and scopes reads through the repository', async () => {
  const { api, token } = setup();
  const repo = { async appendDraft() { throw new Error('should not run'); }, async getScope(actor, input) {
    assert.equal(actor.role, 'operator');
    assert.equal(actor.workspace_id, 'group_a');
    return { ...input, state: 'DRAFT', synthetic: true };
  }};
  const auth = A.createAuthService({ clock: () => 1_000, sessionTtlMs: 10_000 });
  auth.registerIdentity({ user_id: 'operator_1', auth_subject: 'subject_operator', password: 'synthetic-operator-password' });
  auth.setMembership({ workspace_id: 'group_a', user_id: 'operator_1', role: 'operator' });
  const fresh = auth.login({ auth_subject: 'subject_operator', password: 'synthetic-operator-password', workspace_id: 'group_a' });
  const server = createServerLedgerApi({ auth, repository: repo });
  const read = await server.getScope(fresh.session_token, { ...scope, role: 'admin' });
  assert.equal(read.state, 'DRAFT');
  assert.equal(read.role, undefined);
});
