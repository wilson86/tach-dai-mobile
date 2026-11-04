'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {run}=require('./fixtures/session-bound-receipt-proof-paired.cjs');
const input={bearer:'synthetic_'+ 'a'.repeat(40),workspace:'synthetic_group_a',nonce:'c'.repeat(32),
 expires:1793789000,keys:['draft_'+ '1'.repeat(32)]};
function fixture({invalidBaseline=false,allowNegative=false}={}){
 let calls=0;const events=[];
 const pool={async connect(){events.push('connect');return {
  async query(sql){
   if(sql==='BEGIN'||sql==='SET TRANSACTION READ ONLY'||sql==='ROLLBACK'){events.push(sql);return {command:sql,rows:[]};}
   if(sql.includes('current_user::text'))return {rows:[{role:'synthetic_receipt_ledger',session_role:'synthetic_receipt_ledger'}]};
   if(sql.includes('candidate_receipt_read_v1')){
    calls++;events.push('function:'+calls);
    if(calls%2===1)return {rows:invalidBaseline?[]:[{workspace_id:input.workspace,actor_user_id:'synthetic_operator',idempotency_key:input.keys[0]}]};
    if(allowNegative)return {rows:[]};
    throw Object.assign(Error('TEAM_RECEIPT_READ_PROOF_INVALID'),{code:'P0001'});
   }
   throw Error('UNEXPECTED_QUERY');
  },release(x){events.push('release:'+x)}
 };}};
 return {pool,events,get calls(){return calls}};
}
test('valid control precedes forged and expired cases on actual fixture call chain',async()=>{
 const f=fixture(),result=await run({pool:f.pool,syntheticOnly:true,input});
 assert.deepEqual(result.cases,['forged','expired']);assert.equal(result.production_qualified,false);
 assert.equal(f.calls,4);assert.equal(f.events.filter(x=>x==='ROLLBACK').length,4);
 assert.equal(f.events.filter(x=>x==='release:true').length,4);
});
test('invalid control stops before negative; accepted negative stops later cases',async()=>{
 const noBaseline=fixture({invalidBaseline:true});
 await assert.rejects(run({pool:noBaseline.pool,syntheticOnly:true,input}),/SYNTHETIC_POSITIVE_RECEIPT_INVALID/);
 assert.equal(noBaseline.calls,1);
 const accepted=fixture({allowNegative:true});
 await assert.rejects(run({pool:accepted.pool,syntheticOnly:true,input}),/SYNTHETIC_PROOF_DENIAL_NOT_ENFORCED/);
 assert.equal(accepted.calls,2);
});
