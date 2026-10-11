'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const A = require('../team-settlement/auth-contract.cjs');
const { createLedgerApi } = require('../team-settlement/ledger-api-contract.cjs');

function setup() {
  const auth = A.createAuthService({ clock: () => 1_000, sessionTtlMs: 10_000 });
  auth.registerIdentity({ user_id: 'operator_1', auth_subject: 'subject_operator', password: 'synthetic-operator-password' });
  auth.registerIdentity({ user_id: 'reviewer_1', auth_subject: 'subject_reviewer', password: 'synthetic-reviewer-password' });
  auth.setMembership({ workspace_id: 'group_a', user_id: 'operator_1', role: 'operator' });
  auth.setMembership({ workspace_id: 'group_a', user_id: 'reviewer_1', role: 'reviewer' });
  const operator = auth.login({ auth_subject: 'subject_operator', password: 'synthetic-operator-password', workspace_id: 'group_a' });
  const reviewer = auth.login({ auth_subject: 'subject_reviewer', password: 'synthetic-reviewer-password', workspace_id: 'group_a' });
  return { auth, api: createLedgerApi({ auth, clock: () => 1_000 }), operator: operator.session_token, reviewer: reviewer.session_token };
}

const scope = { workspace_id: 'group_a', partner_id: 'counterparty_1', business_date: '2026-10-12', region: 'mn' };

test('server derives tenant and role, then commits one draft event and idempotent replay', () => {
  const { api, operator } = setup();
  const input = { action: 'create_draft', scope, expected_revision: 0, idempotency_key: 'draft_1', payload: { synthetic: true, selector: '123' } };
  const first = api.mutateDraft(operator, input);
  const replay = api.mutateDraft(operator, input);
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(replay.event_id, first.event_id);
  assert.equal(api.getEvents(operator, scope).length, 1);
  assert.equal(api.getScope(operator, scope).revision, 1);
});

test('CAS and idempotency collision fail closed without a second event', () => {
  const { api, operator } = setup();
  api.mutateDraft(operator, { scope, expected_revision: 0, idempotency_key: 'draft_2', payload: { synthetic: true } });
  assert.throws(() => api.mutateDraft(operator, { scope, expected_revision: 0, idempotency_key: 'draft_3', payload: { synthetic: true } }), /TEAM_REVISION_CONFLICT/);
  assert.throws(() => api.mutateDraft(operator, { scope, expected_revision: 1, idempotency_key: 'draft_2', payload: { synthetic: false } }), /TEAM_IDEMPOTENCY_CONFLICT/);
  assert.equal(api.getEvents(operator, scope).length, 1);
});

test('offline, cross-workspace and unauthorized transitions are denied', () => {
  const { api, operator, reviewer } = setup();
  assert.throws(() => api.mutateDraft(operator, { scope: { ...scope, workspace_id: 'group_b' }, expected_revision: 0, idempotency_key: 'x', payload: { synthetic: true } }), /TEAM_WORKSPACE_DENIED/);
  assert.throws(() => api.mutateDraft(reviewer, { scope, expected_revision: 0, idempotency_key: 'reviewer_write', payload: { synthetic: true } }), /TEAM_ROLE_DENIED/);
  api.mutateDraft(operator, { scope, expected_revision: 0, idempotency_key: 'draft_4', payload: { synthetic: true } });
  assert.throws(() => api.mutateDraft(operator, { scope, expected_revision: 1, idempotency_key: 'offline', offline: true, payload: { synthetic: true } }), /TEAM_OFFLINE_NOT_AUTHORITATIVE/);
});

test('submit requires the operator session and yields an auditable pending-review state', () => {
  const { api, operator, reviewer } = setup();
  api.mutateDraft(operator, { scope, expected_revision: 0, idempotency_key: 'draft_5', payload: { synthetic: true } });
  const submitted = api.submit(operator, { scope, expected_revision: 1, idempotency_key: 'submit_1' });
  assert.equal(submitted.new_revision, 2);
  assert.equal(api.getScope(reviewer, scope).status, 'PENDING_REVIEW');
  assert.equal(api.getEvents(reviewer, scope).map(x => x.event_kind).join(','), 'DRAFT_CREATED,SUBMITTED');
  assert.throws(() => api.submit(operator, { scope, expected_revision: 2, idempotency_key: 'submit_2' }), /TEAM_TRANSITION_DENIED/);
});

test('two clients on one scope never silently overwrite; reconnect refreshes then retries CAS', () => {
  const { api, operator } = setup();
  api.mutateDraft(operator, { scope, expected_revision: 0, idempotency_key: 'client_a', payload: { synthetic: true, client: 'a' } });
  assert.throws(() => api.mutateDraft(operator, { scope, expected_revision: 0, idempotency_key: 'client_b', payload: { synthetic: true, client: 'b' } }), /TEAM_REVISION_CONFLICT/);
  const refreshed = api.getScope(operator, scope);
  assert.equal(refreshed.revision, 1);
  const retried = api.mutateDraft(operator, { scope, expected_revision: refreshed.revision, idempotency_key: 'client_b_retry', payload: { synthetic: true, client: 'b' } });
  assert.equal(retried.new_revision, 2);
  assert.equal(api.getEvents(operator, scope).length, 2);
});
