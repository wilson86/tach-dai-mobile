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
  { id: 'scope:p1:2026-10-06:mn', partner_id:'p1', business_date:'2026-10-06', region:'mn', message_ids: ['m1','m2'], scope_status: 'blocked', comparison_status:'blocked', blocked_reasons: ['PENDING_PARSER:m2'], settlement_result:{ total_xac:0,total_qua_co:0,total_payout:0,refund_amount:0,final_net:0 } }
];

assert.strictEqual(H.version, 'message-history-v7-scope-mutation-lock');
assert.strictEqual(H.scopeMatch(messages[0], scope), true);
assert.strictEqual(H.scopeMatch(messages[3], scope), false);
const rows = H.buildRows(scope, messages, settlements);
assert.strictEqual(rows.length, 3);
assert.strictEqual(rows[0].message.id, 'm4', 'newest first');
assert.strictEqual(rows[0].state.code, 'CANCELLED');
assert.strictEqual(rows[1].state.code, 'PARSER_ERROR');
assert.strictEqual(rows[2].state.code, 'BLOCKED');
assert.strictEqual(H.deriveState({ status: 'parsed_waiting_result' }, null).code, 'WAITING_RESULT');
assert.strictEqual(H.deriveState({ status: 'settled_provisional' }, { scope_status: 'provisional' }).code, 'PROVISIONAL');
assert.strictEqual(H.deriveState({ status: 'parsed_waiting_result' }, { scope_status: 'blocked' }).code, 'BLOCKED');
assert.strictEqual(H.deriveState({ status: 'cancelled', parser_error: 'old error' }, { scope_status: 'blocked' }).code, 'CANCELLED');
assert.strictEqual(H.settlementForScope(scope, settlements).id, 'scope:p1:2026-10-06:mn');

const blockedSummary = H.buildScopeSummary(scope, messages, settlements, {
  id:'2026-10-06:mn', business_date:'2026-10-06', region:'mn', complete:true, verified:true, verification_status:'verified',
  verification_sources:['primary','secondary'], expected_station_codes:['bt','vt','bli'],
  stations:[{code:'bt'},{code:'vt'},{code:'bli'}]
});
assert.strictEqual(blockedSummary.counts.total, 3);
assert.strictEqual(blockedSummary.counts.active, 2);
assert.strictEqual(blockedSummary.counts.cancelled, 1);
assert.strictEqual(blockedSummary.counts.parser_errors, 1);
assert.strictEqual(blockedSummary.state.code, 'BLOCKED');
assert.strictEqual(blockedSummary.kqxs.label, 'ĐÃ XÁC MINH');
assert.deepStrictEqual(Array.from(blockedSummary.blocked_reasons), ['Có tin chưa đọc được cú pháp.']);
assert.strictEqual(H.friendlyReason('NO_CONFIG_FOR_BUSINESS_DATE'),'Chưa có thiết lập giá cho ngày này.');
assert.strictEqual(H.friendlyReason('PRICE_MISSING:mt:2CB'),'Miền Trung chưa có bảng giá riêng. Mở Thiết lập và lưu bảng giá MT.');

const goodMessages = [messages[0], messages[2]];
const exactSettlement = [{
  id:'scope:p1:2026-10-06:mn', partner_id:'p1', business_date:'2026-10-06', region:'mn', message_ids:['m1'],
  scope_status:'complete_unverified', comparison_status:'MATCH_EXACT', blocked_reasons:[],
  settlement_result:{ total_xac:18,total_qua_co:13.68,total_payout:75,refund_amount:0,final_net:-61.32 }
}];
const exactSummary = H.buildScopeSummary(scope, goodMessages, exactSettlement, {
  id:'2026-10-06:mn', business_date:'2026-10-06', region:'mn', complete:true
});
assert.strictEqual(exactSummary.state.code, 'MATCH_EXACT');
assert.strictEqual(exactSummary.kqxs.label, 'ĐÃ ĐỦ KQ · CHỜ ĐỐI CHIẾU');
assert.strictEqual(exactSummary.totals.xac, 18);
assert.strictEqual(exactSummary.totals.direction, 'BÙ');
assert(Math.abs(exactSummary.totals.final_net - (-61.32)) < 1e-9);

const parsedSample={canonical_payload:{legs:[
  {code:'DAX',values:['28','68','69'],stake:'5',station_codes:['bt','vt']},
  {code:'3CXC',values:['123'],stake:'2',station_codes:['bt'],position:'duoi'}
]}};
assert.strictEqual(H.canonicalSummary(parsedSample),'BT+VT · 28 68 69 Đá xuyên · 5n | BT · 123 3C xỉu chủ DUOI · 2n');

const waiting = H.buildScopeSummary(scope, [messages[0]], [], null);
assert.strictEqual(waiting.state.code, 'WAITING_RESULT');
assert.strictEqual(waiting.kqxs.label, 'CHƯA CÓ KQ');



const historySource=fs.readFileSync(path.join(__dirname,'..','app','settlement-message-history.js'),'utf8');
assert(historySource.includes("kts:settlement-message-activity-changed"));


const weakSummary = H.buildScopeSummary(scope, goodMessages, exactSettlement, {
  id:'2026-10-06:mn',business_date:'2026-10-06',region:'mn',complete:true,verified:true,verification_status:'verified',
  verification_sources:['primary'],expected_station_codes:['bt'],stations:[{code:'bt'}]
});
assert.strictEqual(weakSummary.kqxs.verified,false);
assert.strictEqual(weakSummary.kqxs.label,'ĐÃ ĐỦ KQ · CHỜ ĐỐI CHIẾU');


assert(historySource.includes('let scopeMutationBusy = false'));
assert(historySource.includes('function beginScopeMutation(label)'));
assert(historySource.includes("querySelectorAll('[data-cancel-message],[data-restore-message],#recalcMessageScope')"));
assert(historySource.includes("if (!beginScopeMutation('hủy/khôi phục')) return;"));
assert(historySource.includes("if (!beginScopeMutation('rà lại')) return;"));
assert(historySource.includes('setScopeMutationBusy(false)'));
console.log('settlement-message-history-tests: PASS');
