'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPostgresLedgerRepository } = require('../team-settlement/postgres-ledger-repository.cjs');

const actor = { server_verified: true, membership_active: true, user_id: 'operator_1', workspace_id: 'group_a', role: 'operator' };
const scope = { workspace_id: 'group_a', partner_id: 'counterparty_1', business_date: '2026-10-12', region: 'mn' };

function fakeDb(resultRows = [{ result: { event_id: 'event_1', replayed: false, new_revision: 1 } }]) {
  const calls = [];
  const db = { calls, async transaction(work) {
    calls.push({ type: 'begin' });
    try { const value = await work({ query: async (text, params) => { calls.push({ text, params });
      if (text.includes('FROM kts_team.memberships m')) return { rows:[{ team_role:'operator' }] };
      return { rows: resultRows }; } }); calls.push({ type: 'commit' }); return value; }
    catch (error) { calls.push({ type: 'rollback', error: error.message }); throw error; }
  }};
  return db;
}

test('repository sets verified tenant context and delegates draft atomicity with parameters', async () => {
  const db = fakeDb();
  const repo = createPostgresLedgerRepository({ db });
  const result = await repo.appendDraft(actor, { scope, expected_revision: 0, event_id: 'event_1', idempotency_key: 'request_1', request_sha256: 'a'.repeat(64), snapshot: { synthetic: true } });
  assert.deepEqual(result, { event_id: 'event_1', replayed: false, new_revision: 1 });
  assert.equal(db.calls[0].type, 'begin');
  assert.deepEqual(db.calls[1].params, ['group_a', 'operator_1']);
  assert.match(db.calls[3].text, /kts_team\.append_draft/);
  assert.deepEqual(db.calls[3].params.slice(0, 8), ['group_a','counterparty_1','2026-10-12','mn',0,'event_1','request_1','a'.repeat(64)]);
  assert.equal(db.calls[3].params[8], '{"synthetic":true}');
  assert.equal(db.calls.at(-1).type, 'commit');
});

test('repository rejects cross-tenant and malformed mutation before database access', async () => {
  const db = fakeDb();
  const repo = createPostgresLedgerRepository({ db });
  await assert.rejects(() => repo.appendDraft(actor, { scope: { ...scope, workspace_id: 'group_b' }, expected_revision: 0, event_id: 'event_1', idempotency_key: 'request_1', request_sha256: 'a'.repeat(64), snapshot: { synthetic: true } }), /TEAM_WORKSPACE_DENIED/);
  await assert.rejects(() => repo.appendDraft(actor, { scope, expected_revision: 0, event_id: 'event_1', idempotency_key: 'request_1', request_sha256: 'not-a-hash', snapshot: { synthetic: true } }), /TEAM_REQUEST_INVALID/);
  assert.equal(db.calls.length, 0);
});

test('repository rolls back when database result shape is invalid', async () => {
  const repo = createPostgresLedgerRepository({ db: fakeDb([]) });
  await assert.rejects(() => repo.appendDraft(actor, { scope, expected_revision: 0, event_id: 'event_1', idempotency_key: 'request_1', request_sha256: 'a'.repeat(64), snapshot: { synthetic: true } }), /TEAM_DB_RESULT_INVALID/);
});

test('scope reads stay workspace-scoped and reject empty result', async () => {
  const row = { workspace_id: 'group_a', partner_id: 'counterparty_1', business_date: '2026-10-12', region: 'mn', state: 'DRAFT', revision: 1 };
  const db = fakeDb([row]);
  const repo = createPostgresLedgerRepository({ db });
  assert.deepEqual(await repo.getScope(actor, scope), row);
  assert.match(db.calls[3].text, /WHERE workspace_id=\$1/);
  await assert.rejects(() => createPostgresLedgerRepository({ db: fakeDb([]) }).getScope(actor, scope), /TEAM_SCOPE_NOT_FOUND/);
});

test('change reads use a bounded ordered cursor and return sync status', async () => {
  const rows = [
    { event_id: 'event_a', feed_seq: '1', recorded_at: '2026-10-12T10:00:00.000Z', event_kind: 'DRAFT_CREATED' },
    { event_id: 'event_b', feed_seq: '2', recorded_at: '2026-10-12T10:01:00.000Z', event_kind: 'DRAFT_CHANGED' }
  ];
  const db = fakeDb(rows);
  const repo = createPostgresLedgerRepository({ db });
  const page = await repo.getChanges(actor, { limit: 1 });
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].event_id, 'event_a');
  assert.equal(page.sync_status, 'SYNCED');
  assert.equal(typeof page.next_cursor, 'string');
  assert.deepEqual(db.calls[3].params, ['group_a','0',2]);
  const cursor=JSON.parse(Buffer.from(page.next_cursor,'base64url').toString('utf8'));
  assert.deepEqual(cursor,{feed_seq:'1',workspace_id:'group_a'});
  await assert.rejects(() => repo.getChanges(actor, { cursor: 'not-a-cursor' }), /TEAM_CURSOR_INVALID/);
  await assert.rejects(() => repo.getChanges(actor, { limit: 501 }), /TEAM_LIMIT_INVALID/);
});
