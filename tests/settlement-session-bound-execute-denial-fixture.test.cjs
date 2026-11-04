'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {probe}=require('./fixtures/session-bound-receipt-execute-denial.cjs');
const input={bearer:'synthetic_'+ 'a'.repeat(40),workspace:'synthetic_group_a',nonce:'c'.repeat(32),
 expires:1793789000,keys:['draft_'+ '1'.repeat(32)]};
function fixture({role='synthetic_receipt_unprivileged',code='42501',rollback='ROLLBACK',schema=true,present=true,execute=false}={}){
 const events=[];return {events,pool:{async connect(){events.push('connect');return {
  async query(sql){
   if(sql==='BEGIN'||sql==='SET TRANSACTION READ ONLY'){events.push(sql);return {command:sql,rows:[]};}
   if(sql==='ROLLBACK'){events.push(sql);return {command:rollback,rows:[]};}
   if(sql.includes('current_user::text'))return {rows:[{role,session_role:role}]};
   if(sql.includes('has_schema_privilege'))return {rows:[{schema_usage:schema,function_present:present,can_execute:execute}]};
   if(sql.includes('candidate_receipt_read_v1')){events.push('function');if(code)throw Object.assign(Error('synthetic'),{code});return {rows:[]};}
   throw Error('UNEXPECTED_QUERY');
  },release(x){events.push('release:'+x)}
 };}}};
}
test('modeled unprivileged execute denial requires 42501 and rollback',async()=>{
 const f=fixture(),r=await probe({pool:f.pool,syntheticOnly:true,input});
 assert.equal(r.production_qualified,false);assert.equal(r.sqlstate,'42501');
 assert.deepEqual(f.events,['connect','BEGIN','SET TRANSACTION READ ONLY','function','ROLLBACK','release:true']);
});
test('unexpected success, missing function, wrong role and missing rollback fail closed',async()=>{
 for(const options of [{code:null},{code:'42883'},{role:'other'},{rollback:'OTHER'},{schema:false},{present:false},{execute:true}]){
  const f=fixture(options);await assert.rejects(probe({pool:f.pool,syntheticOnly:true,input}));
  assert.equal(f.events.at(-1),'release:true');
 }
});
test('default off does not connect',async()=>{
 const f=fixture();await assert.rejects(probe({pool:f.pool,input}),/DISABLED/);assert.deepEqual(f.events,[]);
});
