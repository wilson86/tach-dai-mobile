'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const code = fs.readFileSync(path.join(__dirname, '..', 'app', 'settlement-attention-ui.js'), 'utf8');
const sandbox = { globalThis: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const A = sandbox.globalThis.KTS_SETTLEMENT_ATTENTION;

assert.strictEqual(A.version, 'settlement-attention-v5-stale-safe-refresh');
assert.strictEqual(A.actionFor('BLOCKED'), 'message');
assert.strictEqual(A.actionFor('PROVISIONAL'), 'result');
assert.strictEqual(A.actionFor('KQXS_UNVERIFIED'), 'result');
assert.strictEqual(A.actionFor('KQXS_CONFLICT'), 'result');
assert.strictEqual(A.actionFor('MISMATCH'), 'shadow');
assert.strictEqual(A.actionForItem('BLOCKED', ['KQXS_SOURCE_CONFLICT']), 'result');
assert.strictEqual(A.actionForItem('BLOCKED', ['PENDING_PARSER:m1']), 'message');
assert.strictEqual(A.statusKind('MISMATCH'), 'err');
assert.strictEqual(A.statusKind('UNVERIFIED'), 'warn');
assert.strictEqual(A.formatDelta(1.23456), '+1.2346');
assert.strictEqual(A.formatDelta(-2), '-2');

const diag = A.diagnosticSummary({
  status:'MISMATCH',
  category_reference_missing:false,
  category_issues:[{
    code:'DAT',
    fields:[{field:'qua_co',delta:-1},{field:'payout',delta:650}],
    messages:[{id:'m1',raw_text:'92 61 44 da 1n'}]
  }]
});
assert.deepStrictEqual(Array.from(diag.lines), ['DAT · QUA CÒ -1 · TRẢ +650']);
assert.deepStrictEqual(Array.from(diag.messages), ['92 61 44 da 1n']);

const missingDetail = A.diagnosticSummary({ status:'MISMATCH', category_reference_missing:true, category_issues:[], total_issues:[{field:'final_net',delta:10}] });
assert.deepStrictEqual(Array.from(missingDetail.lines), ['Lệch tổng nhưng dữ liệu đối soát chưa có chi tiết theo loại cược']);

const model = {
  business_date: '2026-10-06',
  status: 'BLOCKED',
  partners: [
    {
      partner: { id:'p1', name:'Hiền', role:'customer' },
      shadow_status:'UNVERIFIED',
      blocked_scopes:[{ region:'mn', reasons:['PENDING_PARSER:m1'] }],
      regions:[{ region:'mn', blocked:true, provisional:false, shadow_status:'BLOCKED' }]
    },
    {
      partner: { id:'p2', name:'Trúc', role:'owner' },
      shadow_status:'MISMATCH', blocked_scopes:[],
      regions:[{ region:'mb', blocked:false, provisional:false, shadow_status:'MISMATCH' }]
    },
    {
      partner: { id:'p3', name:'Thái', role:'owner' },
      shadow_status:'UNVERIFIED', blocked_scopes:[],
      regions:[{ region:'mt', blocked:false, provisional:true, shadow_status:'UNVERIFIED' }]
    },
    {
      partner: { id:'p4', name:'Quýt', role:'customer' },
      shadow_status:'MATCH_DISPLAY_ONLY', blocked_scopes:[],
      regions:[{ region:'mb', blocked:false, provisional:false, shadow_status:'MATCH_DISPLAY_ONLY' }]
    },
    {
      partner: { id:'p5', name:'Thiên', role:'customer' },
      shadow_status:'UNVERIFIED', blocked_scopes:[],
      regions:[{ region:'mn', blocked:false, provisional:false, shadow_status:'UNVERIFIED' }]
    },
    {
      partner: { id:'p7', name:'KQ lỗi', role:'customer' },
      shadow_status:'BLOCKED',
      blocked_scopes:[{ region:'mb', reasons:['KQXS_SOURCE_CONFLICT'] }],
      regions:[{ region:'mb', blocked:true, provisional:false, shadow_status:'BLOCKED' }]
    },
    {
      partner: { id:'p8', name:'KQXS chờ', role:'customer' },
      shadow_status:'MATCH_EXACT', blocked_scopes:[],
      regions:[{ region:'mn', blocked:false, provisional:false, kqxs_verified:false, kqxs_conflict:false, shadow_status:'MATCH_EXACT' }]
    },
    {
      partner: { id:'p6', name:'Đã khớp', role:'customer' },
      shadow_status:'MATCH_EXACT', blocked_scopes:[],
      regions:[{ region:'mb', blocked:false, provisional:false, shadow_status:'MATCH_EXACT' }]
    }
  ]
};

const out = A.buildAttention(model);
assert.strictEqual(out.business_date, '2026-10-06');
assert.strictEqual(out.items.length, 7);
assert.deepStrictEqual(Array.from(out.items, x => x.status), ['BLOCKED','BLOCKED','MISMATCH','PROVISIONAL','KQXS_UNVERIFIED','MATCH_DISPLAY_ONLY','UNVERIFIED']);
assert.strictEqual(out.items.find(x => x.partner_id === 'p1').action, 'message');
assert.strictEqual(out.items.find(x => x.partner_id === 'p7').action, 'result');
assert.strictEqual(out.items.find(x => x.partner_id === 'p2').action, 'shadow');
assert.strictEqual(out.items.find(x => x.partner_id === 'p8').action, 'result');
assert.deepStrictEqual(Array.from(out.items.find(x => x.partner_id === 'p1').reasons), ['PENDING_PARSER:m1']);
assert.strictEqual(out.counts.BLOCKED, 2);
assert.strictEqual(out.counts.MISMATCH, 1);
assert.strictEqual(out.clear, false);

const clear = A.buildAttention({ business_date:'2026-10-06', status:'MATCH_EXACT', partners:[{
  partner:{id:'ok',name:'OK'}, blocked_scopes:[], regions:[{region:'mb',blocked:false,provisional:false,shadow_status:'MATCH_EXACT'}]
}]});
assert.strictEqual(clear.items.length, 0);
assert.strictEqual(clear.clear, true);
const notClearKqxs = A.buildAttention({ business_date:'2026-10-06', status:'MATCH_EXACT', partners:[{
  partner:{id:'pending',name:'Pending'}, blocked_scopes:[], regions:[{region:'mb',blocked:false,provisional:false,kqxs_verified:false,kqxs_conflict:false,shadow_status:'MATCH_EXACT'}]
}]});
assert.strictEqual(notClearKqxs.clear,false,'KQXS pending must prevent clear state');
assert.strictEqual(notClearKqxs.items[0].status,'KQXS_UNVERIFIED');
assert(code.includes('Việc cần xử lý'));
assert.strictEqual(A.statusLabel('BLOCKED'),'CHƯA TÍNH');
assert.strictEqual(A.statusLabel('MISMATCH'),'LỆCH ĐỐI SOÁT');
assert.strictEqual(A.statusLabel('KQXS_UNVERIFIED'),'KQXS CHƯA XÁC MINH');
assert(code.includes('Khoanh vùng:'));
assert(code.includes('Tin liên quan'));
assert(code.includes('shadowRuntime.getDiagnostics'));
assert(code.includes('kts:shadow-saved'));
assert(code.includes('kts:auto-result-recalculated'));



assert(source.includes('let refreshEpoch = 0'));
assert(source.includes('const epoch = ++refreshEpoch'));
assert(source.includes('epoch === refreshEpoch'));
console.log('settlement-attention-ui-tests: PASS');
