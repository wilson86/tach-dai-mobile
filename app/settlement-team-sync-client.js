(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./settlement-team-review-audit.js'));
  else root.KtsSettlementSyncClient = factory(root.KtsTeamReviewAudit);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Audit) {
  'use strict';

  const STATUS = Object.freeze({ PENDING: 'PENDING', SYNCED: 'SYNCED', CONFLICT: 'CONFLICT', BLOCKED: 'BLOCKED' });
  function validBusinessDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    if (year < 1 || month < 1 || month > 12) return false;
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return day >= 1 && day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month-1];
  }
    const REVIEW_STATES = Object.freeze(['DRAFT','PENDING_REVIEW','REVIEWED','CLOSED','REOPEN_REQUESTED']);
  const CURSOR_KEY = 'kts-team-change-cursor-v1';
  const MAX_SIGNED_BIGINT = 9223372036854775807n;
  const RECENT_EVENT_ID_LIMIT = 500; // Bounded client-only replay cross-check.
  function verifiedFeedSequence(value) {
    if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0;
    if (typeof value !== 'string' || !/^[1-9][0-9]{0,18}$/.test(value)) return false;
    return BigInt(value) <= MAX_SIGNED_BIGINT;
  }

  const FEED_EVENT_ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
  function verifiedFeedItems(items, workspaceId, limit, afterSequence = null, rememberedIds = null) {
    if (!Array.isArray(items) || items.length>limit) return false;
    // Immutable event IDs must not repeat within a page or the recent session
    // memory; a duplicate could otherwise consume a valid cursor invisibly.
    const pageIds=new Set();
    // The synthetic durable ledger allocates one immutable event per tenant
    // sequence. Missing rows are not allowed to become a verified cursor.
    let previous=afterSequence === null ? 0n : afterSequence;
    for(const item of items){
      if(!item || typeof item!=='object' || Array.isArray(item) ||
         typeof item.event_id!=='string' || !FEED_EVENT_ID.test(item.event_id) ||
         pageIds.has(item.event_id) ||
         (rememberedIds && rememberedIds.has(item.event_id)))return false;
      pageIds.add(item.event_id);
      // Strict tenant checks on authenticated browser sessions; never render
      // another workspace's event even if the server misroutes a feed.
      if(workspaceId!==null){
        if(item.workspace_id!==workspaceId || !verifiedFeedSequence(item.feed_seq))return false;
        const sequence=BigInt(item.feed_seq);
        if(sequence!==previous+1n)return false;
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
    let loginInFlight = false; // Only one pending identity exchange per browser client.
    let logoutInFlight = false; // No new money intents while remote revoke is uncertain.
     // Cursor is session-specific. Never reuse a prior user's/workspace's cursor
    // from generic local storage: doing so can skip new user's change events.
    let cursor = null;
    // The last verified tenant sequence persists across pages, never across sessions.
    let lastAcceptedFeedSequence = null;
    const recentFeedEventIds = new Set();
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
      // Login credentials may belong to a different account. An old bearer
      // must never accompany a new identity exchange, even on the same origin.
      if (sessionToken && path !== '/v1/login')
        headers.authorization = 'Bearer ' + sessionToken;
      const response = await fetcher(endpoint + path, Object.assign({}, options, { headers }));
      return { response, body: await jsonResponse(response) };
    }

    function hasUnsyncedDrafts() {
      return Array.from(pending.values()).some(item => item.status !== STATUS.SYNCED) ||
        Array.from(reviewAttempts.values()).some(item => item.status !== STATUS.SYNCED);
    }

    function setSessionToken(token, workspace = null, { discardPending = false } = {}) {
      // Match durable PostgreSQL tokenHash's base64url-shaped input contract.
      // Never place control characters or whitespace into an Authorization header.
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(token))
        throw new Error('SYNC_SESSION_INVALID');
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
      recentFeedEventIds.clear();
      emit();
      return snapshot();
    }

    async function login(authSubject, password, workspaceId) {
      if (logoutInFlight) throw new Error('SYNC_LOGOUT_IN_FLIGHT');
      if (loginInFlight) throw new Error('SYNC_LOGIN_IN_FLIGHT');
      // Report at-risk unsent data before the general active-account guard,
      // so the operator gets the actionable loss-prevention reason.
      if (hasUnsyncedDrafts()) throw new Error('SYNC_UNSENT_DRAFTS_REQUIRE_DECISION');
      if (sessionToken) throw new Error('SYNC_ACTIVE_SESSION_LOGOUT_REQUIRED');
      if (typeof authSubject !== 'string' || !authSubject || typeof password !== 'string' ||
          !password || typeof workspaceId !== 'string' || !workspaceId)
        throw new Error('SYNC_LOGIN_INVALID');
      const epoch = sessionEpoch;
      loginInFlight = true;
      try {
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
      } finally {
        loginInFlight = false;
      }
    }

    async function logout({ discardPending = false } = {}) {
      if (logoutInFlight) throw new Error('SYNC_LOGOUT_IN_FLIGHT');
      if (hasUnsyncedDrafts() && discardPending !== true)
        throw new Error('SYNC_UNSENT_DRAFTS_REQUIRE_DECISION');
      if (!sessionToken) return clearSession({discardPending});
      const epoch = sessionEpoch;
      logoutInFlight = true;
      try {
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
        const localState = clearSession({discardPending:true}); // After explicit decision.
        if (!revokeVerified) throw new Error('SYNC_LOGOUT_REVOKE_UNVERIFIED');
        return localState;
      } finally {
        logoutInFlight = false;
      }
    }

    function clearSession({ discardPending = false } = {}) {
      // A public reset must not bypass the unsent financial-intent decision.
      if (hasUnsyncedDrafts() && discardPending !== true)
        throw new Error('SYNC_UNSENT_DRAFTS_REQUIRE_DECISION');
      sessionEpoch += 1;
      sessionToken = null;
      workspaceId = null;
      cursor = null;
      lastAcceptedFeedSequence = null;
      recentFeedEventIds.clear();
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
      if (logoutInFlight) throw new Error('SYNC_LOGOUT_IN_FLIGHT');
      if (!sessionToken) throw new Error('AUTH_SESSION_REQUIRED');
      if (!scope || typeof scope !== 'object' || !payload || typeof payload !== 'object' || Array.isArray(payload))
        throw new Error('SYNC_DRAFT_INVALID');
      if (!Number.isSafeInteger(baseRevision) || baseRevision < 0 ||
          !Number.isSafeInteger(baseRevision + 1)) throw new Error('SYNC_REVISION_INVALID');
      if (workspaceId !== null && scope.workspace_id !== workspaceId)
        throw new Error('SYNC_WORKSPACE_MISMATCH');
      if (!validBusinessDate(scope.business_date))
        throw new Error('SYNC_SCOPE_INVALID');
      const id = newDraftId();
      const item = { id, scope: clone(scope), payload: clone(payload), base_revision: baseRevision, status: STATUS.PENDING };
      pending.set(id, item);
      emit();
      return Object.freeze(clone(item));
    }

    async function syncDraft(id) {
      if (logoutInFlight) return Object.freeze({id,status:STATUS.BLOCKED,
        error:'SYNC_LOGOUT_IN_FLIGHT'});
      const item = pending.get(id);
      if (!item) throw new Error('SYNC_DRAFT_NOT_FOUND');
      if (draftFlights.has(id))
        return Object.freeze({ id, status: STATUS.BLOCKED, error: 'SYNC_DRAFT_ALREADY_IN_FLIGHT' });
      // SYNCED is an authoritative, verified receipt: never create a
      // second network write by re-clicking the same previously saved draft.
      if (item.status === STATUS.SYNCED || item.status === STATUS.CONFLICT ||
          item.status === STATUS.BLOCKED) return Object.freeze(clone(item));
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
        // A 5xx can occur AFTER PostgreSQL committed but BEFORE an ACK reached the phone.
        // Keep the same durable-on-server idempotency key for an explicit retry.
        if (result.response.status >= 500)
          return setStatus(item, STATUS.PENDING, 'SYNC_DRAFT_RECEIPT_UNCERTAIN');
        if (!result.response.ok) return setStatus(item, STATUS.BLOCKED, result.body.error || 'SYNC_SERVER_REJECTED');
        // A receipt for another scope must never mark this draft as committed.
        const scopeKey = [item.scope.workspace_id,item.scope.partner_id,
          item.scope.business_date,item.scope.region].join(':');
        // HTTP 200 alone does not prove a financial draft reached the ledger.
        if (result.body.sync_status !== STATUS.SYNCED ||
            result.body.scope_key !== scopeKey ||
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
      if(logoutInFlight)throw Error('SYNC_LOGOUT_IN_FLIGHT');
      if(!['submit_review','approve_review'].includes(action))
        throw Error('SYNC_REVIEW_ACTION_INVALID');
      if(!sessionToken || workspaceId===null)
        throw Error('AUTH_SESSION_REQUIRED');
      if(!scope || scope.workspace_id!==workspaceId ||
          typeof scope.partner_id!=='string' ||
          !/^(?:fake|demo|synthetic)_[a-z0-9_-]{1,64}$/.test(scope.partner_id) ||
          typeof scope.business_date!=='string' ||
          !validBusinessDate(scope.business_date) ||
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
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500)
        return { status: STATUS.BLOCKED, error: 'SYNC_LIMIT_INVALID', items: [] };
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
            !verifiedFeedItems(page.items,requestedWorkspace,limit,lastAcceptedFeedSequence,recentFeedEventIds) ||
            (page.has_more != null && typeof page.has_more !== 'boolean') ||
            (page.has_more === true && page.items.length !== limit) ||
            (page.items.length > 0 && (typeof page.next_cursor !== 'string' ||
              !page.next_cursor || page.next_cursor === requestedCursor)) ||
            (page.items.length === 0 && page.next_cursor != null))
          return { status: STATUS.BLOCKED, error: 'SYNC_FEED_UNVERIFIED', items: [] };
        // Until per-user/per-workspace durable cursors are independently
        // authenticated, keep the change cursor only in this session's memory.
        if (page.items.length > 0) {
          for(const item of page.items){
            recentFeedEventIds.add(item.event_id);
            if(recentFeedEventIds.size > RECENT_EVENT_ID_LIMIT)
              recentFeedEventIds.delete(recentFeedEventIds.values().next().value);
          }
          cursor = page.next_cursor;
          if (requestedWorkspace !== null)
            lastAcceptedFeedSequence = BigInt(page.items[page.items.length - 1].feed_seq);
        }
        return { status: STATUS.SYNCED, items: clone(page.items), next_cursor: cursor,
          // Missing legacy synthetic metadata is UNKNOWN, never proven terminal.
          has_more: typeof page.has_more === 'boolean' ? page.has_more : null };
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
          !validBusinessDate(scope.business_date) ||
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
            // CLOSED and REOPEN_REQUESTED have no qualified transactional path.
            // A synthetic pilot must not visually authenticate final money states.
            ['CLOSED','REOPEN_REQUESTED'].includes(row.state) ||
            (['PENDING_REVIEW','REVIEWED','CLOSED'].includes(row.state) &&
              (typeof row.submitted_by !== 'string' ||
               !FEED_EVENT_ID.test(row.submitted_by))) ||
            (['REVIEWED','CLOSED'].includes(row.state) &&
              (typeof row.reviewed_by !== 'string' ||
               !FEED_EVENT_ID.test(row.reviewed_by) ||
               row.reviewed_by === row.submitted_by)) ||
            (row.state === 'PENDING_REVIEW' && row.reviewed_by != null) ||
            (row.state === 'DRAFT' &&
              (row.submitted_by != null || row.reviewed_by != null)))
          return { status: STATUS.BLOCKED, error: 'SYNC_SCOPE_UNVERIFIED' };
        return { status: STATUS.SYNCED, scope: clone(row) };
      } catch (error) {
        if (epoch !== sessionEpoch)
          return { status: STATUS.BLOCKED, error: 'SYNC_SESSION_CHANGED' };
        return { status: STATUS.PENDING, error: errorCode(error, 'SYNC_NETWORK_UNAVAILABLE') };
      }
    }

    async function reconnect() {
      if(logoutInFlight)return {pull:{status:STATUS.BLOCKED,
        error:'SYNC_LOGOUT_IN_FLIGHT',items:[]},drafts:[]};
      // A reconnect started by user A must NEVER start writes for user B
      // after an async network await and a session/workspace switch.
      // Freeze the originally pending intents; Map's live iterator could
      // otherwise pick up new drafts created in a later session.
      const epoch = sessionEpoch;
      const retryIds = Array.from(pending.values())
        .filter(item => item.status === STATUS.PENDING).map(item => item.id);
      const sessionChanged = () => ({
        pull: { status: STATUS.BLOCKED, error: 'SYNC_SESSION_CHANGED', items: [] },
        drafts: []
      });
      const pulled = await pullChanges();
      if (epoch !== sessionEpoch) return sessionChanged();
      // A failed/unverified feed does not prove connectivity, membership or
      // the last durable sequence. Do not send a batch of pending writes until
      // an authenticated and integrity-checked read succeeds.
      if (pulled.status !== STATUS.SYNCED)
        return { pull: pulled, drafts: [] };
      const drafts = [];
      for (const id of retryIds) {
        if (epoch !== sessionEpoch) return sessionChanged();
        const item = pending.get(id);
        if (item && item.status === STATUS.PENDING)
          drafts.push(await syncDraft(id));
        if (epoch !== sessionEpoch) return sessionChanged();
      }
      return { pull: pulled, drafts };
    }

    // Explicit read-only live membership proof for DEFAULT-OFF manual
    // encrypted checkpoint UI. Never expose or persist the bearer token.
    // No GET happens until a caller explicitly invokes this method.
    async function verifyActor(){
      if(logoutInFlight||!sessionToken||!workspaceId)
        throw Error('AUTH_SESSION_REQUIRED');
      const epoch=sessionEpoch;
      let response;
      try{response=await request('/v1/session',{method:'GET'});}
      catch(_){
        if(epoch!==sessionEpoch)throw Error('SYNC_SESSION_CHANGED');
        throw Error('SYNC_ACTOR_UNVERIFIED');
      }
      if(epoch!==sessionEpoch||logoutInFlight||!sessionToken)
        throw Error('SYNC_SESSION_CHANGED');
      const actor=response.body;
      if(!response.response.ok||!actor||
         actor.server_verified!==true||actor.membership_active!==true||
         actor.workspace_id!==workspaceId||
         typeof actor.user_id!=='string'||
         !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(actor.user_id)||
         !['operator','admin'].includes(actor.role))
        throw Error('SYNC_ACTOR_UNVERIFIED');
      return Object.freeze({server_verified:true,membership_active:true,
        user_id:actor.user_id,workspace_id:actor.workspace_id,role:actor.role});
    }

    // DEFAULT OFF: manual fake-only quarantine receipt review, never
    // triggered by reconnection, restore, background sync or page load.
    // POST transports read-only review data; server SQL transaction must be
    // READ ONLY and never append or retry. No returned receipt grants resend.
    async function inspectRecoveryReceipts(quarantined,
      {syntheticOnly=false,explicitConsent=false}={}){
      if(syntheticOnly!==true||explicitConsent!==true)
        throw Error('TEAM_RECOVERY_INSPECT_DISABLED');
      if(logoutInFlight||!sessionToken||!workspaceId)
        throw Error('AUTH_SESSION_REQUIRED');
      if(!Array.isArray(quarantined)||quarantined.length<1||quarantined.length>30)
        throw Error('TEAM_RECOVERY_QUARANTINE_REQUIRED');
      const ids=new Set();
      for(const x of quarantined){
        if(!x||typeof x!=='object'||Array.isArray(x)||
           !/^draft_[a-f0-9]{32}$/.test(x.id||'')||ids.has(x.id)||
           x.status!=='QUARANTINED'||x.auto_retry!==false||
           !['PENDING','CONFLICT','BLOCKED'].includes(x.original_status)||
           !Number.isSafeInteger(x.base_revision)||x.base_revision<0||
           !x.scope||x.scope.workspace_id!==workspaceId||
           typeof x.scope.partner_id!=='string'||
           !/^(?:fake|demo|synthetic)_[a-z0-9_-]{1,64}$/.test(x.scope.partner_id)||
           !x.payload||x.payload.synthetic!==true)
          throw Error('TEAM_RECOVERY_QUARANTINE_REQUIRED');
        ids.add(x.id);
      }
      const epoch=sessionEpoch;
      let response;
      try{
        response=await request('/v1/recovery/receipts/inspect',{method:'POST',
          headers:{'content-type':'application/json'},
          body:JSON.stringify({explicit_consent:true,quarantined})});
      }catch(_){
        if(epoch!==sessionEpoch)throw Error('SYNC_SESSION_CHANGED');
        throw Error('TEAM_RECOVERY_RECEIPT_UNVERIFIED');
      }
      if(epoch!==sessionEpoch||logoutInFlight||!sessionToken)
        throw Error('SYNC_SESSION_CHANGED');
      const b=response.body;
      if(!response.response.ok||!b||b.status!=='REVIEW_ONLY'||
         b.auto_send_enabled!==false||typeof b.all_receipts_verified!=='boolean'||
         !Array.isArray(b.items)||b.items.length!==quarantined.length)
        throw Error('TEAM_RECOVERY_RECEIPT_UNVERIFIED');
      const safe=b.items.map((x,i)=>{
        if(!x||x.id!==quarantined[i].id||x.auto_retry!==false||
           !['MATCHED_SERVER_RECEIPT','UNVERIFIED_NOT_SAFE_TO_RETRY'].includes(x.classification))
          throw Error('TEAM_RECOVERY_RECEIPT_UNVERIFIED');
        return Object.freeze({id:x.id,classification:x.classification,
          auto_retry:false});
      });
      if(safe.every(x=>x.classification==='MATCHED_SERVER_RECEIPT')!==
         b.all_receipts_verified)
        throw Error('TEAM_RECOVERY_RECEIPT_UNVERIFIED');
      return Object.freeze({status:'REVIEW_ONLY',
        all_receipts_verified:b.all_receipts_verified,
        auto_send_enabled:false,items:Object.freeze(safe)});
    }

    function snapshot() {
      const volatileUnsentCount=Array.from(pending.values())
        .filter(item=>item.status!==STATUS.SYNCED).length+
        Array.from(reviewAttempts.values()).filter(item=>item.status!==STATUS.SYNCED).length;
      return Object.freeze({
        authenticated: Boolean(sessionToken), cursor, workspace_id: workspaceId,
        session_epoch: sessionEpoch, // Nonsecret UI signal: clear old identity's read-only audit history.
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

    return Object.freeze({ login, logout, subscribe, setSessionToken, clearSession, queueDraft, syncDraft, reviewScope, pullChanges, readScope, reconnect, verifyActor, inspectRecoveryReceipts, snapshot, STATUS });
  }

  return Object.freeze({ STATUS, CURSOR_KEY, createSyncClient });
}));
