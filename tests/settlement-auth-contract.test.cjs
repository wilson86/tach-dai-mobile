'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const A = require('../team-settlement/auth-contract.cjs');

function seeded(clock = () => 1_000) {
  const auth = A.createAuthService({ clock, sessionTtlMs: 100 });
  auth.registerIdentity({ user_id: 'member_1', auth_subject: 'subject_1', password: 'synthetic-password-1' });
  auth.setMembership({ workspace_id: 'group_a', user_id: 'member_1', role: 'operator' });
  return auth;
}

test('password hashes are salted, parameterized and do not expose the password', () => {
  const first = A.hashPassword('synthetic-password-1');
  const second = A.hashPassword('synthetic-password-1');
  assert.notEqual(first, second);
  assert.match(first, /^scrypt-v1\$16384,8,1\$/);
  assert.equal(A.verifyPassword('synthetic-password-1', first), true);
  assert.equal(A.verifyPassword('wrong-password', first), false);
  assert.equal(first.includes('synthetic-password-1'), false);
});

test('login creates an opaque expiring session and server derives the actor', () => {
  let now = 1_000;
  const auth = seeded(() => now);
  const result = auth.login({ auth_subject: 'subject_1', password: 'synthetic-password-1', workspace_id: 'group_a' });
  assert.equal(typeof result.session_token, 'string');
  assert.equal(result.session_token.length >= 32, true);
  assert.deepEqual(auth.verifySession(result.session_token, 'group_a'), {
    server_verified: true, membership_active: true, user_id: 'member_1',
    workspace_id: 'group_a', role: 'operator'
  });
  now = 1_101;
  assert.throws(() => auth.verifySession(result.session_token), /AUTH_SESSION_INVALID/);
});

test('failed login paths are fail-closed and do not reveal identity state', () => {
  const auth = seeded();
  for (const attempt of [
    { auth_subject: 'subject_1', password: 'wrong-password', workspace_id: 'group_a' },
    { auth_subject: 'unknown_subject', password: 'synthetic-password-1', workspace_id: 'group_a' },
    { auth_subject: 'subject_1', password: 'synthetic-password-1', workspace_id: 'group_b' }
  ]) assert.throws(() => auth.login(attempt), /AUTH_LOGIN_DENIED/);
  assert.throws(() => auth.login({ auth_subject: 'subject_1', password: 'short', workspace_id: 'group_a' }), /AUTH_LOGIN_DENIED|AUTH_PASSWORD_POLICY/);
});

test('disabled identities and revoked memberships invalidate new and existing sessions', () => {
  let now = 1_000;
  const auth = seeded(() => now);
  const session = auth.login({ auth_subject: 'subject_1', password: 'synthetic-password-1', workspace_id: 'group_a' });
  auth.setMembership({ workspace_id: 'group_a', user_id: 'member_1', role: 'operator', revoked_at: now });
  assert.throws(() => auth.verifySession(session.session_token), /AUTH_SESSION_REVOKED/);
  assert.throws(() => auth.login({ auth_subject: 'subject_1', password: 'synthetic-password-1', workspace_id: 'group_a' }), /AUTH_LOGIN_DENIED/);
});

test('explicit revocation and workspace mismatch deny the session', () => {
  const auth = seeded();
  const session = auth.login({ auth_subject: 'subject_1', password: 'synthetic-password-1', workspace_id: 'group_a' });
  assert.throws(() => auth.verifySession(session.session_token, 'group_b'), /AUTH_WORKSPACE_DENIED/);
  assert.equal(auth.revokeSession(session.session_token), true);
  assert.throws(() => auth.verifySession(session.session_token), /AUTH_SESSION_INVALID/);
  assert.equal(auth.revokeSession(session.session_token), true);
  assert.equal(auth.revokeSession('not-a-real-token'), false);
});

test('role is resolved from active membership, never from login input', () => {
  const auth = seeded();
  const session = auth.login({ auth_subject: 'subject_1', password: 'synthetic-password-1', workspace_id: 'group_a' });
  assert.equal(auth.verifySession(session.session_token).role, 'operator');
  const forgedRole = auth.login({ auth_subject: 'subject_1', password: 'synthetic-password-1', workspace_id: 'group_a', role: 'admin' });
  assert.equal(auth.verifySession(forgedRole.session_token).role, 'operator');
});
