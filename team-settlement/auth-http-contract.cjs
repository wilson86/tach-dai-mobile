'use strict';

// Synthetic HTTP adapter for contract tests only. It is intentionally not a
// TLS terminator, persistent identity store, CSRF deployment, or production
// deployed service. A real deployment must put equivalent logic behind approved TLS,
// rate limits, secure cookies/CSRF policy and a durable database.

const http = require('node:http');
const { URL } = require('node:url');

const DEFAULT_MAX_BODY_BYTES = 16 * 1024;
const DEFAULT_LOGIN_ATTEMPT_LIMIT = 5;
const DEFAULT_LOGIN_WINDOW_MS = 60 * 1000;
const DEFAULT_MAX_LOGIN_KEYS = 2048;
const DEFAULT_MAX_LOGIN_SOURCE_ATTEMPTS = 100;

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
  maxLoginKeys = DEFAULT_MAX_LOGIN_KEYS,
  maxLoginSourceAttempts = DEFAULT_MAX_LOGIN_SOURCE_ATTEMPTS,
  clock = () => Date.now(),
  ledger = null
} = {}) {
  if (!auth || typeof auth.login !== 'function' || typeof auth.verifySession !== 'function' ||
      typeof auth.revokeSession !== 'function' || typeof auth.manageMembership !== 'function' ||
      typeof auth.setIdentityDisabled !== 'function' || !Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 256 ||
      !Number.isSafeInteger(maxLoginAttempts) || maxLoginAttempts < 1 ||
      !Number.isSafeInteger(loginWindowMs) || loginWindowMs < 1 ||
      !Number.isSafeInteger(maxLoginKeys) || maxLoginKeys < 1 || maxLoginKeys > 100000 ||
      !Number.isSafeInteger(maxLoginSourceAttempts) || maxLoginSourceAttempts < 1 ||
      maxLoginSourceAttempts > 100000 ||
      typeof clock !== 'function' ||
      (ledger !== null && (!ledger || (typeof ledger.appendDraft !== 'function' &&
        typeof ledger.getChanges !== 'function' && typeof ledger.getScope !== 'function'))))
    throw new Error('AUTH_HTTP_CONFIG_INVALID');
  const loginAttempts = new Map();
  const sourceAttempts = new Map();
  let loginWindowStart = null;

  function loginSource(req) {
    return typeof req.socket?.remoteAddress === 'string' ? req.socket.remoteAddress : 'unknown';
  }

  function loginKey(source, input) {
    const subject = typeof input.auth_subject === 'string' ? input.auth_subject : 'missing';
    return `${source}:${subject}`;
  }

  // Reserve the attempt synchronously BEFORE awaited password verification.
  // Otherwise many simultaneous logins can all pass a failure-only limiter.
  // A fixed window bounds both admission and the number of attacker-selected
  // username keys retained in memory. This is NOT a production distributed
  // rate limiter, and must be replaced before exposing an operational server.
  function rateLimited(key, source) {
    const now = clock();
    if (!Number.isSafeInteger(now) || now < 0) return true;
    if (loginWindowStart === null || now - loginWindowStart >= loginWindowMs ||
        now < loginWindowStart) {
      loginAttempts.clear();
      sourceAttempts.clear();
      loginWindowStart = now;
    }
    // Bound credential verification even if an attacker rotates usernames.
    // Admission is reserved before awaiting an expensive password verifier.
    const sourceCount = sourceAttempts.get(source) || 0;
    if (sourceCount >= maxLoginSourceAttempts) return true;
    const count = loginAttempts.get(key);
    if (count !== undefined) {
      if (count >= maxLoginAttempts) return true;
      loginAttempts.set(key, count + 1);
    } else {
      // This also bounds the number of unique source keys retained per window.
      if (loginAttempts.size >= maxLoginKeys ||
          (!sourceAttempts.has(source) && sourceAttempts.size >= maxLoginKeys))
        return true;
      loginAttempts.set(key, 1);
    }
    sourceAttempts.set(source, sourceCount + 1);
    return false;
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
        const source = loginSource(req);
        const key = loginKey(source, input);
        if (rateLimited(key, source)) return json(res, 429, { error: 'AUTH_RATE_LIMITED' });
        try {
          const result = await auth.login(input);
          clearLoginFailures(key);
          return json(res, 200, result);
        } catch {
          return json(res, 401, { error: 'AUTH_LOGIN_DENIED' });
        }
      }
      if (req.url === '/v1/session' && req.method === 'GET') {
        try { return json(res, 200, await auth.verifySession(bearer(req))); }
        catch { return json(res, 401, { error: 'AUTH_SESSION_INVALID' }); }
      }
      if (req.url === '/v1/logout' && req.method === 'POST') {
        const token = bearer(req);
        if (!token) return json(res, 401, { error: 'AUTH_SESSION_INVALID' });
        // A false/ambiguous revocation cannot be reported as successful.
        // Never claim the server invalidated a bearer that was not found.
        const revoked = await auth.revokeSession(token);
        if (revoked !== true)
          return json(res, 401, { error: 'AUTH_SESSION_INVALID' });
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
          const actor = await auth.verifySession(token);
          return json(res, 200, await auth.manageMembership(actor, input));
        } catch (error) {
          if (error.message === 'AUTH_ADMIN_UNAVAILABLE') return json(res, 404, { error: 'TEAM_ROUTE_NOT_ENABLED' });
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
          const actor = await auth.verifySession(token);
          return json(res, 200, await auth.setIdentityDisabled(actor, input.workspace_id, input.user_id, input.disabled_at));
        } catch (error) {
          if (error.message === 'AUTH_ADMIN_UNAVAILABLE') return json(res, 404, { error: 'TEAM_ROUTE_NOT_ENABLED' });
          if (error.message === 'AUTH_ROLE_DENIED') return json(res, 403, { error: error.message });
          if (error.message === 'AUTH_SESSION_INVALID' || error.message === 'AUTH_SESSION_REVOKED')
            return json(res, 401, { error: 'AUTH_SESSION_INVALID' });
          return json(res, 400, { error: error.message === 'AUTH_SELF_DISABLE_DENIED' ? error.message : 'AUTH_IDENTITY_INVALID' });
        }
      }
      // Read-only scope endpoint. Browser-supplied workspace IDs are ignored;
      // the workspace must be derived from the authenticated server session.
      if (req.method === 'GET' && req.url.startsWith('/v1/scopes/')) {
        if (!ledger || typeof ledger.getScope !== 'function')
          return json(res, 404, { error: 'TEAM_ROUTE_NOT_ENABLED' });
        const token = bearer(req);
        if (!token) return json(res, 401, { error: 'AUTH_SESSION_INVALID' });
        const parts = req.url.split('/');
        if (parts.length !== 6 || parts[1] !== 'v1' || parts[2] !== 'scopes' ||
            !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(parts[3]) ||
            !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(parts[4]) ||
            !['mn','mt','mb'].includes(parts[5]))
          return json(res, 422, { error: 'TEAM_SCOPE_INVALID' });
        try {
          const actor = await auth.verifySession(token);
          const scope = { workspace_id: actor.workspace_id, partner_id: parts[3],
            business_date: parts[4], region: parts[5] };
          return json(res, 200, await ledger.getScope(token, scope));
        } catch (error) {
          const code = error && error.message;
          if (code === 'AUTH_SESSION_INVALID' || code === 'AUTH_SESSION_REVOKED')
            return json(res, 401, { error: 'AUTH_SESSION_INVALID' });
          if (code === 'TEAM_SCOPE_NOT_FOUND') return json(res, 404, { error: 'TEAM_SCOPE_NOT_FOUND' });
          if (code === 'TEAM_SCOPE_INVALID') return json(res, 422, { error: 'TEAM_SCOPE_INVALID' });
          if (code === 'TEAM_WORKSPACE_DENIED' || code === 'TEAM_ROLE_DENIED')
            return json(res, 403, { error: code });
          return json(res, 500, { error: 'TEAM_BACKEND_UNAVAILABLE' });
        }
      }
      if (req.url === '/v1/scopes/drafts' && req.method === 'POST') {
        if (!ledger || typeof ledger.appendDraft !== 'function')
          return json(res, 404, { error: 'TEAM_ROUTE_NOT_ENABLED' });
        const token = bearer(req);
        if (!token) return json(res, 401, { error: 'AUTH_SESSION_INVALID' });
        let input;
        try { input = await readJson(req, maxBodyBytes); }
        catch (error) {
          if (error.code === 'AUTH_BODY_TOO_LARGE') return json(res, 413, { error: error.code });
          return json(res, 400, { error: 'AUTH_JSON_INVALID' });
        }
        try {
          return json(res, 200, await ledger.appendDraft(token, input));
        } catch (error) {
          const code = error.message;
          if (code === 'AUTH_SESSION_INVALID' || code === 'AUTH_SESSION_REVOKED') return json(res, 401, { error: 'AUTH_SESSION_INVALID' });
          if (['TEAM_ROLE_DENIED','TEAM_WORKSPACE_DENIED','TEAM_ACTOR_UNVERIFIED'].includes(code)) return json(res, 403, { error: code });
          if (['TEAM_REVISION_CONFLICT','TEAM_IDEMPOTENCY_CONFLICT'].includes(code))
            return json(res, 409, { error: code, sync_status: 'CONFLICT', resolution: 'MANUAL_REVIEW' });
          if (['TEAM_OFFLINE_NOT_AUTHORITATIVE','TEAM_SCOPE_INVALID','TEAM_REVISION_INVALID','TEAM_PAYLOAD_INVALID','TEAM_INTENT_ACTION_FORBIDDEN','TEAM_IDEMPOTENCY_KEY_REQUIRED'].includes(code)) return json(res, 422, { error: code });
          return json(res, 500, { error: 'TEAM_BACKEND_UNAVAILABLE' });
        }
      }
      if (req.url.startsWith('/v1/changes') && req.method === 'GET') {
        if (!ledger || typeof ledger.getChanges !== 'function') return json(res, 404, { error: 'TEAM_ROUTE_NOT_ENABLED' });
        const token = bearer(req);
        if (!token) return json(res, 401, { error: 'AUTH_SESSION_INVALID' });
        let parsed;
        try { parsed = new URL(req.url, 'http://team.local'); }
        catch { return json(res, 422, { error: 'TEAM_CURSOR_INVALID' }); }
        // Reject disguised /v1/changes routes and unsupported/duplicate query
        // parameters. Never let client-supplied workspace or role flags enter
        // the server's authenticated change feed contract.
        if (parsed.pathname !== '/v1/changes')
          return json(res, 404, { error: 'AUTH_ROUTE_NOT_FOUND' });
        const queryKeys = [...parsed.searchParams.keys()];
        if (queryKeys.some(key => !['limit', 'cursor'].includes(key)) ||
            parsed.searchParams.getAll('limit').length > 1 ||
            parsed.searchParams.getAll('cursor').length > 1)
          return json(res, 422, { error: 'TEAM_CURSOR_INVALID' });
        const rawLimit = parsed.searchParams.get('limit');
        const limit = rawLimit === null ? 100 : Number(rawLimit);
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500)
          return json(res, 422, { error: 'TEAM_LIMIT_INVALID' });
        try {
          return json(res, 200, await ledger.getChanges(token, { cursor: parsed.searchParams.get('cursor'), limit }));
        } catch (error) {
          if (error.message === 'AUTH_SESSION_INVALID' || error.message === 'AUTH_SESSION_REVOKED') return json(res, 401, { error: 'AUTH_SESSION_INVALID' });
          if (['TEAM_CURSOR_INVALID','TEAM_LIMIT_INVALID'].includes(error.message)) return json(res, 422, { error: error.message });
          if (error.message === 'TEAM_ROUTE_NOT_ENABLED') return json(res, 404, { error: error.message });
          return json(res, 500, { error: 'TEAM_BACKEND_UNAVAILABLE' });
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
  DEFAULT_MAX_LOGIN_KEYS, DEFAULT_MAX_LOGIN_SOURCE_ATTEMPTS,
  createAuthHttpServer
});
