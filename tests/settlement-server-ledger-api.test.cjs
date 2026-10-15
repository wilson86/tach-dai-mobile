'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const A = require('../team-settlement/auth-contract.cjs');
const { createPostgresLedgerRepository } = require('../team-settlement/postgres-ledger-repository.cjs');
const { createServerLedgerApi } = require('../team-settlement/server-ledger-api.cjs');

const scope = { workspace_id: 'group_a', partner_id: 'counterparty_1', business_date: '2026-10-12', region: 'mn' };

function setup(resultRows = [{ result: { event_id: 'event_1', replayed: false, new_revision: 1, feed_seq: 1 } }]) {
  const auth = A.createAuthService({ clock: () => 1_000, sessionTtlMs: 10_000 });
  auth.registerIdentity({ user_id: 'operator_1', auth_subject: 'subject_operator', password: 'synthetic-operator-password' });
  auth.setMembership({ workspace_id: 'group_a', user_id: 'operator_1', role: 'operator' });
  const session = auth.login({ auth_subject: 'subject_operator', password: 'synthetic-operator-password', workspace_id: 'group_a' });
  const calls = [];
  const db = { async transaction(work) { return work({ query: async (text, params) => {
    calls.push({ text, params });
    if (text.includes('FROM kts_team.memberships m')) return { rows:[{ team_role:'operator' }] };
    return { rows: resultRows };
  } }); } };
  return { auth, calls, api: createServerLedgerApi({ auth, repository: createPostgresLedgerRepository({ db }), eventId: () => 'event_1' }), token: session.session_token };
}

test('server API authenticates session, canonicalizes request and delegates to repository', async () => {
  const { api, calls, token } = setup();
  const result = await api.appendDraft(token, { scope, expected_revision: 0, idempotency_key: 'request_1', payload: { synthetic: true, selector: '123' } });
  assert.deepEqual(result, { event_id: 'event_1', replayed: false, new_revision: 1, feed_seq: 1, scope_key: 'group_a:counterparty_1:2026-10-12:mn', sync_status: 'SYNCED' });
  assert.equal(calls.length, 3); // tenant context, active membership, draft SQL
  assert.equal(calls[1].params[0], 'group_a');
  assert.equal(calls[2].params[0], 'group_a');
  assert.match(calls[2].params[7], /^[a-f0-9]{64}$/);
  assert.equal(calls[2].params[8], '{"selector":"123","synthetic":true}');
});

test('server API blocks offline, cross-tenant and malformed requests before repository access', async () => {
  const { api, calls, token } = setup();
  await assert.rejects(() => api.appendDraft(token, { scope, expected_revision: 0, idempotency_key: 'x', offline: true, payload: { synthetic: true } }), /TEAM_OFFLINE_NOT_AUTHORITATIVE/);
  await assert.rejects(() => api.appendDraft(token, { scope: { ...scope, workspace_id: 'group_b' }, expected_revision: 0, idempotency_key: 'x', payload: { synthetic: true } }), /TEAM_WORKSPACE_DENIED/);
  await assert.rejects(() => api.appendDraft(token, { scope, expected_revision: 0, idempotency_key: 'x', payload: ['not-an-object'] }), /TEAM_PAYLOAD_INVALID/);
  assert.equal(calls.length, 0);
});

test('server API never accepts a client role and scopes reads through the repository', async () => {
  const { api, token } = setup();
  const repo = { async appendDraft() { throw new Error('should not run'); }, async getScope(actor, input) {
    assert.equal(actor.role, 'operator');
    assert.equal(actor.workspace_id, 'group_a');
    return { ...input, state: 'DRAFT', synthetic: true };
  }};
  const auth = A.createAuthService({ clock: () => 1_000, sessionTtlMs: 10_000 });
  auth.registerIdentity({ user_id: 'operator_1', auth_subject: 'subject_operator', password: 'synthetic-operator-password' });
  auth.setMembership({ workspace_id: 'group_a', user_id: 'operator_1', role: 'operator' });
  const fresh = auth.login({ auth_subject: 'subject_operator', password: 'synthetic-operator-password', workspace_id: 'group_a' });
  const server = createServerLedgerApi({ auth, repository: repo });
  const read = await server.getScope(fresh.session_token, { ...scope, role: 'admin' });
  assert.equal(read.state, 'DRAFT');
  assert.equal(read.role, undefined);
});

test('review seam is off by default, even if SQL repo is injected',async()=>{
 const {auth,token}=setup();
 let calls=0;
 const repo={appendDraft:async()=>{},getScope:async()=>{},advanceReview:async()=>{calls++;}};
 const api=createServerLedgerApi({auth,repository:repo});
 await assert.rejects(()=>api.advanceReview(token,{scope,action:'submit_review',
   expected_revision:1,idempotency_key:'key'}),/TEAM_ROUTE_NOT_ENABLED/);
 assert.equal(calls,0);
});
test('opt-in review seam trusts only authenticated actor and verified receipt',async()=>{
 const {auth,token}=setup();const observed=[];
 let reply={event_id:'event_1',replayed:false,new_revision:2,feed_seq:2,state:'PENDING_REVIEW'};
 const repo={appendDraft:async()=>{},getScope:async()=>{},advanceReview:async(a,i)=>{
   observed.push([a,i]);return reply;
 }};
 const api=createServerLedgerApi({auth,repository:repo,eventId:()=>'event_1',syntheticReviewEnabled:true});
 const input={scope,action:'submit_review',expected_revision:1,idempotency_key:'review_key'};
 const valid=await api.advanceReview(token,input);
 assert.equal(valid.review_state,'PENDING_REVIEW');
 assert.equal(valid.sync_status,'SYNCED');
 assert.equal(observed.length,1);
 assert.equal(observed[0][0].role,'operator');
 assert.equal(observed[0][0].user_id,'operator_1');
 assert.match(observed[0][1].request_sha256,/^[a-f0-9]{64}$/);
 for(const bad of [{...input,role:'admin'}, {...input,offline:true},
   {...input,action:'approve_review'}, {...input,action:'close_scope'},
   {...input,scope:{...scope,workspace_id:'group_b'}},
   {...input,expected_revision:-1},{...input,idempotency_key:'bad/key'}]){
   await assert.rejects(()=>api.advanceReview(token,bad));
 }
 assert.equal(observed.length,1);
 for(reply of [
   {event_id:'event_1',replayed:false,new_revision:2,feed_seq:2},
   {event_id:'event_1',replayed:false,new_revision:2,feed_seq:2,state:'CLOSED'},
   {event_id:'event_other',replayed:false,new_revision:2,feed_seq:2,state:'PENDING_REVIEW'},
   {event_id:'event_1',replayed:false,new_revision:3,feed_seq:2,state:'PENDING_REVIEW'}
 ])await assert.rejects(()=>api.advanceReview(token,input),/TEAM_(?:DRAFT|REVIEW)_RECEIPT_UNVERIFIED/);
});
