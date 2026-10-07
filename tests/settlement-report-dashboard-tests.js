'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const code = fs.readFileSync(path.join(__dirname, '..', 'app', 'settlement-report-dashboard.js'), 'utf8');
const sandbox = { globalThis: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const D = sandbox.globalThis.KTS_SETTLEMENT_REPORT_DASHBOARD;

assert.strictEqual(D.version, 'settlement-report-dashboard-v5-kqxs-evidence-required');
assert.strictEqual(D.shadowLabel('MATCH_EXACT'), 'ĐÃ ĐỐI SOÁT');
assert.strictEqual(D.shadowLabel('MISMATCH'), 'LỆCH ĐỐI SOÁT');
assert.strictEqual(D.shadowKind('MATCH_EXACT'), 'ok');
assert.strictEqual(D.shadowKind('MISMATCH'), 'err');
assert.deepStrictEqual(Array.from(D.dayStatus('BLOCKED')), ['CÓ PHẠM VI CHƯA TÍNH','err']);
assert.deepStrictEqual(Array.from(D.dayStatus('PROVISIONAL')), ['CÓ KẾT QUẢ TẠM TÍNH','warn']);
assert.strictEqual(D.direction(5), 'THU');
assert.strictEqual(D.direction(-5), 'BÙ');
assert.strictEqual(D.direction(0), 'HÒA');

const breakdown = D.buildBreakdown({ partners: [
  {
    partner:{ id:'h', role:'customer' }, totals:{ xac:100, qua_co:76, payout:20, refund_amount:1, final_net:55 },
    regions:[{ region:'mn', total_xac:60, total_qua_co:45.6, total_payout:20, refund_amount:1, final_net:24.6 },{ region:'mb', total_xac:40, total_qua_co:30.4, total_payout:0, refund_amount:0, final_net:30.4 }]
  },
  {
    partner:{ id:'t', role:'owner' }, totals:{ xac:50, qua_co:38, payout:80, refund_amount:0, final_net:42 },
    regions:[{ region:'mt', total_xac:50, total_qua_co:38, total_payout:80, refund_amount:0, final_net:42 }]
  }
]});
assert.strictEqual(breakdown.role_totals.customer.xac, 100);
assert.strictEqual(breakdown.role_totals.customer.final_net, 55);
assert.strictEqual(breakdown.role_totals.owner.payout, 80);
assert.strictEqual(breakdown.region_totals.mn.xac, 60);
assert.strictEqual(breakdown.region_totals.mb.final_net, 30.4);
assert.strictEqual(breakdown.region_totals.mt.final_net, 42);

const ready = D.buildReadiness({
  status:'MATCH_EXACT',
  counts:{ partners:3, exact:3, blocked:0, provisional:0, mismatch:0, display_only:0, unverified:0 },
  partners:[
    {regions:[{region:'mn',kqxs_verified:true,kqxs_conflict:false}]},
    {regions:[{region:'mt',kqxs_verified:true,kqxs_conflict:false}]},
    {regions:[{region:'mb',kqxs_verified:true,kqxs_conflict:false}]}
  ]
});
assert.strictEqual(ready.ready, true);
assert.strictEqual(ready.reasons.length, 0);
const notReady = D.buildReadiness({
  status:'BLOCKED',
  counts:{ partners:3, exact:1, blocked:1, provisional:1, mismatch:0, display_only:0, unverified:1 },
  partners:[
    {regions:[{region:'mn',kqxs_verified:true,kqxs_conflict:false}]},
    {regions:[{region:'mt',kqxs_verified:true,kqxs_conflict:false}]},
    {regions:[{region:'mb',kqxs_verified:true,kqxs_conflict:false}]}
  ]
});
assert.strictEqual(notReady.ready, false);
assert.deepStrictEqual(Array.from(notReady.reasons, r => r.code), ['BLOCKED','PROVISIONAL','UNVERIFIED']);
const displayOnly = D.buildReadiness({
  status:'MATCH_DISPLAY_ONLY',
  counts:{ partners:1, exact:0, blocked:0, provisional:0, mismatch:0, display_only:1, unverified:0 },
  partners:[{regions:[{region:'mn',kqxs_verified:true,kqxs_conflict:false}]}]
});
assert.strictEqual(displayOnly.ready, false);
assert.strictEqual(displayOnly.reasons[0].code, 'DISPLAY_ONLY');
const empty = D.buildReadiness({ status:'EMPTY', counts:{ partners:0 } });
assert.strictEqual(empty.ready, false);
assert.strictEqual(empty.reasons[0].code, 'NO_DATA');

const missingKqxsEvidence = D.buildReadiness({
  status:'MATCH_EXACT',
  counts:{ partners:1, exact:1, blocked:0, provisional:0, mismatch:0, display_only:0, unverified:0 }
});
assert.strictEqual(missingKqxsEvidence.ready,false,'daily close must fail closed when partner counts exist without region/KQXS evidence');
assert(missingKqxsEvidence.reasons.some(r=>r.code==='KQXS_EVIDENCE_MISSING'));

const partialKqxsEvidence = D.buildReadiness({
  status:'MATCH_EXACT',
  counts:{ partners:2, exact:2, blocked:0, provisional:0, mismatch:0, display_only:0, unverified:0 },
  partners:[{regions:[{region:'mn',kqxs_verified:true,kqxs_conflict:false}]}]
});
assert.strictEqual(partialKqxsEvidence.ready,false,'missing one partner row must fail closed even when remaining KQXS evidence is verified');
assert(partialKqxsEvidence.reasons.some(r=>r.code==='KQXS_EVIDENCE_MISSING'));

const kqxsPending = D.buildReadiness({
  status:'MATCH_EXACT',
  counts:{ partners:1, exact:1, blocked:0, provisional:0, mismatch:0, display_only:0, unverified:0 },
  partners:[{regions:[{region:'mn',kqxs_verified:false,kqxs_conflict:false,shadow_status:'MATCH_EXACT'}]}]
});
assert.strictEqual(kqxsPending.ready,false,'MATCH_EXACT money must not close day before KQXS verification');
assert(kqxsPending.reasons.some(r=>r.code==='KQXS_UNVERIFIED'));
assert.strictEqual(kqxsPending.kqxs_pending,1);

const kqxsConflict = D.buildReadiness({
  status:'MATCH_EXACT',
  counts:{ partners:1, exact:1, blocked:0, provisional:0, mismatch:0, display_only:0, unverified:0 },
  partners:[{regions:[{region:'mb',kqxs_verified:false,kqxs_conflict:true,shadow_status:'MATCH_EXACT'}]}]
});
assert.strictEqual(kqxsConflict.ready,false);
assert(kqxsConflict.reasons.some(r=>r.code==='KQXS_CONFLICT'));

assert(code.includes('Tiền theo từng miền'));
assert(code.includes("regionCard('Miền Nam'"));
assert(code.includes("regionCard('Miền Trung'"));
assert(code.includes("regionCard('Miền Bắc'"));
assert(code.includes('Tổng cộng cả 3 miền / kiểm tra vai trò'));
assert(code.includes('TRẠNG THÁI CHỐT NGÀY'));
assert(code.includes('KQXS CHƯA XÁC MINH 2 NGUỒN'));
assert(code.includes('KQXS CÓ LỆCH NGUỒN'));
assert(code.includes('không tự chốt hoặc khóa ngày'));
assert(code.includes('Không dùng tổng này để chốt'));
assert(code.includes('Theo loại cược'));
assert(code.includes('Xem chi tiết'));
assert(code.includes('buildDailyOperationsReport'));

assert(source.includes("kts:settlement-message-saved"));
assert(source.includes("kts:settlement-message-activity-changed"));
assert(source.includes("kts:settlement-config-recalculated"));


// Empty/cancelled-only scopes are filtered by settlement-report before dashboard readiness.

assert(source.includes('let refreshEpoch = 0'));
assert(source.includes('const epoch = ++refreshEpoch'));
assert(source.includes('epoch === refreshEpoch && scopeDate() === date'));
console.log('settlement-report-dashboard-tests: PASS');
