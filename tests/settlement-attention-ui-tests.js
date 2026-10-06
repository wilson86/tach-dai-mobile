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

assert.strictEqual(A.version, 'settlement-attention-v1');
assert.strictEqual(A.actionFor('BLOCKED'), 'message');
assert.strictEqual(A.actionFor('PROVISIONAL'), 'result');
assert.strictEqual(A.actionFor('MISMATCH'), 'shadow');
assert.strictEqual(A.statusKind('MISMATCH'), 'err');
assert.strictEqual(A.statusKind('UNVERIFIED'), 'warn');

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
      partner: { id:'p6', name:'Đã khớp', role:'customer' },
      shadow_status:'MATCH_EXACT', blocked_scopes:[],
      regions:[{ region:'mb', blocked:false, provisional:false, shadow_status:'MATCH_EXACT' }]
    }
  ]
};

const out = A.buildAttention(model);
assert.strictEqual(out.business_date, '2026-10-06');
assert.strictEqual(out.items.length, 5);
assert.deepStrictEqual(Array.from(out.items, x => x.status), ['BLOCKED','MISMATCH','PROVISIONAL','MATCH_DISPLAY_ONLY','UNVERIFIED']);
assert.deepStrictEqual(Array.from(out.items, x => x.action), ['message','shadow','result','shadow','shadow']);
assert.deepStrictEqual(Array.from(out.items[0].reasons), ['PENDING_PARSER:m1']);
assert.strictEqual(out.counts.BLOCKED, 1);
assert.strictEqual(out.counts.MISMATCH, 1);
assert.strictEqual(out.clear, false);

const clear = A.buildAttention({ business_date:'2026-10-06', status:'MATCH_EXACT', partners:[{
  partner:{id:'ok',name:'OK'}, blocked_scopes:[], regions:[{region:'mb',blocked:false,provisional:false,shadow_status:'MATCH_EXACT'}]
}]});
assert.strictEqual(clear.items.length, 0);
assert.strictEqual(clear.clear, true);
assert(code.includes('Việc cần xử lý'));
assert(code.includes('kts:shadow-saved'));
assert(code.includes('kts:auto-result-recalculated'));

console.log('settlement-attention-ui-tests: PASS');
