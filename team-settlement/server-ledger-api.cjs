'use strict';

// Server API composition seam: authenticated session -> trusted actor ->
// canonical request digest -> injected PostgreSQL repository. This module is
// still a contract layer; it does not open sockets, calculate money, or select
// a database. The repository owns the transaction/CAS/idempotency boundary.

const crypto = require('node:crypto');
const C = require('./core-contract.cjs');
const { stable } = require('./ledger-api-contract.cjs');

// Do not advertise a financial draft as SYNCED merely because SQL/HTTP
// returned successfully. The durable draft SQL function issues these exact
// receipt fields; idempotent replays return the original event ID.
const EVENT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const MAX_SIGNED_BIGINT = 9223372036854775807n;
function verifiedFeedSequence(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0;
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,18}$/.test(value)) return false;
  return BigInt(value) <= MAX_SIGNED_BIGINT;
}
function requireVerifiedDraftReceipt(result, proposedEventId, expectedRevision) {
  if (!result || typeof result !== 'object' || Array.isArray(result) ||
      typeof result.event_id !== 'string' || !EVENT_ID_RE.test(result.event_id) ||
      typeof result.replayed !== 'boolean' ||
      !verifiedFeedSequence(result.feed_seq) ||
      !Number.isSafeInteger(result.new_revision) ||
      result.new_revision !== expectedRevision + 1 ||
      (!result.replayed && result.event_id !== proposedEventId)) {
    throw new Error('TEAM_DRAFT_RECEIPT_UNVERIFIED');
  }
  return result;
}


function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function createServerLedgerApi({
  auth, repository, eventId = () => `event_${crypto.randomBytes(12).toString('hex')}`,
  syntheticReviewEnabled=false
} = {}) {
  if (!auth || typeof auth.verifySession !== 'function' || !repository ||
      typeof repository.appendDraft !== 'function' || typeof repository.getScope !== 'function' ||
      (typeof eventId !== 'function' || typeof syntheticReviewEnabled !== 'boolean'))
    throw new Error('TEAM_SERVER_API_CONFIG_INVALID');

  async function actor(sessionToken) {
    const trusted = await auth.verifySession(sessionToken);
    C.actorFromServer(trusted);
    return trusted;
  }

  async function appendDraft(sessionToken, input) {
    const trustedActor = await actor(sessionToken);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('TEAM_INTENT_INVALID');
    const scope = C.requireScope(input.scope);
    if (scope.workspace_id !== trustedActor.workspace_id) throw new Error('TEAM_WORKSPACE_DENIED');
    if (!['create_draft', 'edit_draft'].includes(input.action || 'create_draft')) throw new Error('TEAM_INTENT_ACTION_FORBIDDEN');
    if (!Number.isSafeInteger(input.expected_revision) || input.expected_revision < 0 ||
        !Number.isSafeInteger(input.expected_revision + 1)) throw new Error('TEAM_REVISION_INVALID');
    if (input.offline === true) throw new Error('TEAM_OFFLINE_NOT_AUTHORITATIVE');
    if (!input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)) throw new Error('TEAM_PAYLOAD_INVALID');
    const request_sha256 = digest({
      action: input.action || 'create_draft', scope, expected_revision: input.expected_revision, payload: input.payload
    });
    const proposedEventId = eventId();
    const result = await repository.appendDraft(trustedActor, {
      scope, expected_revision: input.expected_revision, event_id: proposedEventId,
      idempotency_key: input.idempotency_key, request_sha256, snapshot: stable(input.payload)
    });
    const verified = requireVerifiedDraftReceipt(result, proposedEventId, input.expected_revision);
    return Object.freeze({ ...verified, scope_key: C.scopeKey(scope), sync_status: 'SYNCED' });
  }


  // Default-off internal synthetic service; NO HTTP review endpoint or UI button.
  async function advanceReview(sessionToken,input) {
    if(!syntheticReviewEnabled)throw Error('TEAM_ROUTE_NOT_ENABLED');
    const trustedActor=await actor(sessionToken);
    if(typeof repository.advanceReview!=='function')throw Error('TEAM_ROUTE_NOT_ENABLED');
    if(!input||typeof input!=='object'||Array.isArray(input))throw Error('TEAM_INTENT_INVALID');
    if(Object.keys(input).some(k=>!['action','scope','expected_revision','idempotency_key'].includes(k)))
      throw Error('TEAM_REVIEW_REQUEST_INVALID');
    const {action,expected_revision,idempotency_key}=input;
    if(!['submit_review','approve_review'].includes(action))throw Error('TEAM_REVIEW_ACTION_FORBIDDEN');
    const scope=C.requireScope(input.scope);
    if(scope.workspace_id!==trustedActor.workspace_id)throw Error('TEAM_WORKSPACE_DENIED');
    C.authorize(trustedActor,action,scope);
    if(!Number.isSafeInteger(expected_revision)||expected_revision<0||!Number.isSafeInteger(expected_revision+1))
      throw Error('TEAM_REVISION_INVALID');
    if(typeof idempotency_key!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(idempotency_key))
      throw Error('TEAM_IDEMPOTENCY_KEY_REQUIRED');
    const request_sha256=digest({action,scope,expected_revision});
    const proposedEventId=eventId();
    const result=await repository.advanceReview(trustedActor,{scope,action,expected_revision,
      idempotency_key,request_sha256,event_id:proposedEventId});
    const verified=requireVerifiedDraftReceipt(result,proposedEventId,expected_revision);
    const requiredState=action==='submit_review'?'PENDING_REVIEW':'REVIEWED';
    if(verified.state!==requiredState)throw Error('TEAM_REVIEW_RECEIPT_UNVERIFIED');
    return Object.freeze({...verified,scope_key:C.scopeKey(scope),
      sync_status:'SYNCED',review_state:requiredState});
  }

  async function getScope(sessionToken, scope) {
    const trustedActor = await actor(sessionToken);
    const checked = C.requireScope(scope);
    if (checked.workspace_id !== trustedActor.workspace_id)
      throw new Error('TEAM_WORKSPACE_DENIED');
    const result = await repository.getScope(trustedActor, checked);
    // An injected repository or stale cache must not leak another financial
    // scope even if the HTTP handler and the browser validate independently.
    if (!result || typeof result !== 'object' || Array.isArray(result) ||
        result.workspace_id !== checked.workspace_id ||
        result.partner_id !== checked.partner_id ||
        result.business_date !== checked.business_date ||
        result.region !== checked.region)
      throw new Error('TEAM_SCOPE_RESPONSE_UNVERIFIED');
    return result;
  }

  async function listCounterparties(sessionToken,options={}){
    const trustedActor=await actor(sessionToken);
    if(typeof repository.listCounterparties!=='function')throw Error('TEAM_ROUTE_NOT_ENABLED');
    const result=await repository.listCounterparties(trustedActor,options);
    if(!Array.isArray(result))throw Error('TEAM_COUNTERPARTY_RESPONSE_UNVERIFIED');
    for(const row of result){
      if(!row||typeof row!=='object'||Array.isArray(row)||
         row.workspace_id!==trustedActor.workspace_id||
         !EVENT_ID_RE.test(row.partner_id)||
         !['customer','owner'].includes(row.partner_kind)||
         typeof row.display_name!=='string'||row.display_name.length<1||row.display_name.length>160)
        throw Error('TEAM_COUNTERPARTY_RESPONSE_UNVERIFIED');
    }
    return Object.freeze(result.map(row=>Object.freeze({...row})));
  }

  async function getChanges(sessionToken, options) {
    const trustedActor = await actor(sessionToken);
    if (typeof repository.getChanges !== 'function') throw new Error('TEAM_ROUTE_NOT_ENABLED');
    return repository.getChanges(trustedActor, options);
  }

  return Object.freeze({ appendDraft, advanceReview, getScope, getChanges,listCounterparties });
}

module.exports = Object.freeze({ digest, createServerLedgerApi });
