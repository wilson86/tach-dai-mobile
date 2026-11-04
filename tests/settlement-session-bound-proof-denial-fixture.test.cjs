'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {probe}=require('./fixtures/session-bound-receipt-proof-denial.cjs');
const input={bearer:'synthetic_'+ 'a'.repeat(40),workspace:'synthetic_group_a',nonce:'c'.repeat(32),
 expires:1793789000,keys:['draft_'+ '1'.repeat(32)]};
function fixture({message='TEAM_RECEIPT_READ_PROOF_INVALID',code='P0001',allow=false,rollback='ROLLBACK',role='synthetic_receipt_ledger'}={}){
 const events=[];return {events,pool:{async connect(){events.push('connect');return {
  async query(sql,values){
   if(sql==='BEGIN'||sql==='SET TRANSACTION READ ONLY'){events.push(sql);return {command:sql,rows:[]};}
   if(sql==='ROLLBACK'){events.push(sql);return {command:rollback,rows:[]};}
   if(sql.includes('current_user::text'))return {rows:[{role,session_role:role}]};
   if(sql.includes('candidate_receipt_read_v1')){events.push('function');assert.equal(values.length,6);
    if(allow)return {rows:[]};throw Object.assign(Error(message),{code});}
   throw Error('UNEXPECTED_QUERY');
  },release(x){events.push('release:'+x)}
 };}}};
}
test('forged and expired proofs require exact function error and rollback',async()=>{
 for(const mode of ['forged','expired']){
  const f=fixture(),r=await probe({pool:f.pool,syntheticOnly:true,mode,input});
  assert.equal(r.production_qualified,false);assert.equal(r.case,mode);
  assert.deepEqual(f.events,['connect','BEGIN','SET TRANSACTION READ ONLY','function','ROLLBACK','release:true']);
 }
});
test('revoked session and membership use distinct denial reasons',async()=>{
 for(const [mode,message] of [['revoked','TEAM_RECEIPT_READ_SESSION_INVALID'],['membership_revoked','TEAM_RECEIPT_READ_MEMBERSHIP_DENIED']]){
  const f=fixture({message});assert.equal((await probe({pool:f.pool,syntheticOnly:true,mode,input})).case,mode);
 }
});
test('wrong error, wrong role, unexpected success and missing rollback fail closed',async()=>{
 for(const options of [{code:'42501'},{message:'OTHER'},{allow:true},{role:'other'},{rollback:'OTHER'}]){
  const f=fixture(options);await assert.rejects(probe({pool:f.pool,syntheticOnly:true,mode:'forged',input}));
  assert.equal(f.events.at(-1),'release:true');
 }
});
test('default-off probe never connects',async()=>{
 const f=fixture();await assert.rejects(probe({pool:f.pool,mode:'forged',input}),/DISABLED/);assert.deepEqual(f.events,[]);
});
