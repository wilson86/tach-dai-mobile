'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const A = require('../team-settlement/auth-contract.cjs');
const { createAuthHttpServer } = require('../team-settlement/auth-http-contract.cjs');

function setup() {
  const auth = A.createAuthService({ clock: () => 1_000, sessionTtlMs: 1_000 });
  auth.registerIdentity({ user_id: 'member_1', auth_subject: 'subject_1', password: 'synthetic-password-1' });
  auth.setMembership({ workspace_id: 'group_a', user_id: 'member_1', role: 'operator' });
  return auth;
}

function request(server, { method, path, body, token, headers = {} }) {
  const address = server.address();
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: address.port, method, path,
      headers: { ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers } }, res => {
      const chunks = [];
      res.on('data', x => chunks.push(x));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (payload) req.end(payload); else req.end();
  });
}

async function withServer(auth, fn, options) {
  const server = createAuthHttpServer(auth, options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { return await fn(server); } finally { await new Promise(resolve => server.close(resolve)); }
}

test('HTTP login/session/logout uses server-issued opaque sessions', async () => {
  await withServer(setup(), async server => {
    const login = await request(server, { method: 'POST', path: '/v1/login', body: {
      auth_subject: 'subject_1', password: 'synthetic-password-1', workspace_id: 'group_a', role: 'admin'
    }});
    assert.equal(login.status, 200);
    const session = JSON.parse(login.body);
    assert.equal(typeof session.session_token, 'string');
    const current = await request(server, { method: 'GET', path: '/v1/session', token: session.session_token });
    assert.equal(current.status, 200);
    assert.equal(JSON.parse(current.body).role, 'operator');
    const logout = await request(server, { method: 'POST', path: '/v1/logout', token: session.session_token });
    assert.equal(logout.status, 204);
    const after = await request(server, { method: 'GET', path: '/v1/session', token: session.session_token });
    assert.equal(after.status, 401);
  });
});

test('HTTP auth errors are generic and malformed requests are bounded', async () => {
  await withServer(setup(), async server => {
    const badLogin = await request(server, { method: 'POST', path: '/v1/login', body: {
      auth_subject: 'unknown_subject', password: 'wrong-password', workspace_id: 'group_a'
    }});
    assert.deepEqual(JSON.parse(badLogin.body), { error: 'AUTH_LOGIN_DENIED' });
    assert.equal(badLogin.status, 401);
    const noSession = await request(server, { method: 'GET', path: '/v1/session' });
    assert.equal(noSession.status, 401);
    const unknown = await request(server, { method: 'GET', path: '/v1/unknown' });
    assert.equal(unknown.status, 404);
  }, { maxBodyBytes: 256 });
});

test('HTTP login rejects oversized bodies without reaching authentication', async () => {
  await withServer(setup(), async server => {
    const result = await request(server, { method: 'POST', path: '/v1/login', body: {
      auth_subject: 'subject_1', password: 'synthetic-password-1', workspace_id: 'group_a',
      padding: 'x'.repeat(500)
    }});
    assert.equal(result.status, 413);
    assert.deepEqual(JSON.parse(result.body), { error: 'AUTH_BODY_TOO_LARGE' });
  }, { maxBodyBytes: 256 });
});
