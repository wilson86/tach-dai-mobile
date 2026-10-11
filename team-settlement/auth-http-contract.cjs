'use strict';

// Synthetic HTTP adapter for contract tests only. It is intentionally not a
// TLS terminator, persistent identity store, CSRF deployment, or production
// deployed service. A real deployment must put equivalent logic behind approved TLS,
// rate limits, secure cookies/CSRF policy and a durable database.

const http = require('node:http');

const DEFAULT_MAX_BODY_BYTES = 16 * 1024;
const DEFAULT_LOGIN_ATTEMPT_LIMIT = 5;
const DEFAULT_LOGIN_WINDOW_MS = 60 * 1000;

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body)
  });
  res.end(body);
}

function noContent(res) {
  res.writeHead(204, { 'cache-control': 'no-store' });
  res.end();
}

function bearer(req) {
  const value = req.headers.authorization;
  if (typeof value !== 'string' || !/^Bearer [A-Za-z0-9_-]{32,}$/.test(value)) return null;
  return value.slice(7);
}

function readJson(req, maxBodyBytes) {
  return new Promise((resolve, reject) => {
    let total = 0;
    let tooLarge = false;
    const chunks = [];
    req.on('data', chunk => {
      total += chunk.length;
      if (total > maxBodyBytes) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) {
        reject(Object.assign(new Error('AUTH_BODY_TOO_LARGE'), { code: 'AUTH_BODY_TOO_LARGE' }));
        return;
      }
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
        resolve(value);
      } catch {
        reject(Object.assign(new Error('AUTH_JSON_INVALID'), { code: 'AUTH_JSON_INVALID' }));
      }
    });
    req.on('error', reject);
  });
}

function createAuthHttpServer(auth, {
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
  maxLoginAttempts = DEFAULT_LOGIN_ATTEMPT_LIMIT,
  loginWindowMs = DEFAULT_LOGIN_WINDOW_MS,
  clock = () => Date.now()
} = {}) {
  if (!auth || typeof auth.login !== 'function' || typeof auth.verifySession !== 'function' ||
      typeof auth.revokeSession !== 'function' || typeof auth.manageMembership !== 'function' ||
      typeof auth.setIdentityDisabled !== 'function' || !Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 256 ||
      !Number.isSafeInteger(maxLoginAttempts) || maxLoginAttempts < 1 ||
      !Number.isSafeInteger(loginWindowMs) || loginWindowMs < 1 || typeof clock !== 'function')
    throw new Error('AUTH_HTTP_CONFIG_INVALID');
  const loginAttempts = new Map();

  function loginKey(req, input) {
    const source = typeof req.socket?.remoteAddress === 'string' ? req.socket.remoteAddress : 'unknown';
    const subject = typeof input.auth_subject === 'string' ? input.auth_subject : 'missing';
    return `${source}:${subject}`;
  }

  function rateLimited(key) {
    const now = clock();
    const entry = loginAttempts.get(key);
    if (!entry || now - entry.started_at >= loginWindowMs) {
      loginAttempts.set(key, { started_at: now, count: 0 });
      return false;
    }
    return entry.count >= maxLoginAttempts;
  }

  function recordFailedLogin(key) {
    const now = clock();
    const entry = loginAttempts.get(key);
    if (!entry || now - entry.started_at >= loginWindowMs)
      loginAttempts.set(key, { started_at: now, count: 1 });
    else entry.count += 1;
  }

  function clearLoginFailures(key) {
    loginAttempts.delete(key);
  }

  return http.createServer(async (req, res) => {
    try {
      if (req.url === '/v1/login' && req.method === 'POST') {
        let input;
        try { input = await readJson(req, maxBodyBytes); }
        catch (error) {
          if (error.code === 'AUTH_BODY_TOO_LARGE') return json(res, 413, { error: error.code });
          return json(res, 400, { error: 'AUTH_JSON_INVALID' });
        }
        const key = loginKey(req, input);
        if (rateLimited(key)) return json(res, 429, { error: 'AUTH_RATE_LIMITED' });
        try {
          const result = auth.login(input);
          clearLoginFailures(key);
          return json(res, 200, result);
        } catch {
          recordFailedLogin(key);
          return json(res, 401, { error: 'AUTH_LOGIN_DENIED' });
        }
      }
      if (req.url === '/v1/session' && req.method === 'GET') {
        try { return json(res, 200, auth.verifySession(bearer(req))); }
        catch { return json(res, 401, { error: 'AUTH_SESSION_INVALID' }); }
      }
      if (req.url === '/v1/logout' && req.method === 'POST') {
        const token = bearer(req);
        if (!token) return json(res, 401, { error: 'AUTH_SESSION_INVALID' });
        auth.revokeSession(token);
        return noContent(res);
      }
      if (req.url === '/v1/admin/memberships' && req.method === 'POST') {
        const token = bearer(req);
        if (!token) return json(res, 401, { error: 'AUTH_SESSION_INVALID' });
        let input;
        try { input = await readJson(req, maxBodyBytes); }
        catch (error) {
          if (error.code === 'AUTH_BODY_TOO_LARGE') return json(res, 413, { error: error.code });
          return json(res, 400, { error: 'AUTH_JSON_INVALID' });
        }
        try {
          const actor = auth.verifySession(token);
          return json(res, 200, auth.manageMembership(actor, input));
        } catch (error) {
          if (error.message === 'AUTH_ROLE_DENIED' || error.message === 'AUTH_WORKSPACE_DENIED')
            return json(res, 403, { error: error.message });
          if (error.message === 'AUTH_SESSION_INVALID' || error.message === 'AUTH_SESSION_REVOKED')
            return json(res, 401, { error: 'AUTH_SESSION_INVALID' });
          return json(res, 400, { error: error.message === 'AUTH_SELF_ADMIN_CHANGE_DENIED' ? error.message : 'AUTH_MEMBERSHIP_INVALID' });
        }
      }
      if (req.url === '/v1/admin/disable' && req.method === 'POST') {
        const token = bearer(req);
        if (!token) return json(res, 401, { error: 'AUTH_SESSION_INVALID' });
        let input;
        try { input = await readJson(req, maxBodyBytes); }
        catch (error) {
          if (error.code === 'AUTH_BODY_TOO_LARGE') return json(res, 413, { error: error.code });
          return json(res, 400, { error: 'AUTH_JSON_INVALID' });
        }
        try {
          const actor = auth.verifySession(token);
          return json(res, 200, auth.setIdentityDisabled(actor, input.workspace_id, input.user_id, input.disabled_at));
        } catch (error) {
          if (error.message === 'AUTH_ROLE_DENIED') return json(res, 403, { error: error.message });
          if (error.message === 'AUTH_SESSION_INVALID' || error.message === 'AUTH_SESSION_REVOKED')
            return json(res, 401, { error: 'AUTH_SESSION_INVALID' });
          return json(res, 400, { error: error.message === 'AUTH_SELF_DISABLE_DENIED' ? error.message : 'AUTH_IDENTITY_INVALID' });
        }
      }
      return json(res, 404, { error: 'AUTH_ROUTE_NOT_FOUND' });
    } catch {
      return json(res, 500, { error: 'AUTH_INTERNAL_ERROR' });
    }
  });
}

module.exports = Object.freeze({
  DEFAULT_MAX_BODY_BYTES, DEFAULT_LOGIN_ATTEMPT_LIMIT, DEFAULT_LOGIN_WINDOW_MS,
  createAuthHttpServer
});
