'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {probe}=require('./fixtures/session-bound-receipt-positive-control.cjs');
const input={bearer:'synthetic_'+ 'a'.repeat(40),workspace:'synthetic_group_a',nonce:'c'.repeat(32),
 expires:1793789000,keys:['draft_'+ '1'.repeat(32)]};
function fixture({rows=[{workspace_id:input.workspace,actor_user_id:'synthetic_operator',idempotency_key:input.keys[0]}],role='synthetic_receipt_ledger',rollback='ROLLBACK'}={}){
 const events=[];return {events,pool:{async connect(){events.push('connect');return {
  async query(sql){
   if(sql==='BEGIN'||sql==='SET TRANSACTION READ ONLY'){events.push(sql);return {command:sql,rows:[]};}
   if(sql==='ROLLBACK'){events.push(sql);return {command:rollback,rows:[]};}
   if(sql.includes('current_user::text'))return {rows:[{role,session_role:role}]};
   if(sql.includes('candidate_receipt_read_v1')){events.push('function');return {rows};}
   throw Error('UNEXPECTED_QUERY');
  },release(x){events.push('release:'+x)}
 };}}};
}
test('positive control requires one actor-scoped receipt and verified rollback',async()=>{
 const f=fixture(),r=await probe({pool:f.pool,syntheticOnly:true,input});
 assert.equal(r.production_qualified,false);
 assert.deepEqual(f.events,['connect','BEGIN','SET TRANSACTION READ ONLY','function','ROLLBACK','release:true']);
});
test('missing receipt, wrong actor, tenant, key, role or rollback fail closed',async()=>{
 for(const options of [{rows:[]},{rows:[{workspace_id:input.workspace,actor_user_id:'other',idempotency_key:input.keys[0]}]},
  {rows:[{workspace_id:'synthetic_group_b',actor_user_id:'synthetic_operator',idempotency_key:input.keys[0]}]},
  {rows:[{workspace_id:input.workspace,actor_user_id:'synthetic_operator',idempotency_key:'other'}]},
  {role:'other'},{rollback:'OTHER'}]){
  const f=fixture(options);await assert.rejects(probe({pool:f.pool,syntheticOnly:true,input}));
  assert.equal(f.events.at(-1),'release:true');
 }
});
test('default off does not connect',async()=>{
 const f=fixture();await assert.rejects(probe({pool:f.pool,input}),/DISABLED/);assert.deepEqual(f.events,[]);
});
