'use strict';

// P0 synthetic authentication boundary. This module is deliberately in-memory
// and is not a deployed server, persistent identity store, or production login.
// The future HTTP adapter must call verifySession() and resolve membership on
// every request; it must never trust role/workspace fields from the browser.

const crypto = require('node:crypto');
const { actorFromServer } = require('./core-contract.cjs');

const ROLES = Object.freeze(['admin', 'operator', 'reviewer', 'viewer']);
const KEY_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const PASSWORD_MIN = 12;
const PASSWORD_MAX = 256;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const SCRYPT = Object.freeze({ N: 16384, r: 8, p: 1, keylen: 32 });

function fail(code) {
  throw new Error(code);
}

function requireKey(value, code) {
  if (typeof value !== 'string' || !KEY_RE.test(value)) fail(code);
  return value;
}

function requirePassword(value) {
  if (typeof value !== 'string' || value.length < PASSWORD_MIN || value.length > PASSWORD_MAX)
    fail('AUTH_PASSWORD_POLICY');
  return value;
}

function encode(buffer) {
  return buffer.toString('base64url');
}

function decode(value) {
  try { return Buffer.from(value, 'base64url'); } catch { return null; }
}

function hashPassword(password, salt = crypto.randomBytes(16)) {
  requirePassword(password);
  if (!Buffer.isBuffer(salt) || salt.length < 16) fail('AUTH_SALT_INVALID');
  const digest = crypto.scryptSync(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 32 * 1024 * 1024
  });
  return `scrypt-v1$${SCRYPT.N},${SCRYPT.r},${SCRYPT.p}$${encode(salt)}$${encode(digest)}`;
}

function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || typeof encoded !== 'string') return false;
  const parts = encoded.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt-v1') return false;
  const params = parts[1].split(',').map(Number);
  const salt = decode(parts[2]);
  const expected = decode(parts[3]);
  if (params.length !== 3 || params.some(Number.isNaN) || !salt || !expected ||
      params[0] !== SCRYPT.N || params[1] !== SCRYPT.r || params[2] !== SCRYPT.p ||
      salt.length < 16 || expected.length !== SCRYPT.keylen) return false;
  let actual;
  try {
    actual = crypto.scryptSync(password, salt, SCRYPT.keylen, {
      N: params[0], r: params[1], p: params[2], maxmem: 32 * 1024 * 1024
    });
  } catch { return false; }
  return crypto.timingSafeEqual(actual, expected);
}

// Durable login must avoid blocking Node's event loop with scryptSync.
async function verifyPasswordAsync(password, encoded) {
  if (typeof password !== 'string' || typeof encoded !== 'string') return false;
  const parts = encoded.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt-v1') return false;
  const params = parts[1].split(',').map(Number);
  const salt = decode(parts[2]), expected = decode(parts[3]);
  if (params.length !== 3 || params.some(Number.isNaN) || !salt || !expected ||
      params[0] !== SCRYPT.N || params[1] !== SCRYPT.r || params[2] !== SCRYPT.p ||
      salt.length < 16 || expected.length !== SCRYPT.keylen) return false;
  try {
    const actual = await new Promise((resolve, reject) =>
      crypto.scrypt(password, salt, SCRYPT.keylen, {
        N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 32 * 1024 * 1024
      }, (err, buffer) => err ? reject(err) : resolve(buffer)));
    return crypto.timingSafeEqual(actual, expected);
  } catch { return false; }
}

function createAuthService({ clock = () => Date.now(), sessionTtlMs = SESSION_TTL_MS } = {}) {
  if (typeof clock !== 'function' || !Number.isSafeInteger(sessionTtlMs) || sessionTtlMs <= 0)
    fail('AUTH_SERVICE_CONFIG_INVALID');
  const identities = new Map();
  const memberships = new Map();
  const sessions = new Map();

  function membershipKey(workspaceId, userId) {
    return `${workspaceId}:${userId}`;
  }

  function registerIdentity({ user_id, auth_subject, password, disabled_at = null }) {
    requireKey(user_id, 'AUTH_USER_ID_INVALID');
    requireKey(auth_subject, 'AUTH_SUBJECT_INVALID');
    requirePassword(password);
    if (disabled_at !== null && !Number.isSafeInteger(disabled_at)) fail('AUTH_DISABLED_AT_INVALID');
    if (identities.has(user_id) || [...identities.values()].some(x => x.auth_subject === auth_subject))
      fail('AUTH_IDENTITY_EXISTS');
    identities.set(user_id, Object.freeze({
      user_id, auth_subject, password_hash: hashPassword(password), disabled_at
    }));
    return { user_id, auth_subject };
  }

  function setMembership({ workspace_id, user_id, role, revoked_at = null }) {
    requireKey(workspace_id, 'AUTH_WORKSPACE_ID_INVALID');
    requireKey(user_id, 'AUTH_USER_ID_INVALID');
    if (!identities.has(user_id) || !ROLES.includes(role)) fail('AUTH_MEMBERSHIP_INVALID');
    if (revoked_at !== null && !Number.isSafeInteger(revoked_at)) fail('AUTH_REVOKED_AT_INVALID');
    memberships.set(membershipKey(workspace_id, user_id),
      Object.freeze({ workspace_id, user_id, role, revoked_at }));
    return { workspace_id, user_id, role, revoked_at };
  }

  function login({ auth_subject, password, workspace_id }) {
    requireKey(auth_subject, 'AUTH_SUBJECT_INVALID');
    requireKey(workspace_id, 'AUTH_WORKSPACE_ID_INVALID');
    const identity = [...identities.values()].find(x => x.auth_subject === auth_subject);
    const membership = identity && memberships.get(membershipKey(workspace_id, identity.user_id));
    const valid = identity && identity.disabled_at === null &&
      membership && membership.revoked_at === null && verifyPassword(password, identity.password_hash);
    if (!valid) fail('AUTH_LOGIN_DENIED');
    const token = encode(crypto.randomBytes(32));
    const tokenHash = crypto.createHash('sha256').update(token).digest('base64url');
    sessions.set(tokenHash, {
      user_id: identity.user_id, workspace_id, issued_at: clock(),
      expires_at: clock() + sessionTtlMs, revoked_at: null
    });
    return Object.freeze({ session_token: token, expires_at: sessions.get(tokenHash).expires_at });
  }

  function verifySession(sessionToken, workspace_id) {
    if (typeof sessionToken !== 'string' || sessionToken.length < 32) fail('AUTH_SESSION_INVALID');
    const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('base64url');
    const session = sessions.get(tokenHash);
    if (!session || session.revoked_at !== null || session.expires_at <= clock()) fail('AUTH_SESSION_INVALID');
    if (workspace_id !== undefined && session.workspace_id !== workspace_id) fail('AUTH_WORKSPACE_DENIED');
    const identity = identities.get(session.user_id);
    const membership = identity && memberships.get(membershipKey(session.workspace_id, session.user_id));
    if (!identity || identity.disabled_at !== null || !membership || membership.revoked_at !== null)
      fail('AUTH_SESSION_REVOKED');
    return Object.freeze({
      server_verified: true, membership_active: true, user_id: identity.user_id,
      workspace_id: session.workspace_id, role: membership.role
    });
  }

  function revokeSession(sessionToken) {
    if (typeof sessionToken !== 'string') return false;
    const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('base64url');
    const session = sessions.get(tokenHash);
    if (!session || session.revoked_at !== null) return false;
    session.revoked_at = clock();
    return true;
  }

  function requireAdmin(trustedActor, workspaceId) {
    const actor = actorFromServer(trustedActor);
    if (actor.workspace_id !== workspaceId) fail('AUTH_WORKSPACE_DENIED');
    if (actor.role !== 'admin') fail('AUTH_ROLE_DENIED');
    return actor;
  }

  function manageMembership(trustedActor, { workspace_id, user_id, role, revoked_at = null }) {
    const actor = requireAdmin(trustedActor, workspace_id);
    requireKey(user_id, 'AUTH_USER_ID_INVALID');
    if (!identities.has(user_id) || !ROLES.includes(role)) fail('AUTH_MEMBERSHIP_INVALID');
    if (revoked_at !== null && !Number.isSafeInteger(revoked_at)) fail('AUTH_REVOKED_AT_INVALID');
    if (actor.user_id === user_id && (revoked_at !== null || role !== 'admin'))
      fail('AUTH_SELF_ADMIN_CHANGE_DENIED');
    return setMembership({ workspace_id, user_id, role, revoked_at });
  }

  function setIdentityDisabled(trustedActor, workspaceId, userId, disabledAt = clock()) {
    const actor = requireAdmin(trustedActor, workspaceId);
    if (actor.role !== 'admin') fail('AUTH_ROLE_DENIED');
    requireKey(userId, 'AUTH_USER_ID_INVALID');
    if (actor.user_id === userId) fail('AUTH_SELF_DISABLE_DENIED');
    const identity = identities.get(userId);
    if (!identity || !memberships.has(membershipKey(workspaceId, userId)) ||
        (disabledAt !== null && !Number.isSafeInteger(disabledAt)))
      fail('AUTH_IDENTITY_INVALID');
    identities.set(userId, Object.freeze({ ...identity, disabled_at: disabledAt }));
    return { workspace_id: workspaceId, user_id: userId, disabled_at: disabledAt };
  }

  return Object.freeze({
    registerIdentity, setMembership, manageMembership, setIdentityDisabled,
    login, verifySession, revokeSession
  });
}

module.exports = Object.freeze({
  ROLES, PASSWORD_MIN, PASSWORD_MAX, SESSION_TTL_MS, SCRYPT,
  hashPassword, verifyPassword, verifyPasswordAsync, createAuthService
});
