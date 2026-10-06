'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const code = fs.readFileSync(path.join(__dirname, '..', 'app', 'settlement-message-history.js'), 'utf8');
const sandbox = { globalThis: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const H = sandbox.globalThis.KTS_SETTLEMENT_MESSAGE_HISTORY;

const scope = { partner_id: 'p1', business_date: '2026-10-06', region: 'mn' };
const messages = [
  { id: 'm1', partner_id: 'p1', business_date: '2026-10-06', region: 'mn', raw_text: 'tg 75 b 1n', status: 'settled_unverified', created_at: '2026-10-06T01:00:00Z' },
  { id: 'm2', partner_id: 'p1', business_date: '2026-10-06', region: 'mn', raw_text: 'tg 32 b 1n', status: 'parser_error', parser_error: 'BAD_SYNTAX', created_at: '2026-10-06T02:00:00Z' },
  { id: 'm4', partner_id: 'p1', business_date: '2026-10-06', region: 'mn', raw_text: 'tg 11 b 1n', status: 'cancelled', created_at: '2026-10-06T04:00:00Z' },
  { id: 'm3', partner_id: 'p2', business_date: '2026-10-06', region: 'mn', raw_text: 'x', status: 'parsed_waiting_result', created_at: '2026-10-06T03:00:00Z' }
];
const settlements = [
  { id: 's1', message_ids: ['m1'], scope_status: 'complete_unverified', blocked_reasons: [] },
  { id: 's2', message_ids: ['m2'], scope_status: 'blocked', blocked_reasons: ['PENDING_PARSER:m2'] }
];

assert.strictEqual(H.scopeMatch(messages[0], scope), true);
assert.strictEqual(H.scopeMatch(messages[3], scope), false);
const rows = H.buildRows(scope, messages, settlements);
assert.strictEqual(rows.length, 3);
assert.strictEqual(rows[0].message.id, 'm4', 'newest first');
assert.strictEqual(rows[0].state.code, 'CANCELLED');
assert.strictEqual(rows[1].state.code, 'PARSER_ERROR');
assert.strictEqual(rows[2].state.code, 'UNVERIFIED');
assert.strictEqual(H.deriveState({ status: 'parsed_waiting_result' }, null).code, 'WAITING_RESULT');
assert.strictEqual(H.deriveState({ status: 'settled_provisional' }, { scope_status: 'provisional' }).code, 'PROVISIONAL');
assert.strictEqual(H.deriveState({ status: 'parsed_waiting_result' }, { scope_status: 'blocked' }).code, 'BLOCKED');
assert.strictEqual(H.deriveState({ status: 'cancelled', parser_error: 'old error' }, { scope_status: 'blocked' }).code, 'CANCELLED');

console.log('settlement-message-history-tests: PASS');
