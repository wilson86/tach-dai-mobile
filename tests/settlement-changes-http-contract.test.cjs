'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const A = require('../team-settlement/auth-contract.cjs');
const { createAuthHttpServer } = require('../team-settlement/auth-http-contract.cjs');

function request(server, path, token) {
  const address = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: address.port, method: 'GET', path, headers: token ? { authorization: `Bearer ${token}` } : {} }, res => {
      const chunks = [];
      res.on('data', x => chunks.push(x));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject); req.end();
  });
}

async function setup(ledger) {
  const auth = A.createAuthService({ clock: () => 1_000, sessionTtlMs: 10_000 });
  auth.registerIdentity({ user_id: 'viewer_1', auth_subject: 'subject_viewer', password: 'synthetic-viewer-password' });
  auth.setMembership({ workspace_id: 'group_a', user_id: 'viewer_1', role: 'viewer' });
  const login = auth.login({ auth_subject: 'subject_viewer', password: 'synthetic-viewer-password', workspace_id: 'group_a' });
  const server = createAuthHttpServer(auth, { ledger });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, token: login.session_token };
}

test('changes HTTP endpoint returns ordered sync page and rejects invalid cursor/limit', async () => {
  const calls = [];
  const { server, token } = await setup({
    getChanges: async (sessionToken, options) => { calls.push({ sessionToken, options }); return { items: [{ event_id: 'event_a' }], next_cursor: 'cursor_2', sync_status: 'SYNCED' }; }
  });
  try {
    const page = await request(server, '/v1/changes?limit=10', token);
    assert.equal(page.status, 200);
    assert.equal(JSON.parse(page.body).sync_status, 'SYNCED');
    assert.equal(calls[0].options.limit, 10);
    assert.equal(calls[0].options.cursor, null);
    const badLimit = await request(server, '/v1/changes?limit=501', token);
    assert.equal(badLimit.status, 422);
    const missing = await request(server, '/v1/changes', null);
    assert.equal(missing.status, 401);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('changes endpoint is disabled without a repository-backed change provider', async () => {
  const { server, token } = await setup(null);
  try {
    const response = await request(server, '/v1/changes', token);
    assert.equal(response.status, 404);
    assert.deepEqual(JSON.parse(response.body), { error: 'TEAM_ROUTE_NOT_ENABLED' });
  } finally { await new Promise(resolve => server.close(resolve)); }
});
