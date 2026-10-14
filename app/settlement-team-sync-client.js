(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./settlement-team-review-audit.js'));
  else root.KtsSettlementSyncClient = factory(root.KtsTeamReviewAudit);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Audit) {
  'use strict';

  const STATUS = Object.freeze({ PENDING: 'PENDING', SYNCED: 'SYNCED', CONFLICT: 'CONFLICT', BLOCKED: 'BLOCKED' });
  const REVIEW_STATES = Object.freeze(['DRAFT','PENDING_REVIEW','REVIEWED','CLOSED','REOPEN_REQUESTED']);
  const CURSOR_KEY = 'kts-team-change-cursor-v1';
  const MAX_SIGNED_BIGINT = 9223372036854775807n;
  function verifiedFeedSequence(value) {
    if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0;
    if (typeof value !== 'string' || !/^[1-9][0-9]{0,18}$/.test(value)) return false;
    return BigInt(value) <= MAX_SIGNED_BIGINT;
  }

  const FEED_EVENT_ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
  function verifiedFeedItems(items, workspaceId, limit) {
    if (!Array.isArray(items) || items.length>limit) return false;
    let previous=0n;
    for(const item of items){
      if(!item || typeof item!=='object' || Array.isArray(item) ||
         typeof item.event_id!=='string' || !FEED_EVENT_ID.test(item.event_id))return false;
      // Strict tenant checks on authenticated browser sessions; never render
      // another workspace's event even if the server misroutes a feed.
      if(workspaceId!==null){
        if(item.workspace_id!==workspaceId || !verifiedFeedSequence(item.feed_seq))return false;
        const sequence=BigInt(item.feed_seq);
        if(sequence<=previous)return false;
        previous=sequence;
      }
    }
    // Validate audit actor, tenant and transition before cursor moves.
    if(workspaceId!==null){
      if(!Audit||typeof Audit.auditRows!=='function')return false;
      try{Audit.auditRows(items,workspaceId);}catch(_){return false;}
    }
    return true;
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

  function trustedOrigin(parsed) {
    const host = parsed.hostname.toLowerCase();
    const loopback = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
    return parsed.protocol === 'https:' || (parsed.protocol === 'http:' && loopback);
  }

  function normalizeBaseUrl(value) {
    // Empty baseUrl is same-origin. A remote page loaded via HTTP must not
    // silently send settlement passwords or bearer sessions over cleartext.
    // An explicit HTTPS API URL does NOT make an insecure page itself safe.
    const browserLocation = typeof globalThis !== 'undefined' ? globalThis.location : null;
    if (browserLocation) {
      let page;
      try { page = new URL(browserLocation.href); }
      catch (_) { throw new Error('SYNC_PAGE_ORIGIN_INVALID'); }
      if (!trustedOrigin(page)) throw new Error('SYNC_PAGE_ORIGIN_INSECURE');
    }
    if (value === '') return '';
    if (typeof value !== 'string' || value !== value.trim()) throw new Error('SYNC_BASE_URL_INVALID');
    let parsed;
    try { parsed = new URL(value); } catch (_) { throw new Error('SYNC_BASE_URL_INVALID'); }
    if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('SYNC_BASE_URL_INVALID');
    if (!trustedOrigin(parsed))
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
    // The last verified tenant sequence persists across pages, never across sessions.
    let lastAcceptedFeedSequence = null;
    const pending = new Map();
    const draftFlights = new Set();
    const reviewAttempts = new Map(); // Volatile; same-key retries within this session.
    const reviewFlights = new Set();
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
      return Array.from(pending.values()).some(item => item.status !== STATUS.SYNCED) ||
        Array.from(reviewAttempts.values()).some(item => item.status !== STATUS.SYNCED);
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
      reviewAttempts.clear();
      cursor = null;
      lastAcceptedFeedSequence = null;
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
      let revokeVerified = false;
      try {
        const result = await request('/v1/logout', { method: 'POST' });
        revokeVerified = result.response.status === 204;
      } catch (_) {
        // On network loss the server may or may not have revoked the bearer.
        // Never claim a remote logout without a verified 204 response.
      }
      // A delayed logout response from a previous identity may not log out a
      // newer, independently authenticated session.
      if (epoch !== sessionEpoch) return snapshot();
      const localState = clearSession(); // Always discard memory-only bearer locally.
      if (!revokeVerified) throw new Error('SYNC_LOGOUT_REVOKE_UNVERIFIED');
      return localState;
    }

    function clearSession() {
      sessionEpoch += 1;
      sessionToken = null;
      workspaceId = null;
      cursor = null;
      lastAcceptedFeedSequence = null;
      // Prototype drafts are volatile. Do not display a previous user's data
      // after logout or let a later login submit it under another identity.
      pending.clear();
      reviewAttempts.clear();
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
      if (draftFlights.has(id))
        return Object.freeze({ id, status: STATUS.BLOCKED, error: 'SYNC_DRAFT_ALREADY_IN_FLIGHT' });
      if (item.status === STATUS.CONFLICT || item.status === STATUS.BLOCKED) return Object.freeze(clone(item));
      if (!sessionToken) return setStatus(item, STATUS.BLOCKED, 'AUTH_SESSION_REQUIRED');
      if (workspaceId !== null && item.scope.workspace_id !== workspaceId)
        return setStatus(item, STATUS.BLOCKED, 'SYNC_WORKSPACE_MISMATCH');
      const epoch = sessionEpoch;
      draftFlights.add(id);
      try {
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
      } finally {
        draftFlights.delete(id);
      }
    }


    // Only a deliberate human button press should create a review intent.
    // Never regenerate a key for a network-uncertain same-scope transition.
    async function reviewScope(action,scope,expectedRevision,{retryOnly=false}={}) {
      if(!['submit_review','approve_review'].includes(action))
        throw Error('SYNC_REVIEW_ACTION_INVALID');
      if(!sessionToken || workspaceId===null)
        throw Error('AUTH_SESSION_REQUIRED');
      if(!scope || scope.workspace_id!==workspaceId ||
          typeof scope.partner_id!=='string' ||
          !/^(?:fake|demo|synthetic)_[a-z0-9_-]{1,64}$/.test(scope.partner_id) ||
          typeof scope.business_date!=='string' ||
          !/^\d{4}-\d{2}-\d{2}$/.test(scope.business_date) ||
          !['mn','mt','mb'].includes(scope.region))
        throw Error('SYNC_SCOPE_INVALID');
      if(!Number.isSafeInteger(expectedRevision) || expectedRevision<0 ||
          !Number.isSafeInteger(expectedRevision+1))
        throw Error('SYNC_REVISION_INVALID');
      const target=JSON.stringify([action,workspaceId,scope.partner_id,scope.business_date,
        scope.region,expectedRevision]);
      let attempt=reviewAttempts.get(target);
      if(!attempt && retryOnly===true)throw Error('SYNC_REVIEW_RETRY_NOT_FOUND');
      if(!attempt){
        attempt={action,scope:clone(scope),expected_revision:expectedRevision,
          idempotency_key:newDraftId(),status:STATUS.PENDING};
        reviewAttempts.set(target,attempt);
        emit();
      }
      if(attempt.status!==STATUS.PENDING)return Object.freeze(clone(attempt));
      if(reviewFlights.has(target))
        return Object.freeze({status:STATUS.BLOCKED,error:'SYNC_REVIEW_ALREADY_IN_FLIGHT'});
      const epoch=sessionEpoch;
      reviewFlights.add(target);
      try{
        let result;
        try{
          result=await request('/v1/scopes/review',{
            method:'POST',headers:{'content-type':'application/json'},
            body:JSON.stringify({action,scope:attempt.scope,
              expected_revision:attempt.expected_revision,idempotency_key:attempt.idempotency_key})
          });
        }catch(error){
          if(epoch!==sessionEpoch)return Object.freeze({status:STATUS.BLOCKED,error:'SYNC_SESSION_CHANGED'});
          return setStatus(attempt,STATUS.PENDING,errorCode(error,'SYNC_NETWORK_UNAVAILABLE'));
        }
        if(epoch!==sessionEpoch)return Object.freeze({status:STATUS.BLOCKED,error:'SYNC_SESSION_CHANGED'});
        const status=result.response.status;
        if(status===409)return setStatus(attempt,STATUS.CONFLICT,result.body.error||'TEAM_REVISION_CONFLICT');
        if(status>=500)return setStatus(attempt,STATUS.PENDING,'SYNC_REVIEW_RECEIPT_UNCERTAIN');
        if(status===401||status===403||status===404||!result.response.ok)
          return setStatus(attempt,STATUS.BLOCKED,result.body.error||'SYNC_REVIEW_SERVER_REJECTED');
        const body=result.body,expectedState=action==='submit_review'?'PENDING_REVIEW':'REVIEWED';
        const expectedKey=[workspaceId,scope.partner_id,scope.business_date,scope.region].join(':');
        if(!body || body.sync_status!==STATUS.SYNCED || body.review_state!==expectedState ||
            body.scope_key!==expectedKey || body.replayed!==true && body.replayed!==false ||
            typeof body.event_id!=='string' || !FEED_EVENT_ID.test(body.event_id) ||
            !verifiedFeedSequence(body.feed_seq) ||
            !Number.isSafeInteger(body.new_revision) ||
            body.new_revision!==attempt.expected_revision+1)
          return setStatus(attempt,STATUS.BLOCKED,'SYNC_REVIEW_RECEIPT_UNVERIFIED');
        attempt.server_result=clone(body);
        return setStatus(attempt,STATUS.SYNCED);
      }finally{
        reviewFlights.delete(target);
      }
    }

    async function pullChanges(limit = 100) {
      if (!sessionToken) return { status: STATUS.BLOCKED, error: 'AUTH_SESSION_REQUIRED', items: [] };
      const epoch = sessionEpoch;
      const requestedCursor = cursor;
      const requestedWorkspace = workspaceId;
      const query = '?limit=' + encodeURIComponent(String(limit)) +
        (requestedCursor ? '&cursor=' + encodeURIComponent(requestedCursor) : '');
      try {
        const result = await request('/v1/changes' + query, { method: 'GET' });
        if (epoch !== sessionEpoch) return { status: STATUS.BLOCKED, error: 'SYNC_SESSION_CHANGED', items: [] };
        // Two parallel polls for the same session can complete out of order.
        // A late response must never move the financial change cursor backward.
        if (cursor !== requestedCursor)
          return { status: STATUS.BLOCKED, error: 'SYNC_STALE_FEED_RESPONSE', items: [] };
        if (result.response.status === 401) return { status: STATUS.BLOCKED, error: 'AUTH_SESSION_INVALID', items: [] };
        if (!result.response.ok) return { status: STATUS.BLOCKED, error: result.body.error || 'SYNC_SERVER_REJECTED', items: [] };
        // Only a verified, contiguous page may advance the server change cursor.
        // A partial/forged 200 response must not skip unconsumed financial events.
        const page = result.body;
        if (!page || page.sync_status !== STATUS.SYNCED ||
            !verifiedFeedItems(page.items,requestedWorkspace,limit) ||
            // A valid-looking replay on the NEXT page is not new history.
            (requestedWorkspace !== null && page.items.length > 0 &&
              lastAcceptedFeedSequence !== null &&
              BigInt(page.items[0].feed_seq) <= lastAcceptedFeedSequence) ||
            (page.items.length > 0 && (typeof page.next_cursor !== 'string' || !page.next_cursor)) ||
            (page.items.length === 0 && page.next_cursor != null && page.next_cursor !== cursor))
          return { status: STATUS.BLOCKED, error: 'SYNC_FEED_UNVERIFIED', items: [] };
        // Until per-user/per-workspace durable cursors are independently
        // authenticated, keep the change cursor only in this session's memory.
        if (page.items.length > 0) {
          cursor = page.next_cursor;
          if (requestedWorkspace !== null)
            lastAcceptedFeedSequence = BigInt(page.items[page.items.length - 1].feed_seq);
        }
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
          : typeof revision === 'string' && /^(0|[1-9][0-9]{0,15})$/.test(revision) &&
            BigInt(revision) <= BigInt(Number.MAX_SAFE_INTEGER);
        if (!row || row.workspace_id !== workspaceId ||
            row.partner_id !== scope.partner_id ||
            row.business_date !== scope.business_date ||
            row.region !== scope.region || !numericRevision ||
            !REVIEW_STATES.includes(row.state) ||
            (['PENDING_REVIEW','REVIEWED','CLOSED'].includes(row.state) &&
              (typeof row.submitted_by !== 'string' ||
               !FEED_EVENT_ID.test(row.submitted_by))) ||
            (['REVIEWED','CLOSED'].includes(row.state) &&
              (typeof row.reviewed_by !== 'string' ||
               !FEED_EVENT_ID.test(row.reviewed_by) ||
               row.reviewed_by === row.submitted_by)) ||
            (row.state === 'PENDING_REVIEW' && row.reviewed_by != null))
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
      const volatileUnsentCount=Array.from(pending.values())
        .filter(item=>item.status!==STATUS.SYNCED).length+
        Array.from(reviewAttempts.values()).filter(item=>item.status!==STATUS.SYNCED).length;
      return Object.freeze({
        authenticated: Boolean(sessionToken), cursor, workspace_id: workspaceId,
        // Financial drafts are only held in this JavaScript process. A browser
        // reload/close can destroy them; these fields let the UI warn before
        // data loss WITHOUT falsely claiming any local/offline persistence.
        draft_persistence: 'MEMORY_ONLY',
        volatile_unsent_count: volatileUnsentCount,
        reload_loss_risk: volatileUnsentCount>0,
        drafts: Object.freeze(Array.from(pending.values()).map(item => Object.freeze(clone(item)))),
        review_attempts: Object.freeze(Array.from(reviewAttempts.values())
          .map(item=>Object.freeze(clone(item))))
      });
    }

    return Object.freeze({ login, logout, subscribe, setSessionToken, clearSession, queueDraft, syncDraft, reviewScope, pullChanges, readScope, reconnect, snapshot, STATUS });
  }

  return Object.freeze({ STATUS, CURSOR_KEY, createSyncClient });
}));
