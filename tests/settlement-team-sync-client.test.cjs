'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Sync = require('../app/settlement-team-sync-client.js');

function response(status, body) { return { status, ok: status >= 200 && status < 300, json: async () => body }; }
function storage() {
  const data = new Map();
  return { data, get: key => data.get(key) || null, set: (key, value) => data.set(key, value), remove: key => data.delete(key) };
}

test('PWA client keeps bearer token in memory and syncs a queued draft', async () => {
  const saved = storage(); const calls = [];
  const client = Sync.createSyncClient({ storage: saved, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/v1/scopes/drafts')) return response(200, { event_id: 'event_1', new_revision: 1, sync_status: 'SYNCED' });
    return response(200, { items: [], next_cursor: 'cursor_1', sync_status: 'SYNCED' });
  }});
  client.setSessionToken('x'.repeat(43));
  const draft = client.queueDraft({ workspace_id: 'group_a', partner_id: 'counterparty_1', business_date: '2026-10-12', region: 'mn' }, { synthetic: true });
  const synced = await client.syncDraft(draft.id);
  assert.equal(synced.status, Sync.STATUS.SYNCED);
  assert.equal(calls[0].options.headers.authorization, 'Bearer ' + 'x'.repeat(43));
  assert.equal(saved.data.has('session_token'), false);
  await client.pullChanges();
  assert.equal(saved.data.get(Sync.CURSOR_KEY), 'cursor_1');
});

test('offline request stays PENDING, reconnect conflict becomes CONFLICT and is never auto-retried', async () => {
  let online = false; let calls = 0;
  const client = Sync.createSyncClient({ fetchImpl: async (url) => {
    calls += 1;
    if (!online) throw Object.assign(new Error('offline'), { code: 'NETWORK_DOWN' });
    if (url.includes('/v1/changes')) return response(200, { items: [], next_cursor: null });
    return response(409, { error: 'TEAM_REVISION_CONFLICT', sync_status: 'CONFLICT', resolution: 'MANUAL_REVIEW' });
  }});
  client.setSessionToken('y'.repeat(43));
  const draft = client.queueDraft({ workspace_id: 'group_a', partner_id: 'counterparty_1', business_date: '2026-10-12', region: 'mn' }, { synthetic: true });
  assert.equal((await client.syncDraft(draft.id)).status, Sync.STATUS.PENDING);
  online = true;
  const result = await client.reconnect();
  assert.equal(result.drafts[0].status, Sync.STATUS.CONFLICT);
  const after = await client.reconnect();
  assert.equal(after.drafts.length, 0);
  assert.equal(calls, 4); // failed draft, pull+conflict, then pull only; conflict is not retried
});

test('401 blocks drafts and logout blocks unsent drafts without persisting credentials', async () => {
  const client = Sync.createSyncClient({ storage: storage(), fetchImpl: async () => response(401, { error: 'AUTH_SESSION_INVALID' }) });
  client.setSessionToken('z'.repeat(43));
  const draft = client.queueDraft({ workspace_id: 'group_a', partner_id: 'counterparty_1', business_date: '2026-10-12', region: 'mn' }, { synthetic: true });
  assert.equal((await client.syncDraft(draft.id)).status, Sync.STATUS.BLOCKED);
  assert.equal(client.clearSession().authenticated, false);
  assert.equal(client.snapshot().drafts[0].status, Sync.STATUS.BLOCKED);
});

test('login sends credentials once, keeps the returned bearer in memory, and logout revokes it', async () => {
  const saved = storage(); const calls = [];
  const token = 'a'.repeat(43);
  const client = Sync.createSyncClient({ storage: saved, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/v1/login')) return response(200, { session_token: token, expires_at: 123 });
    if (url.endsWith('/v1/logout')) return response(204, {});
    throw new Error('unexpected route');
  }});
  const result = await client.login('operator_1', 'synthetic-password', 'group_a');
  assert.equal(result.authenticated, true);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    auth_subject: 'operator_1', password: 'synthetic-password', workspace_id: 'group_a'
  });
  assert.equal(saved.data.size, 0);
  await client.logout();
  assert.equal(calls[1].options.headers.authorization, 'Bearer ' + token);
  assert.equal(client.snapshot().authenticated, false);
});

test('subscription exposes state transitions for a UI without exposing credentials', async () => {
  const client = Sync.createSyncClient({ storage: storage(), fetchImpl: async () => response(200, { event_id: 'e1', new_revision: 1 }) });
  const states = [];
  const unsubscribe = client.subscribe(state => states.push(state));
  client.setSessionToken('s'.repeat(43));
  const draft = client.queueDraft({ workspace_id: 'group_a', partner_id: 'counterparty_1', business_date: '2026-10-12', region: 'mn' }, { synthetic: true });
  await client.syncDraft(draft.id);
  unsubscribe();
  client.clearSession();
  assert.equal(states[0].authenticated, false);
  assert.equal(states.some(state => state.authenticated === true), true);
  assert.equal(states.at(-1).drafts[0].status, Sync.STATUS.SYNCED);
  assert.equal(Object.prototype.hasOwnProperty.call(states.at(-1), 'session_token'), false);
  assert.equal(states.length >= 4, true);
});
