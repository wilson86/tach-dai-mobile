'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const Sync = require('../app/settlement-team-sync-client.js');
const A = require('../team-settlement/auth-contract.cjs');
const { createAuthHttpServer } = require('../team-settlement/auth-http-contract.cjs');
const { createLedgerApi } = require('../team-settlement/ledger-api-contract.cjs');

function response(status, body) { return { status, ok: status >= 200 && status < 300, json: async () => body }; }
function storage() {
  const data = new Map();
  return { data, get: key => data.get(key) || null, set: (key, value) => data.set(key, value), remove: key => data.delete(key) };
}

test('PWA rejects insecure remote team endpoints before credentials can be sent', () => {
  const options = { fetchImpl: async () => response(200, {}) };
  assert.throws(() => Sync.createSyncClient({ ...options, baseUrl: 'http://team.example.test' }), /SYNC_BASE_URL_INSECURE/);
  assert.throws(() => Sync.createSyncClient({ ...options, baseUrl: 'ftp://team.example.test' }), /SYNC_BASE_URL_INSECURE/);
  assert.throws(() => Sync.createSyncClient({ ...options, baseUrl: 'https://user:pass@team.example.test' }), /SYNC_BASE_URL_INVALID/);
  assert.doesNotThrow(() => Sync.createSyncClient({ ...options, baseUrl: 'https://team.example.test/' }));
  assert.doesNotThrow(() => Sync.createSyncClient({ ...options, baseUrl: 'http://127.0.0.1:8787' }));
});

test('PWA client keeps bearer token in memory and syncs a queued draft', async () => {
  const saved = storage(); const calls = [];
  const client = Sync.createSyncClient({ storage: saved, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/v1/scopes/drafts')) return response(200, { event_id: 'event_1', new_revision: 1, sync_status: 'SYNCED' });
    return response(200, { items: [{event_id: 'event_feed_1'}], next_cursor: 'cursor_1', sync_status: 'SYNCED' });
  }});
  client.setSessionToken('x'.repeat(43));
  const draft = client.queueDraft({ workspace_id: 'group_a', partner_id: 'counterparty_1', business_date: '2026-10-12', region: 'mn' }, { synthetic: true });
  const synced = await client.syncDraft(draft.id);
  assert.equal(synced.status, Sync.STATUS.SYNCED);
  assert.equal(calls[0].options.headers.authorization, 'Bearer ' + 'x'.repeat(43));
  assert.equal(saved.data.has('session_token'), false);
  await client.pullChanges();
  assert.equal(client.snapshot().cursor, 'cursor_1');
  assert.equal(saved.data.has(Sync.CURSOR_KEY), false); // Never reuse a prior person's cursor.
});

test('offline request stays PENDING, reconnect conflict becomes CONFLICT and is never auto-retried', async () => {
  let online = false; let calls = 0;
  const client = Sync.createSyncClient({ fetchImpl: async (url) => {
    calls += 1;
    if (!online) throw Object.assign(new Error('offline'), { code: 'NETWORK_DOWN' });
    if (url.includes('/v1/changes')) return response(200, { items: [], next_cursor: null, sync_status: 'SYNCED' });
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
  assert.equal(client.snapshot().drafts.length, 0); // Prior account's drafts are no longer visible.
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
  const client = Sync.createSyncClient({ storage: storage(), fetchImpl: async () => response(200, { event_id: 'e1', new_revision: 1, sync_status: 'SYNCED' }) });
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

test('PWA client integrates with synthetic localhost auth, draft and change endpoints', async () => {
  const auth = A.createAuthService({ clock: () => 1_000, sessionTtlMs: 10_000 });
  auth.registerIdentity({ user_id: 'operator_1', auth_subject: 'subject_operator', password: 'synthetic-operator-password' });
  auth.setMembership({ workspace_id: 'group_a', user_id: 'operator_1', role: 'operator' });
  const ledger = createLedgerApi({ auth, clock: () => 1_000 });
  const server = createAuthHttpServer(auth, { ledger: {
    appendDraft: (token, input) => ledger.mutateDraft(token, input),
    getChanges: async (_token, { cursor }) => ({
      items: cursor ? [] : [{ event_id: 'synthetic_event_1' }],
      next_cursor: 'synthetic_cursor_1', sync_status: 'SYNCED'
    })
  }});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const saved = storage();
    const client = Sync.createSyncClient({
      fetchImpl: globalThis.fetch.bind(globalThis), storage: saved,
      baseUrl: `http://127.0.0.1:${server.address().port}`
    });
    const login = await client.login('subject_operator', 'synthetic-operator-password', 'group_a');
    assert.equal(login.authenticated, true);
    const draft = client.queueDraft({ workspace_id: 'group_a', partner_id: 'counterparty_1', business_date: '2026-10-12', region: 'mn' }, { synthetic: true });
    assert.equal((await client.syncDraft(draft.id)).status, Sync.STATUS.SYNCED);
    const changes = await client.pullChanges();
    assert.equal(changes.status, Sync.STATUS.SYNCED);
    assert.equal(changes.items.length, 1);
    assert.equal(client.snapshot().cursor, 'synthetic_cursor_1');
    assert.equal(saved.data.has(Sync.CURSOR_KEY), false);
    await client.logout();
    assert.equal(client.snapshot().authenticated, false);
    assert.equal(saved.data.has('session_token'), false);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('new workspace login cannot inherit prior cursor or draft data', async () => {
  const saved = storage();
  const client = Sync.createSyncClient({
    storage: saved, fetchImpl: async (url) => {
      if (url.includes('/v1/login')) return response(200, { session_token: 'b'.repeat(43), expires_at: 9999 });
      if (url.includes('/v1/changes')) return response(200, { items: [{ event_id: 'a_1' }], next_cursor: 'cursor_from_a', sync_status: 'SYNCED' });
      return response(200, { event_id: 'event_1', new_revision: 1, sync_status: 'SYNCED' });
    }
  });
  await client.login('user_a', 'synthetic-pass', 'group_a');
  client.queueDraft({ workspace_id: 'group_a', partner_id: 'counterparty_1', business_date: '2026-10-12', region: 'mn' }, { customer_notes: 'synthetic-private-a' });
  await client.pullChanges();
  assert.equal(client.snapshot().cursor, 'cursor_from_a');
  assert.equal(client.snapshot().drafts.length, 1);
  assert.equal(client.clearSession().cursor, null);
  assert.equal(client.snapshot().drafts.length, 0);
  await client.login('user_b', 'synthetic-pass', 'group_b');
  assert.equal(client.snapshot().workspace_id, 'group_b');
  assert.equal(client.snapshot().cursor, null);
  assert.deepEqual(client.snapshot().drafts, []);
  assert.equal(saved.data.has(Sync.CURSOR_KEY), false);
  assert.throws(() => client.queueDraft({ workspace_id: 'group_a', partner_id: 'counterparty_1', business_date: '2026-10-12', region: 'mn' }, {}), /SYNC_WORKSPACE_MISMATCH/);
});

test('late previous-session draft result cannot be marked SYNCED for the next person', async () => {
  let finish;
  const client = Sync.createSyncClient({
    fetchImpl: async () => new Promise(resolve => { finish = resolve; })
  });
  client.setSessionToken('a'.repeat(43), 'group_a');
  const item = client.queueDraft({ workspace_id: 'group_a', partner_id: 'counterparty_1', business_date: '2026-10-12', region: 'mn' }, { private: 'synthetic-a' });
  const delayed = client.syncDraft(item.id);
  client.clearSession();
  client.setSessionToken('b'.repeat(43), 'group_b');
  finish(response(200, { event_id: 'a_done', new_revision: 1, sync_status: 'SYNCED' }));
  const result = await delayed;
  assert.equal(result.status, Sync.STATUS.BLOCKED);
  assert.equal(result.error, 'SYNC_SESSION_CHANGED');
  assert.equal(client.snapshot().drafts.length, 0);
  assert.equal(client.snapshot().workspace_id, 'group_b');
});

test('late previous-session change cursor cannot skip later user events', async () => {
  let finish;
  const client = Sync.createSyncClient({ fetchImpl: async () => new Promise(resolve => { finish = resolve; }) });
  client.setSessionToken('a'.repeat(43), 'group_a');
  const old = client.pullChanges();
  client.setSessionToken('b'.repeat(43), 'group_b');
  finish(response(200, { items: [], next_cursor: 'cursor_previous_workspace' }));
  assert.equal((await old).status, Sync.STATUS.BLOCKED);
  assert.equal(client.snapshot().cursor, null);
});

test('HTTP success without a verified event receipt never marks financial draft synced', async () => {
  const client = Sync.createSyncClient({ fetchImpl: async () => response(200, { ok: true }) });
  client.setSessionToken('a'.repeat(43), 'group_a');
  const item = client.queueDraft({ workspace_id: 'group_a', partner_id: 'counterparty_1', business_date: '2026-10-12', region: 'mn' }, { synthetic: true });
  const outcome = await client.syncDraft(item.id);
  assert.equal(outcome.status, Sync.STATUS.BLOCKED);
  assert.equal(outcome.error, 'SYNC_ACK_UNVERIFIED');
});

test('late logout cannot clear a later session', async () => {
  let finish;
  const client = Sync.createSyncClient({ fetchImpl: async () => new Promise(resolve => { finish = resolve; }) });
  client.setSessionToken('a'.repeat(43), 'group_a');
  const old = client.logout();
  client.setSessionToken('b'.repeat(43), 'group_b');
  finish(response(204, {}));
  await old;
  assert.equal(client.snapshot().authenticated, true);
  assert.equal(client.snapshot().workspace_id, 'group_b');
});

test('two independent PWA clients use distinct cryptographic idempotency keys even on the same workspace', () => {
  const one = Sync.createSyncClient({ fetchImpl: async () => response(503, {}) });
  const two = Sync.createSyncClient({ fetchImpl: async () => response(503, {}) });
  const scope = { workspace_id: 'group_a', partner_id: 'counterparty_1', business_date: '2026-10-12', region: 'mn' };
  one.setSessionToken('a'.repeat(43), 'group_a');
  two.setSessionToken('b'.repeat(43), 'group_a');
  const ids = [one.queueDraft(scope, {synthetic:1}).id, two.queueDraft(scope, {synthetic:2}).id,
               one.queueDraft(scope, {synthetic:3}).id];
  assert.equal(new Set(ids).size, 3);
  ids.forEach(id => assert.match(id, /^draft_[a-f0-9]{32}$/));
});

test('partial HTTP 200 change feed cannot advance cursor or claim SYNCED', async () => {
  let mode = 'good';
  const client = Sync.createSyncClient({ fetchImpl: async () => {
    if (mode === 'good') return response(200, {
      sync_status: 'SYNCED', items: [{event_id:'a'}], next_cursor:'cursor_a', has_more:false
    });
    if (mode === 'missing') return response(200, {
      sync_status: 'SYNCED', items: [{event_id:'b'}], next_cursor:null
    });
    if (mode === 'empty-skipping') return response(200, {
      sync_status:'SYNCED', items:[], next_cursor:'cursor_skips_events'
    });
    return response(200, { items:[], next_cursor:null });
  }});
  client.setSessionToken('a'.repeat(43), 'group_a');
  assert.equal((await client.pullChanges()).status, 'SYNCED');
  assert.equal(client.snapshot().cursor, 'cursor_a');
  for (mode of ['missing', 'empty-skipping', 'invalid']) {
    const res = await client.pullChanges();
    assert.equal(res.status, 'BLOCKED', mode);
    assert.equal(res.error, 'SYNC_FEED_UNVERIFIED', mode);
    assert.equal(client.snapshot().cursor, 'cursor_a');
  }
});

test('PWA reads only its authenticated workspace scope and validates server snapshot identity', async()=>{
  const scope={workspace_id:'group_a',partner_id:'counterparty_1',business_date:'2026-10-12',region:'mn'};
  const received=[];
  let wrong=false;
  const client=Sync.createSyncClient({fetchImpl:async(url)=>{
    received.push(url);
    return response(200,{...scope,workspace_id:wrong?'group_b':'group_a',revision:'1',state:'DRAFT'});
  }});
  client.setSessionToken('a'.repeat(43),'group_a');
  const read=await client.readScope(scope);
  assert.equal(read.status,'SYNCED');
  assert.equal(read.scope.revision,'1');
  assert.equal(received.length,1);
  assert.equal(received[0].endsWith('/v1/scopes/counterparty_1/2026-10-12/mn'),true);
  assert.equal((await client.readScope({...scope,workspace_id:'group_b'})).status,'BLOCKED');
  assert.equal(received.length,1);
  wrong=true;
  const forged=await client.readScope(scope);
  assert.equal(forged.status,'BLOCKED');
  assert.equal(forged.error,'SYNC_SCOPE_UNVERIFIED');
});

test('outstanding scope read cannot leak a previous account snapshot into the new session', async()=>{
  let finish;
  const client=Sync.createSyncClient({fetchImpl:async()=>new Promise(resolve=>{finish=resolve;})});
  const scope={workspace_id:'group_a',partner_id:'counterparty_1',business_date:'2026-10-12',region:'mn'};
  client.setSessionToken('a'.repeat(43),'group_a');
  const previous=client.readScope(scope);
  client.setSessionToken('b'.repeat(43),'group_b');
  finish(response(200,{...scope,revision:1,state:'DRAFT'}));
  const outcome=await previous;
  assert.equal(outcome.status,'BLOCKED');
  assert.equal(outcome.error,'SYNC_SESSION_CHANGED');
  assert.equal(client.snapshot().workspace_id,'group_b');
});

test('unsynced financial drafts cannot silently disappear on logout or account switching',async()=>{
  const scope={workspace_id:'group_a',partner_id:'counterparty_1',business_date:'2026-10-12',region:'mn'};
  const calls=[];
  const client=Sync.createSyncClient({fetchImpl:async url=>{
    calls.push(url);
    if(url.endsWith('/v1/logout'))return response(204,{});
    if(url.endsWith('/v1/login'))return response(200,{session_token:'b'.repeat(43)});
    return response(503,{error:'offline'});
  }});
  client.setSessionToken('a'.repeat(43),'group_a');
  const draft=client.queueDraft(scope,{synthetic:'unsent'});
  await assert.rejects(client.logout(),/SYNC_UNSENT_DRAFTS_REQUIRE_DECISION/);
  await assert.rejects(client.login('account_b','synthetic-passphrase','group_b'),/SYNC_UNSENT_DRAFTS_REQUIRE_DECISION/);
  assert.throws(()=>client.setSessionToken('b'.repeat(43),'group_b'),/SYNC_UNSENT_DRAFTS_REQUIRE_DECISION/);
  assert.equal(calls.length,0); // Decision required before any request.
  assert.equal(client.snapshot().drafts.length,1);
  assert.equal(client.snapshot().drafts[0].id,draft.id);
  await client.logout({discardPending:true});
  assert.equal(calls.length,1);
  assert.equal(client.snapshot().authenticated,false);
  assert.equal(client.snapshot().drafts.length,0);
});
test('successful synced draft may log out without unsent-data prompt',async()=>{
  const client=Sync.createSyncClient({fetchImpl:async url=>
    url.endsWith('/v1/logout')?response(204,{}):
      response(200,{event_id:'event_1',new_revision:1,sync_status:'SYNCED'})});
  client.setSessionToken('a'.repeat(43),'group_a');
  const draft=client.queueDraft({workspace_id:'group_a',partner_id:'counterparty_1',
    business_date:'2026-10-12',region:'mn'}, {synthetic:true});
  assert.equal((await client.syncDraft(draft.id)).status,'SYNCED');
  assert.equal((await client.logout()).authenticated,false);
});

test('replayed HTTP acknowledgement without original server revision cannot mark draft SYNCED',async()=>{
  const client=Sync.createSyncClient({fetchImpl:async()=>response(200,{
    event_id:'previous_synthetic_event',replayed:true,sync_status:'SYNCED'
  })});
  client.setSessionToken('x'.repeat(43),'group_a');
  const item=client.queueDraft({workspace_id:'group_a',partner_id:'counterparty_1',
    business_date:'2026-10-12',region:'mn'},{synthetic:true});
  const result=await client.syncDraft(item.id);
  assert.equal(result.status,'BLOCKED');
  assert.equal(result.error,'SYNC_ACK_UNVERIFIED');
  assert.equal(client.snapshot().drafts[0].server_revision,undefined);
});

test('replayed HTTP acknowledgement with exact original revision may mark draft SYNCED',async()=>{
  const client=Sync.createSyncClient({fetchImpl:async()=>response(200,{
    event_id:'previous_synthetic_event',replayed:true,new_revision:1,sync_status:'SYNCED'
  })});
  client.setSessionToken('x'.repeat(43),'group_a');
  const item=client.queueDraft({workspace_id:'group_a',partner_id:'counterparty_1',
    business_date:'2026-10-12',region:'mn'},{synthetic:true});
  const result=await client.syncDraft(item.id);
  assert.equal(result.status,'SYNCED');
  assert.equal(result.server_revision,1);
});
