(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KtsSettlementSyncClient = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STATUS = Object.freeze({ PENDING: 'PENDING', SYNCED: 'SYNCED', CONFLICT: 'CONFLICT', BLOCKED: 'BLOCKED' });
  const CURSOR_KEY = 'kts-team-change-cursor-v1';
  const MAX_SIGNED_BIGINT = 9223372036854775807n;
  function verifiedFeedSequence(value) {
    if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0;
    if (typeof value !== 'string' || !/^[1-9][0-9]{0,18}$/.test(value)) return false;
    return BigInt(value) <= MAX_SIGNED_BIGINT;
  }

  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  // A per-client counter silently reuses idempotency keys across devices.
  // Financial write keys MUST use cryptographic randomness, with no Math.random fallback.
  function newDraftId() {
    let uuid = null;
    if (typeof globalThis !== 'undefined' && globalThis.crypto &&
        typeof globalThis.crypto.randomUUID === 'function') uuid = globalThis.crypto.randomUUID();
    else if (typeof require === 'function') uuid = require('node:crypto').randomUUID();
    if (typeof uuid !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(uuid))
      throw new Error('SYNC_SECURE_RANDOM_UNAVAILABLE');
    return 'draft_' + uuid.replace(/-/g, '').toLowerCase();
  }
  function errorCode(error, fallback) { return error && error.code || fallback; }

  function normalizeBaseUrl(value) {
    if (value === '') return '';
    if (typeof value !== 'string' || value !== value.trim()) throw new Error('SYNC_BASE_URL_INVALID');
    let parsed;
    try { parsed = new URL(value); } catch (_) { throw new Error('SYNC_BASE_URL_INVALID'); }
    if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('SYNC_BASE_URL_INVALID');
    const host = parsed.hostname.toLowerCase();
    const loopback = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback))
      throw new Error('SYNC_BASE_URL_INSECURE');
    return value.replace(/\/+$/, '');
  }

  function createSyncClient({ fetchImpl, storage, baseUrl = '' } = {}) {
    const fetcher = fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    if (typeof fetcher !== 'function') throw new Error('SYNC_FETCH_REQUIRED');
    const endpoint = normalizeBaseUrl(baseUrl);
    const store = storage || { get: function () { return null; }, set: function () {}, remove: function () {} };
    let sessionToken = null; // Deliberately memory-only. Never persist bearer credentials.
    let workspaceId = null;
    let sessionEpoch = 0;
     // Cursor is session-specific. Never reuse a prior user's/workspace's cursor
    // from generic local storage: doing so can skip new user's change events.
    let cursor = null;
    const pending = new Map();
    const listeners = new Set();

    function emit() {
      const state = snapshot();
      for (const listener of listeners) {
        try { listener(state); } catch (_) {}
      }
    }

    function setStatus(item, status, code) {
      item.status = status;
      if (code) item.error = code; else delete item.error;
      emit();
      return Object.freeze(clone(item));
    }

    async function jsonResponse(response) {
      try { return await response.json(); } catch (_) { return {}; }
    }

    async function request(path, options) {
      const headers = Object.assign({ accept: 'application/json' }, options && options.headers || {});
      if (sessionToken) headers.authorization = 'Bearer ' + sessionToken;
      const response = await fetcher(endpoint + path, Object.assign({}, options, { headers }));
      return { response, body: await jsonResponse(response) };
    }

    function hasUnsyncedDrafts() {
      return Array.from(pending.values()).some(item => item.status !== STATUS.SYNCED);
    }

    function setSessionToken(token, workspace = null, { discardPending = false } = {}) {
      if (typeof token !== 'string' || token.length < 32) throw new Error('SYNC_SESSION_INVALID');
      if (workspace !== null && (typeof workspace !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(workspace)))
        throw new Error('SYNC_WORKSPACE_INVALID');
      if (hasUnsyncedDrafts() && discardPending !== true)
        throw new Error('SYNC_UNSENT_DRAFTS_REQUIRE_DECISION');
      // Switches between people or workspaces must discard in-memory financial
      // snapshots, including previously SYNCED rows, and start a fresh feed.
      sessionEpoch += 1;
      sessionToken = token;
      workspaceId = workspace;
      pending.clear();
      cursor = null;
      emit();
      return snapshot();
    }

    async function login(authSubject, password, workspaceId) {
      if (hasUnsyncedDrafts()) throw new Error('SYNC_UNSENT_DRAFTS_REQUIRE_DECISION');
      if (typeof authSubject !== 'string' || !authSubject || typeof password !== 'string' ||
          !password || typeof workspaceId !== 'string' || !workspaceId)
        throw new Error('SYNC_LOGIN_INVALID');
      const epoch = sessionEpoch;
      const result = await request('/v1/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ auth_subject: authSubject, password, workspace_id: workspaceId })
      });
      if (epoch !== sessionEpoch) throw new Error('SYNC_SESSION_CHANGED');
      if (!result.response.ok || typeof result.body.session_token !== 'string')
        throw new Error(result.body.error || 'AUTH_LOGIN_DENIED');
      setSessionToken(result.body.session_token, workspaceId);
      return Object.freeze({ expires_at: result.body.expires_at, authenticated: true });
    }

    async function logout({ discardPending = false } = {}) {
      if (hasUnsyncedDrafts() && discardPending !== true)
        throw new Error('SYNC_UNSENT_DRAFTS_REQUIRE_DECISION');
      if (!sessionToken) return clearSession();
      const epoch = sessionEpoch;
      try { await request('/v1/logout', { method: 'POST' }); } catch (_) {}
      // A delayed logout response from a previous identity may not log out a
      // newer, independently authenticated session.
      if (epoch !== sessionEpoch) return snapshot();
      return clearSession();
    }

    function clearSession() {
      sessionEpoch += 1;
      sessionToken = null;
      workspaceId = null;
      cursor = null;
      // Prototype drafts are volatile. Do not display a previous user's data
      // after logout or let a later login submit it under another identity.
      pending.clear();
      emit();
      return snapshot();
    }

    function subscribe(listener) {
      if (typeof listener !== 'function') throw new Error('SYNC_LISTENER_INVALID');
      listeners.add(listener);
      listener(snapshot());
      return function unsubscribe() { listeners.delete(listener); };
    }

    function queueDraft(scope, payload, baseRevision = 0) {
      if (!scope || typeof scope !== 'object' || !payload || typeof payload !== 'object' || Array.isArray(payload))
        throw new Error('SYNC_DRAFT_INVALID');
      if (!Number.isSafeInteger(baseRevision) || baseRevision < 0) throw new Error('SYNC_REVISION_INVALID');
      if (workspaceId !== null && scope.workspace_id !== workspaceId)
        throw new Error('SYNC_WORKSPACE_MISMATCH');
      const id = newDraftId();
      const item = { id, scope: clone(scope), payload: clone(payload), base_revision: baseRevision, status: STATUS.PENDING };
      pending.set(id, item);
      emit();
      return Object.freeze(clone(item));
    }

    async function syncDraft(id) {
      const item = pending.get(id);
      if (!item) throw new Error('SYNC_DRAFT_NOT_FOUND');
      if (item.status === STATUS.CONFLICT || item.status === STATUS.BLOCKED) return Object.freeze(clone(item));
      if (!sessionToken) return setStatus(item, STATUS.BLOCKED, 'AUTH_SESSION_REQUIRED');
      if (workspaceId !== null && item.scope.workspace_id !== workspaceId)
        return setStatus(item, STATUS.BLOCKED, 'SYNC_WORKSPACE_MISMATCH');
      const epoch = sessionEpoch;
      try {
        const result = await request('/v1/scopes/drafts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ scope: item.scope, expected_revision: item.base_revision,
            idempotency_key: item.id, payload: item.payload })
        });
        if (epoch !== sessionEpoch) return Object.freeze({ id, status: STATUS.BLOCKED, error: 'SYNC_SESSION_CHANGED' });
        if (result.response.status === 409) return setStatus(item, STATUS.CONFLICT, result.body.error || 'TEAM_REVISION_CONFLICT');
        if (result.response.status === 401) return setStatus(item, STATUS.BLOCKED, 'AUTH_SESSION_INVALID');
        if (!result.response.ok) return setStatus(item, STATUS.BLOCKED, result.body.error || 'SYNC_SERVER_REJECTED');
        // HTTP 200 alone does not prove a financial draft reached the ledger.
        if (result.body.sync_status !== STATUS.SYNCED ||
            typeof result.body.event_id !== 'string' ||
            !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(result.body.event_id) ||
            typeof result.body.replayed !== 'boolean' ||
            !verifiedFeedSequence(result.body.feed_seq) ||
            !Number.isSafeInteger(result.body.new_revision) ||
            result.body.new_revision !== item.base_revision + 1)
          return setStatus(item, STATUS.BLOCKED, 'SYNC_ACK_UNVERIFIED');
        item.server_result = clone(result.body);
        item.server_revision = result.body.new_revision;
        return setStatus(item, STATUS.SYNCED);
      } catch (error) {
        if (epoch !== sessionEpoch) return Object.freeze({ id, status: STATUS.BLOCKED, error: 'SYNC_SESSION_CHANGED' });
        return setStatus(item, STATUS.PENDING, errorCode(error, 'SYNC_NETWORK_UNAVAILABLE'));
      }
    }

    async function pullChanges(limit = 100) {
      if (!sessionToken) return { status: STATUS.BLOCKED, error: 'AUTH_SESSION_REQUIRED', items: [] };
      const epoch = sessionEpoch;
      const query = '?limit=' + encodeURIComponent(String(limit)) + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
      try {
        const result = await request('/v1/changes' + query, { method: 'GET' });
        if (epoch !== sessionEpoch) return { status: STATUS.BLOCKED, error: 'SYNC_SESSION_CHANGED', items: [] };
        if (result.response.status === 401) return { status: STATUS.BLOCKED, error: 'AUTH_SESSION_INVALID', items: [] };
        if (!result.response.ok) return { status: STATUS.BLOCKED, error: result.body.error || 'SYNC_SERVER_REJECTED', items: [] };
        // Only a verified, contiguous page may advance the server change cursor.
        // A partial/forged 200 response must not skip unconsumed financial events.
        const page = result.body;
        if (!page || page.sync_status !== STATUS.SYNCED || !Array.isArray(page.items) ||
            (page.items.length > 0 && (typeof page.next_cursor !== 'string' || !page.next_cursor)) ||
            (page.items.length === 0 && page.next_cursor != null && page.next_cursor !== cursor))
          return { status: STATUS.BLOCKED, error: 'SYNC_FEED_UNVERIFIED', items: [] };
        // Until per-user/per-workspace durable cursors are independently
        // authenticated, keep the change cursor only in this session's memory.
        if (page.items.length > 0) cursor = page.next_cursor;
        return { status: STATUS.SYNCED, items: clone(page.items), next_cursor: cursor, has_more: page.has_more === true };
      } catch (error) {
        if (epoch !== sessionEpoch) return { status: STATUS.BLOCKED, error: 'SYNC_SESSION_CHANGED', items: [] };
        return { status: STATUS.PENDING, error: errorCode(error, 'SYNC_NETWORK_UNAVAILABLE'), items: [] };
      }
    }

    async function readScope(scope) {
      // Read-only team snapshot. Never turn it into a local financial settlement
      // or accept a scope from a different user/workspace.
      if (!sessionToken || workspaceId === null)
        return { status: STATUS.BLOCKED, error: 'AUTH_SESSION_REQUIRED' };
      if (!scope || scope.workspace_id !== workspaceId ||
          typeof scope.partner_id !== 'string' ||
          !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(scope.partner_id) ||
          typeof scope.business_date !== 'string' ||
          !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(scope.business_date) ||
          !['mn','mt','mb'].includes(scope.region))
        return { status: STATUS.BLOCKED, error: 'SYNC_SCOPE_INVALID' };
      const epoch = sessionEpoch;
      try {
        const path = '/v1/scopes/' + scope.partner_id + '/' + scope.business_date + '/' + scope.region;
        const result = await request(path, { method: 'GET' });
        if (epoch !== sessionEpoch)
          return { status: STATUS.BLOCKED, error: 'SYNC_SESSION_CHANGED' };
        if (result.response.status === 401)
          return { status: STATUS.BLOCKED, error: 'AUTH_SESSION_INVALID' };
        if (!result.response.ok)
          return { status: STATUS.BLOCKED, error: result.body.error || 'SYNC_SERVER_REJECTED' };
        const row = result.body;
        const revision = row && row.revision;
        const numericRevision = typeof revision === 'number'
          ? Number.isSafeInteger(revision) && revision >= 0
          : typeof revision === 'string' && /^(0|[1-9][0-9]*)$/.test(revision);
        if (!row || row.workspace_id !== workspaceId ||
            row.partner_id !== scope.partner_id ||
            row.business_date !== scope.business_date ||
            row.region !== scope.region || !numericRevision)
          return { status: STATUS.BLOCKED, error: 'SYNC_SCOPE_UNVERIFIED' };
        return { status: STATUS.SYNCED, scope: clone(row) };
      } catch (error) {
        if (epoch !== sessionEpoch)
          return { status: STATUS.BLOCKED, error: 'SYNC_SESSION_CHANGED' };
        return { status: STATUS.PENDING, error: errorCode(error, 'SYNC_NETWORK_UNAVAILABLE') };
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
        authenticated: Boolean(sessionToken), cursor, workspace_id: workspaceId,
        drafts: Object.freeze(Array.from(pending.values()).map(item => Object.freeze(clone(item))))
      });
    }

    return Object.freeze({ login, logout, subscribe, setSessionToken, clearSession, queueDraft, syncDraft, pullChanges, readScope, reconnect, snapshot, STATUS });
  }

  return Object.freeze({ STATUS, CURSOR_KEY, createSyncClient });
}));
