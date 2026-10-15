'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const A = require('../team-settlement/auth-contract.cjs');
const { createAuthHttpServer } = require('../team-settlement/auth-http-contract.cjs');
const { createLedgerApi } = require('../team-settlement/ledger-api-contract.cjs');

function request(server, { method, path, body, token }) {
  const address = server.address();
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: address.port, method, path,
      headers: { ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) } }, res => {
      const chunks = [];
      res.on('data', x => chunks.push(x));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (payload) req.end(payload); else req.end();
  });
}

async function setup(ledger) {
  const auth = A.createAuthService({ clock: () => 1_000, sessionTtlMs: 10_000 });
  auth.registerIdentity({ user_id: 'operator_1', auth_subject: 'subject_operator', password: 'synthetic-operator-password' });
  auth.setMembership({ workspace_id: 'group_a', user_id: 'operator_1', role: 'operator' });
  const server = createAuthHttpServer(auth, { ledger });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const login = await request(server, { method: 'POST', path: '/v1/login', body: { auth_subject: 'subject_operator', password: 'synthetic-operator-password', workspace_id: 'group_a' } });
  return { server, token: JSON.parse(login.body).session_token };
}

test('draft HTTP route requires session and delegates to server ledger API', async () => {
  const calls = [];
  const { server, token } = await setup({ appendDraft: async (sessionToken, input) => { calls.push({ sessionToken, input }); return { event_id: 'event_1', new_revision: 1, sync_status: 'SYNCED' }; } });
  try {
    const denied = await request(server, { method: 'POST', path: '/v1/scopes/drafts', body: {} });
    assert.equal(denied.status, 401);
    const response = await request(server, { method: 'POST', path: '/v1/scopes/drafts', token, body: { scope: { workspace_id: 'group_a' }, payload: { synthetic: true } } });
    assert.equal(response.status, 200);
    assert.equal(JSON.parse(response.body).event_id, 'event_1');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].sessionToken, token);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('draft HTTP route maps fail-closed transaction errors without leaking internals', async () => {
  const { server, token } = await setup({ appendDraft: async () => { throw new Error('TEAM_REVISION_CONFLICT'); } });
  try {
    const conflict = await request(server, { method: 'POST', path: '/v1/scopes/drafts', token, body: { synthetic: true } });
    assert.equal(conflict.status, 409);
    assert.deepEqual(JSON.parse(conflict.body), { error: 'TEAM_REVISION_CONFLICT', sync_status: 'CONFLICT', resolution: 'MANUAL_REVIEW' });
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('HTTP two-client reconnect returns explicit conflict, then succeeds with refreshed CAS revision', async () => {
  const auth = A.createAuthService({ clock: () => 1_000, sessionTtlMs: 10_000 });
  auth.registerIdentity({ user_id: 'operator_1', auth_subject: 'subject_operator', password: 'synthetic-operator-password' });
  auth.setMembership({ workspace_id: 'group_a', user_id: 'operator_1', role: 'operator' });
  const session = auth.login({ auth_subject: 'subject_operator', password: 'synthetic-operator-password', workspace_id: 'group_a' });
  const inMemoryLedger = createLedgerApi({ auth, clock: () => 1_000 });
  const server = createAuthHttpServer(auth, { ledger: { appendDraft: (token, input) => inMemoryLedger.mutateDraft(token, input) } });
  const scope = { workspace_id: 'group_a', partner_id: 'counterparty_1', business_date: '2026-10-12', region: 'mn' };
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const first = await request(server, { method: 'POST', path: '/v1/scopes/drafts', token: session.session_token, body: { scope, expected_revision: 0, idempotency_key: 'client_a', payload: { synthetic: true, client: 'a' } } });
    assert.equal(first.status, 200);
    const stale = await request(server, { method: 'POST', path: '/v1/scopes/drafts', token: session.session_token, body: { scope, expected_revision: 0, idempotency_key: 'client_b', payload: { synthetic: true, client: 'b' } } });
    assert.equal(stale.status, 409);
    assert.equal(JSON.parse(stale.body).sync_status, 'CONFLICT');
    const retry = await request(server, { method: 'POST', path: '/v1/scopes/drafts', token: session.session_token, body: { scope, expected_revision: 1, idempotency_key: 'client_b_retry', payload: { synthetic: true, client: 'b' } } });
    assert.equal(retry.status, 200);
    assert.equal(JSON.parse(retry.body).new_revision, 2);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('team draft route is disabled unless a ledger dependency is explicitly supplied', async () => {
  const { server, token } = await setup(null);
  try {
    const response = await request(server, { method: 'POST', path: '/v1/scopes/drafts', token, body: { synthetic: true } });
    assert.equal(response.status, 404);
    assert.deepEqual(JSON.parse(response.body), { error: 'TEAM_ROUTE_NOT_ENABLED' });
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('read-only team scope route is session-scoped and rejects revoked/cross-workspace access', async () => {
  const auth=A.createAuthService({clock:()=>1000,sessionTtlMs:10000});
  auth.registerIdentity({user_id:'operator_1',auth_subject:'operator_login',password:'synthetic-operator-password'});
  auth.registerIdentity({user_id:'viewer_1',auth_subject:'viewer_login',password:'synthetic-viewer-password'});
  auth.setMembership({workspace_id:'group_a',user_id:'operator_1',role:'operator'});
  auth.setMembership({workspace_id:'group_a',user_id:'viewer_1',role:'viewer'});
  auth.setMembership({workspace_id:'group_b',user_id:'viewer_1',role:'viewer'});
  const ledger=createLedgerApi({auth,clock:()=>1000});
  const server=createAuthHttpServer(auth,{ledger:{
    appendDraft:(token,input)=>ledger.mutateDraft(token,input),
    getScope:(token,scope)=>ledger.getScope(token,scope)
  }});
  const operator=auth.login({auth_subject:'operator_login',password:'synthetic-operator-password',workspace_id:'group_a'});
  const viewer=auth.login({auth_subject:'viewer_login',password:'synthetic-viewer-password',workspace_id:'group_a'});
  const other=auth.login({auth_subject:'viewer_login',password:'synthetic-viewer-password',workspace_id:'group_b'});
  const scope={workspace_id:'group_a',partner_id:'customer_1',business_date:'2026-10-12',region:'mn'};
  const path='/v1/scopes/customer_1/2026-10-12/mn';
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const saved=await request(server,{method:'POST',path:'/v1/scopes/drafts',token:operator.session_token,
      body:{scope,expected_revision:0,idempotency_key:'unique_synthetic_1',payload:{synthetic:true}}});
    assert.equal(saved.status,200);
    assert.equal((await request(server,{method:'GET',path})).status,401);
    const read=await request(server,{method:'GET',path,token:viewer.session_token});
    assert.equal(read.status,200);
    assert.equal(JSON.parse(read.body).revision,1);
    assert.equal((await request(server,{method:'GET',path,token:other.session_token})).status,404);
    assert.equal((await request(server,{method:'GET',path:'/v1/scopes/customer_1/2026-02-30/mn',token:viewer.session_token})).status,422);
    assert.equal((await request(server,{method:'GET',path:'/v1/scopes/customer_1/2026-10-12/mn?workspace_id=group_b',token:viewer.session_token})).status,422);
    auth.setMembership({workspace_id:'group_a',user_id:'viewer_1',role:'viewer',revoked_at:1000});
    assert.equal((await request(server,{method:'GET',path,token:viewer.session_token})).status,401);
  } finally {await new Promise(resolve=>server.close(resolve));}
});

test('read-only GET rejects impossible calendar dates before ledger invocation',async()=>{
 const calls=[];
 const {server,token}=await setup({getScope:async(_session,scope)=>{
   calls.push(scope);return {...scope,state:'DRAFT',revision:0};
 }});
 try{
   for(const date of ['2026-02-29','2026-04-31','0000-01-01','2026-13-01']){
     const x=await request(server,{method:'GET',path:'/v1/scopes/fake_partner_1/'+date+'/mn',token});
     assert.equal(x.status,422,date);
     assert.equal(JSON.parse(x.body).error,'TEAM_SCOPE_INVALID');
   }
   assert.equal(calls.length,0);
   const accepted=await request(server,{method:'GET',path:'/v1/scopes/fake_partner_1/2028-02-29/mn',token});
   assert.equal(accepted.status,200);
   assert.equal(calls.length,1);
   assert.equal(calls[0].business_date,'2028-02-29');
 }finally{await new Promise(resolve=>server.close(resolve));}
});
