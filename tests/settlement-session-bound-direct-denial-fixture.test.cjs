'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {probe}=require('./fixtures/session-bound-receipt-direct-denial.cjs');
function fixture({role='synthetic_receipt_ledger',selectCode='42501',rollback='ROLLBACK',guc='synthetic_group_b'}={}){
 const events=[];
 return {events,pool:{async connect(){events.push('connect');return {
  async query(sql){
   if(sql==='BEGIN'||sql==='SET TRANSACTION READ ONLY'){events.push(sql);return {command:sql,rows:[]};}
   if(sql==='ROLLBACK'){events.push(sql);return {command:rollback,rows:[]};}
   if(sql.includes('current_user::text'))return {rows:[{role,session_role:role}]};
   if(sql.includes('set_config')){events.push('guc');return {rows:[{workspace:guc}]};}
   if(sql.startsWith('SELECT count(*)')){events.push('direct-select');if(selectCode)throw Object.assign(Error('synthetic'),{code:selectCode});return {rows:[{count:'1'}]};}
   throw Error('UNEXPECTED_QUERY');
  },release(destroy){events.push('release:'+destroy)}
 };}}};
}
test('modeled denied direct SELECT requires 42501 after GUC switch and rollback',async()=>{
 const f=fixture();const r=await probe({pool:f.pool,syntheticOnly:true});
 assert.equal(r.sqlstate,'42501');assert.equal(r.production_qualified,false);
 assert.deepEqual(f.events,['connect','BEGIN','SET TRANSACTION READ ONLY','guc','direct-select','ROLLBACK','release:true']);
});
test('allowed SELECT, wrong role, other SQLSTATE and unverified rollback fail closed',async()=>{
 for(const options of [{selectCode:null},{role:'other_role'},{selectCode:'42P01'},{rollback:'OTHER'},{guc:'synthetic_group_a'}]){
  const f=fixture(options);await assert.rejects(probe({pool:f.pool,syntheticOnly:true}));
  assert.equal(f.events.at(-1),'release:true');
 }
});
test('default off does not connect',async()=>{
 const f=fixture();await assert.rejects(probe({pool:f.pool}),/DISABLED/);assert.deepEqual(f.events,[]);
});
