'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../app/settlement-team-synthetic-walkthrough.html'),'utf8');
const matched=html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(matched,'standalone demo script must exist');
const context={module:{exports:{}}};
vm.runInNewContext(matched[1],context);
const {createMachine}=context.module.exports;
function run(machine,actor,scope,action,expectedRevision){return machine.apply({actor,scope,action,expectedRevision});}
test('operator and different reviewer complete fake-only workflow',()=>{
 const m=createMachine();
 assert.equal(run(m,'operator_a','A','CREATE',0).state,'DRAFT');
 assert.equal(run(m,'operator_a','A','SUBMIT',1).state,'PENDING_REVIEW');
 assert.equal(run(m,'operator_a','A','APPROVE',2).code,'ROLE_OR_STATE_DENIED');
 assert.equal(run(m,'reviewer_a','A','APPROVE',2).state,'REVIEWED');
 assert.equal(m.snapshot('A','reviewer_a').events.length,3);
});
test('tenant separation and viewer are enforced even in synthetic mode',()=>{
 const m=createMachine();
 assert.equal(m.snapshot('A','operator_b').code,'TENANT_DENIED');
 assert.equal(run(m,'operator_b','A','CREATE',0).code,'TENANT_DENIED');
 assert.equal(run(m,'viewer_a','A','CREATE',0).code,'ROLE_OR_STATE_DENIED');
 assert.equal(m.snapshot('A','operator_a').revision,0);
});
test('outdated revisions and illegal state transitions fail closed',()=>{
 const m=createMachine();run(m,'operator_a','A','CREATE',0);
 assert.equal(run(m,'operator_a','A','SUBMIT',0).code,'REVISION_CONFLICT');
 assert.equal(run(m,'reviewer_a','A','APPROVE',1).code,'ROLE_OR_STATE_DENIED');
 assert.equal(m.snapshot('A','operator_a').revision,1);
});
test('reset discards every simulated event',()=>{
 const m=createMachine();run(m,'operator_a','A','CREATE',0);m.reset();
 assert.equal(m.snapshot('A','operator_a').events.length,0);
 assert.equal(m.snapshot('A','operator_a').state,'EMPTY');
});
test('offline HTML blocks all network calls and clearly prohibits real-money use',()=>{
 assert.match(html,/connect-src 'none'/);
 assert.doesNotMatch(matched[1],/\bfetch\s*\(|localStorage|indexedDB|XMLHttpRequest|WebSocket/);
 assert.match(html,/CHỈ DỮ LIỆU GIẢ/);
 assert.match(html,/KHÔNG CÓ TÍNH TIỀN/);
});

// Regression: both fake groups must be able to finish the same review flow.
test('Group B has a distinct reviewer and can reach REVIEWED without leaking Group A',()=>{
 const m=createMachine();
 assert.equal(run(m,'operator_b','B','CREATE',0).state,'DRAFT');
 assert.equal(run(m,'operator_b','B','SUBMIT',1).state,'PENDING_REVIEW');
 assert.equal(run(m,'reviewer_a','B','APPROVE',2).code,'TENANT_DENIED');
 assert.equal(run(m,'reviewer_b','B','APPROVE',2).state,'REVIEWED');
 assert.equal(m.snapshot('B','reviewer_b').revision,3);
 assert.equal(m.snapshot('A','operator_a').revision,0);
 assert.equal(m.snapshot('B','viewer_a').code,'TENANT_DENIED');
});
test('returned demo snapshots cannot mutate retained audit events',()=>{
 const m=createMachine();run(m,'operator_b','B','CREATE',0);
 const snap=m.snapshot('B','operator_b');snap.events[0].state='REVIEWED';snap.events.push({state:'FORGED'});
 assert.equal(m.snapshot('B','reviewer_b').events.length,1);
 assert.equal(m.snapshot('B','reviewer_b').events[0].state,'DRAFT');
});
test('both fake actor/scope selectors have accessible programmatic labels',()=>{
 assert.match(html,/<label class="caption" for="actor">Người thao tác<\/label>/);
 assert.match(html,/<label class="caption" for="scope">Hồ sơ giả<\/label>/);
 assert.match(html,/<option value="reviewer_b">Người duyệt E · Nhóm B<\/option>/);
});
