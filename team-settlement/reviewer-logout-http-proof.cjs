'use strict';

// An opt-in, test-harness-only proof of HTTP session revocation for a single
// synthetic Reviewer. This does NOT capture tokens or bypass the application's
// memory-only bearer design. The caller must independently obtain the exact
// token used by the UI and supply a TLS-verified, bounded observeSession().
// Never serialize, log, screenshot, persist, or return the bearer value.
const TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function createReviewerLogoutHttpProof({observeSession, expectedWorkspace, expectedReviewer} = {}) {
  if(typeof observeSession !== 'function' || !ID_RE.test(expectedWorkspace || '') ||
     !ID_RE.test(expectedReviewer || '')) throw Error('REVIEWER_HTTP_PROOF_CONFIG_INVALID');
  let state = 'NEW';
  let token = null;
  async function beforeLogout(bearer) {
    if(state !== 'NEW' || typeof bearer !== 'string' || !TOKEN_RE.test(bearer)) {
      token = null; state = 'FAILED';
      throw Error('REVIEWER_HTTP_PROOF_PRECONDITION_INVALID');
    }
    state = 'CHECKING_BEFORE';
    try {
      const response = await observeSession({method:'GET', path:'/v1/session', bearer});
      if(!response || response.status !== 200 || !response.body ||
         response.body.user_id !== expectedReviewer ||
         response.body.workspace_id !== expectedWorkspace ||
         response.body.role !== 'reviewer') throw Error('UNVERIFIED');
      token = bearer;
      state = 'BEFORE_VERIFIED';
      return Object.freeze({stage:'BEFORE_LOGOUT',http_status:200,identity_verified:true,token_exported:false});
    } catch (_) {
      token = null; state = 'FAILED';
      throw Error('REVIEWER_HTTP_SESSION_BEFORE_UNVERIFIED');
    }
  }
  async function afterLogout({uiLogoutConfirmed=false} = {}) {
    if(state !== 'BEFORE_VERIFIED' || uiLogoutConfirmed !== true || token === null) {
      token = null; state = 'FAILED';
      throw Error('REVIEWER_HTTP_LOGOUT_PRECONDITION_INVALID');
    }
    const oldToken = token;
    token = null;
    state = 'CHECKING_AFTER';
    try {
      const response = await observeSession({method:'GET', path:'/v1/session', bearer:oldToken});
      if(!response || response.status !== 401 || !response.body ||
         response.body.error !== 'AUTH_SESSION_INVALID') throw Error('UNVERIFIED');
      state = 'DONE';
      return Object.freeze({stage:'AFTER_LOGOUT',http_status:401,revoked_session_denied:true,token_exported:false});
    } catch (_) {
      state = 'FAILED';
      throw Error('REVIEWER_HTTP_SESSION_REVOCATION_UNVERIFIED');
    }
  }
  function discard() {token = null; state = 'FAILED';}
  return Object.freeze({beforeLogout, afterLogout, discard});
}
module.exports = Object.freeze({createReviewerLogoutHttpProof});
