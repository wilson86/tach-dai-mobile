'use strict';

// M0: pure, deterministic contract. NOT an authentication provider, server, or ledger.
// The server MUST derive the actor from an independently authenticated session.
const ROLES = Object.freeze(['admin', 'operator', 'reviewer', 'viewer']);
const REGIONS = Object.freeze(['mn', 'mt', 'mb']);
const ACTIONS = Object.freeze([
  'read', 'create_draft', 'edit_draft', 'submit_review', 'approve_review',
  'close_scope', 'request_reopen', 'reopen_scope', 'manage_users', 'change_config'
]);
const GRANTS = Object.freeze({
  admin: Object.freeze(ACTIONS),
  operator: Object.freeze(['read','create_draft','edit_draft','submit_review','request_reopen']),
  reviewer: Object.freeze(['read','approve_review','close_scope','request_reopen']),
  viewer: Object.freeze(['read'])
});
const STATES = Object.freeze(['DRAFT','PENDING_REVIEW','REVIEWED','CLOSED','REOPEN_REQUESTED']);
const TRANSITIONS = Object.freeze({
  submit_review: Object.freeze(['DRAFT','PENDING_REVIEW']),
  approve_review: Object.freeze(['PENDING_REVIEW','REVIEWED']),
  close_scope: Object.freeze(['REVIEWED','CLOSED']),
  request_reopen: Object.freeze(['CLOSED','REOPEN_REQUESTED']),
  reopen_scope: Object.freeze(['REOPEN_REQUESTED','DRAFT'])
});
const KEY_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y,m,d] = value.split('-').map(Number);
  if (y<1 || m<1 || m>12) return false;
  const leap = y%4===0&&(y%100!==0||y%400===0);
  return d>=1 && d<=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][m-1];
}

function requireScope(scope) {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope) ||
      !KEY_RE.test(String(scope.workspace_id||'')) ||
      !KEY_RE.test(String(scope.partner_id||'')) ||
      !validDate(scope.business_date) || !REGIONS.includes(scope.region)) {
    throw new Error('TEAM_SCOPE_INVALID');
  }
  return Object.freeze({
    workspace_id: String(scope.workspace_id),
    partner_id: String(scope.partner_id),
    business_date: scope.business_date,
    region: scope.region
  });
}

function scopeKey(scope) {
  const s = requireScope(scope);
  return [s.workspace_id,s.partner_id,s.business_date,s.region].join(':');
}

function actorFromServer(actor) {
  // Trusted caller boundary; never build this from browser-provided role/workspace fields.
  if (!actor || typeof actor !== 'object' || Array.isArray(actor) ||
      actor.server_verified !== true || actor.membership_active !== true ||
      !KEY_RE.test(String(actor.user_id||'')) ||
      !KEY_RE.test(String(actor.workspace_id||'')) ||
      !ROLES.includes(actor.role)) {
    throw new Error('TEAM_ACTOR_UNVERIFIED');
  }
  return Object.freeze({
    user_id: String(actor.user_id),
    workspace_id: String(actor.workspace_id),
    role: actor.role
  });
}

function authorize(trustedActor, action, resource) {
  // Fail-closed: the outer HTTP boundary must validate signed sessions and DB membership.
  const actor = actorFromServer(trustedActor);
  if (!ACTIONS.includes(action)) throw new Error('TEAM_ACTION_UNKNOWN');
  if (!resource || String(resource.workspace_id||'') !== actor.workspace_id)
    throw new Error('TEAM_WORKSPACE_DENIED');
  if (!GRANTS[actor.role].includes(action)) throw new Error('TEAM_ROLE_DENIED');
  if (['approve_review','close_scope'].includes(action) &&
      String(resource.submitted_by||'') === actor.user_id)
    throw new Error('TEAM_SEPARATION_OF_DUTIES');
  return true;
}

function transition(trustedActor, action, current, trustedReleaseGate) {
  if (!Object.prototype.hasOwnProperty.call(TRANSITIONS,action)) throw new Error('TEAM_TRANSITION_UNKNOWN');
  if (!current || !STATES.includes(current.status)) throw new Error('TEAM_STATE_INVALID');
  authorize(trustedActor,action,current);
  const [before,after] = TRANSITIONS[action];
  if (current.status !== before) throw new Error('TEAM_TRANSITION_DENIED');
  if (action === 'approve_review' && !current.submitted_by) throw new Error('TEAM_SUBMITTER_UNVERIFIED');
  if (action === 'close_scope' && !current.reviewed_by) throw new Error('TEAM_REVIEWER_UNVERIFIED');
  // Fail closed until verified server-side evidence and explicit human product approval.
  // A browser flag or signed-in group member cannot switch on this release gate.
  if (action === 'close_scope') {
    const g = trustedReleaseGate || {};
    if (g.server_derived !== true || g.kqxs_verified !== true ||
        g.parser_qualified !== true || g.partner_pricing_qualified !== true ||
        g.financial_rules_qualified !== true || g.product_release_approved !== true)
      throw new Error('TEAM_FINALIZATION_EVIDENCE_REQUIRED');
  }
  if (action === 'reopen_scope' && !current.reopen_reason_approved) throw new Error('TEAM_REOPEN_APPROVAL_REQUIRED');
  return Object.freeze({
    from: before,
    to: after,
    expected_revision: requireRevision(current.revision)
  });
}

function requireRevision(revision) {
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('TEAM_REVISION_INVALID');
  return revision;
}

function checkMutationIntent(trustedActor, intent, serverState) {
  if (!intent || typeof intent !== 'object' || Array.isArray(intent))
    throw new Error('TEAM_INTENT_INVALID');
  if (!serverState || serverState.workspace_id !== intent.workspace_id)
    throw new Error('TEAM_SCOPE_MISMATCH');
  authorize(trustedActor,intent.action,serverState);
  if (!['create_draft','edit_draft','submit_review'].includes(intent.action))
    throw new Error('TEAM_INTENT_ACTION_FORBIDDEN');
  const clientRevision = requireRevision(intent.expected_revision);
  const serverRevision = requireRevision(serverState.revision);
  if (clientRevision !== serverRevision) throw new Error('TEAM_REVISION_CONFLICT');
  if (!KEY_RE.test(String(intent.idempotency_key||''))) throw new Error('TEAM_IDEMPOTENCY_KEY_REQUIRED');
  if (intent.action === 'edit_draft' && serverState.status !== 'DRAFT')
    throw new Error('TEAM_CLOSED_OR_PENDING_IMMUTABLE');
  if (intent.action === 'submit_review' && serverState.status !== 'DRAFT')
    throw new Error('TEAM_SUBMIT_REQUIRES_DRAFT');
  if (intent.offline !== false) throw new Error('TEAM_OFFLINE_NOT_AUTHORITATIVE');
  return Object.freeze({
    scope_key: scopeKey(serverState),
    expected_revision: serverRevision,
    next_revision: serverRevision+1,
    idempotency_key: String(intent.idempotency_key)
  });
}

function offlineBadge(record) {
  // The UI must NEVER label offline draft/cache as approved or final.
  if (!record || record.network_confirmed !== true) return 'PENDING';
  if (record.conflict === true) return 'CONFLICT';
  if (record.server_blocked === true) return 'BLOCKED';
  return 'SYNCED';
}

module.exports=Object.freeze({
  ROLES, REGIONS, ACTIONS, GRANTS, STATES, TRANSITIONS,
  validDate, requireScope, scopeKey, actorFromServer, authorize,
  transition, requireRevision, checkMutationIntent, offlineBadge
});
