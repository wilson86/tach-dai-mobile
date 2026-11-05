'use strict';
// Owner-authorized money oracle (KTS Issue #18 comment 6654485358).
// Intentionally RED at parent SHA f0ca9b35: Router CEIL mismatch must not be
// "fixed" by removing HOLD without authenticated single-transform receipt.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const match = html.match(/const OfflineKTS=\(\(\)=>\{[\s\S]*?\}\)\(\);/u);
assert.ok(match, 'exact embedded canonical Quyt engine must be present');
const engine = vm.runInNewContext(match[0] + '\nOfflineKTS', {console});
const options = {market:'mb',customer:'quyt',tick:true,rate:'1.067'};
function amount(raw, number='21', kind='b') {
 const out = engine.merge(raw,options);
 const row = out.rows.find(r=>r.number===number && r.kind===kind);
 assert.ok(row, 'missing canonical row');
 assert.match(out.pretty, /\bb\d+n\./u, 'forwardable money is integer n');
 assert.doesNotMatch(out.pretty, /\bb\d+[.,]\d+n\./u);
 return {row,out};
}
test('OWNER: 10n x 1.067 -> 11n HALF_UP, no fractional output',()=>{
 const {row}=amount('hn 21 b10n');
 assert.equal(row.beforeRounding,'10.67');
 assert.equal(row.adjusted,'11');
});
test('OWNER: 75n x 1.067 -> 80n HALF_UP, not Router CEIL 81n',()=>{
 const {row}=amount('hn 21 b75n');
 assert.equal(row.beforeRounding,'80.025');
 assert.equal(row.adjusted,'80');
});
test('aggregate distinct message placements BEFORE factor and rounding',()=>{
 const {row,out}=amount('hn 21 b5n\nhn 21 lo5n');
 assert.equal(row.raw,'10');
 assert.equal(row.adjusted,'11');
 assert.equal(out.sourceCount,2);
});
test('same text as two placements requires explicit confirmation',()=>{
 assert.throws(()=>engine.merge('hn 21 b5n\nhn 21 b5n',options),/TIN_TRÙNG_CHƯA_XÁC_NHẬN/u);
 const out=engine.merge('hn 21 b5n\nhn 21 b5n',{...options,duplicateConfirmed:true});
 assert.equal(out.rows.find(r=>r.number==='21').adjusted,'11');
});
test('non-Quyt cannot enable factor',()=>{
 assert.throws(()=>engine.merge('hn 21 b10n',{...options,customer:'hien'}),/Hệ số Quýt/u);
});
test('non BAO_LO DD is not multiplied',()=>{
 const out=engine.merge('hn 21 dd10n',options);
 assert.equal(out.rows.find(r=>r.kind==='dd').adjusted,'10');
});
test('missing authenticated source_message_id remains NOT_PROVEN by this PWA',()=>{
 assert.equal(typeof engine.merge,'function');
 // Deliberately no fake PASS: message fingerprint + manual confirmation is
 // not Telegram source_message_id replay-idempotency. Router gate still HOLD.
});
