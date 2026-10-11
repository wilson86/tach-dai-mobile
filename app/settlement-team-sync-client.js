(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KtsSettlementSyncClient = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STATUS = Object.freeze({ PENDING: 'PENDING', SYNCED: 'SYNCED', CONFLICT: 'CONFLICT', BLOCKED: 'BLOCKED' });
  const CURSOR_KEY = 'kts-team-change-cursor-v1';

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function errorCode(error, fallback) { return error && error.code || fallback; }

  function createSyncClient({ fetchImpl, storage, baseUrl = '' } = {}) {
    const fetcher = fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    if (typeof fetcher !== 'function') throw new Error('SYNC_FETCH_REQUIRED');
    const store = storage || { get: function () { return null; }, set: function () {}, remove: function () {} };
    let sessionToken = null; // Deliberately memory-only. Never persist bearer credentials.
    let sequence = 0;
    let cursor = null;
    try { cursor = store.get(CURSOR_KEY) || null; } catch (_) { cursor = null; }
    const pending = new Map();

    function setStatus(item, status, code) {
      item.status = status;
      if (code) item.error = code; else delete item.error;
      return Object.freeze(clone(item));
    }

    async function jsonResponse(response) {
      try { return await response.json(); } catch (_) { return {}; }
    }

    async function request(path, options) {
      const headers = Object.assign({ accept: 'application/json' }, options && options.headers || {});
      if (sessionToken) headers.authorization = 'Bearer ' + sessionToken;
      const response = await fetcher(baseUrl + path, Object.assign({}, options, { headers }));
      return { response, body: await jsonResponse(response) };
    }

    function setSessionToken(token) {
      if (typeof token !== 'string' || token.length < 32) throw new Error('SYNC_SESSION_INVALID');
      sessionToken = token;
      return snapshot();
    }

    async function login(authSubject, password, workspaceId) {
      if (typeof authSubject !== 'string' || !authSubject || typeof password !== 'string' ||
          !password || typeof workspaceId !== 'string' || !workspaceId)
        throw new Error('SYNC_LOGIN_INVALID');
      const result = await request('/v1/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ auth_subject: authSubject, password, workspace_id: workspaceId })
      });
      if (!result.response.ok || typeof result.body.session_token !== 'string')
        throw new Error(result.body.error || 'AUTH_LOGIN_DENIED');
      setSessionToken(result.body.session_token);
      return Object.freeze({ expires_at: result.body.expires_at, authenticated: true });
    }

    async function logout() {
      if (!sessionToken) return clearSession();
      try { await request('/v1/logout', { method: 'POST' }); } catch (_) {}
      return clearSession();
    }

    function clearSession() {
      sessionToken = null;
      for (const item of pending.values()) {
        if (item.status !== STATUS.SYNCED) setStatus(item, STATUS.BLOCKED, 'AUTH_SESSION_REQUIRED');
      }
      return snapshot();
    }

    function queueDraft(scope, payload, baseRevision = 0) {
      if (!scope || typeof scope !== 'object' || !payload || typeof payload !== 'object' || Array.isArray(payload))
        throw new Error('SYNC_DRAFT_INVALID');
      if (!Number.isSafeInteger(baseRevision) || baseRevision < 0) throw new Error('SYNC_REVISION_INVALID');
      const id = 'local_draft_' + (++sequence);
      const item = { id, scope: clone(scope), payload: clone(payload), base_revision: baseRevision, status: STATUS.PENDING };
      pending.set(id, item);
      return Object.freeze(clone(item));
    }

    async function syncDraft(id) {
      const item = pending.get(id);
      if (!item) throw new Error('SYNC_DRAFT_NOT_FOUND');
      if (item.status === STATUS.CONFLICT || item.status === STATUS.BLOCKED) return Object.freeze(clone(item));
      if (!sessionToken) return setStatus(item, STATUS.BLOCKED, 'AUTH_SESSION_REQUIRED');
      try {
        const result = await request('/v1/scopes/drafts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ scope: item.scope, expected_revision: item.base_revision,
            idempotency_key: item.id, payload: item.payload })
        });
        if (result.response.status === 409) return setStatus(item, STATUS.CONFLICT, result.body.error || 'TEAM_REVISION_CONFLICT');
        if (result.response.status === 401) return setStatus(item, STATUS.BLOCKED, 'AUTH_SESSION_INVALID');
        if (!result.response.ok) return setStatus(item, STATUS.BLOCKED, result.body.error || 'SYNC_SERVER_REJECTED');
        item.server_result = clone(result.body);
        item.server_revision = result.body.new_revision;
        return setStatus(item, STATUS.SYNCED);
      } catch (error) {
        return setStatus(item, STATUS.PENDING, errorCode(error, 'SYNC_NETWORK_UNAVAILABLE'));
      }
    }

    async function pullChanges(limit = 100) {
      if (!sessionToken) return { status: STATUS.BLOCKED, error: 'AUTH_SESSION_REQUIRED', items: [] };
      const query = '?limit=' + encodeURIComponent(String(limit)) + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
      try {
        const result = await request('/v1/changes' + query, { method: 'GET' });
        if (result.response.status === 401) return { status: STATUS.BLOCKED, error: 'AUTH_SESSION_INVALID', items: [] };
        if (!result.response.ok) return { status: STATUS.BLOCKED, error: result.body.error || 'SYNC_SERVER_REJECTED', items: [] };
        cursor = result.body.next_cursor || cursor;
        try { if (cursor) store.set(CURSOR_KEY, cursor); } catch (_) {}
        return { status: STATUS.SYNCED, items: Array.isArray(result.body.items) ? clone(result.body.items) : [], next_cursor: cursor };
      } catch (error) {
        return { status: STATUS.PENDING, error: errorCode(error, 'SYNC_NETWORK_UNAVAILABLE'), items: [] };
      }
    }

    async function reconnect() {
      const pulled = await pullChanges();
      if (pulled.status === STATUS.BLOCKED) return { pull: pulled, drafts: [] };
      const drafts = [];
      for (const item of pending.values()) {
        if (item.status === STATUS.PENDING) drafts.push(await syncDraft(item.id));
      }
      return { pull: pulled, drafts };
    }

    function snapshot() {
      return Object.freeze({
        authenticated: Boolean(sessionToken), cursor,
        drafts: Object.freeze(Array.from(pending.values()).map(item => Object.freeze(clone(item))))
      });
    }

    return Object.freeze({ login, logout, setSessionToken, clearSession, queueDraft, syncDraft, pullChanges, reconnect, snapshot, STATUS });
  }

  return Object.freeze({ STATUS, CURSOR_KEY, createSyncClient });
}));
