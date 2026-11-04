'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {observeSyntheticTenantGucExposure:observe}=require('../team-settlement/tenant-guc-observation.cjs');
function fixture({role='synthetic_recovery_ledger',leak=true,fail=false}={}){
 const calls=[];let scoped=null,released=false;
 const pool={async connect(){calls.push('connect');return {
  async query(sql,args){
   if(sql==='BEGIN'||sql==='SET TRANSACTION READ ONLY'||sql==='ROLLBACK'){
     calls.push(sql);return {command:sql,rows:[]};
   }
   if(sql.includes('current_user::text'))return {rows:[{role,session_role:role}]};
   if(sql.includes("set_config('kts.workspace_id'")){
     scoped=args[0];calls.push('SET_GUC:'+scoped);
     return {rows:[{effective_workspace:scoped}]};
   }
   if(sql.includes('FROM kts_team.idempotency_receipts')){
     calls.push('RECEIPT_SELECT');
     assert.deepEqual(args,['group_b','req_1']);
     if(fail)throw Error('SYNTHETIC_DB_FAIL');
     return {rows:[{count:scoped==='group_b'&&leak?1:0}]};
   }
   throw Error('UNEXPECTED_SYNTHETIC_QUERY');
  },release(destroy){released=destroy;calls.push('release:'+destroy)}
 }}};
 return {pool,calls,isReleased:()=>released};
}
test('real-login modeled GUC switch exposes a different synthetic tenant; release remains blocked',async()=>{
 const f=fixture(),r=await observe({pool:f.pool,syntheticOnly:true});
 assert.equal(r.status,'SYNTHETIC_CALLER_WRITABLE_GUC_EXPOSURE_OBSERVED');
 assert.equal(r.direct_role_can_switch_tenant,true);
 assert.equal(r.production_qualified,false);
 assert.equal(r.write_block,'ENABLED');
 assert.deepEqual(f.calls,[
 'connect','BEGIN','SET TRANSACTION READ ONLY','SET_GUC:group_a',
 'RECEIPT_SELECT','SET_GUC:group_b','RECEIPT_SELECT','ROLLBACK','release:true']);
 assert.equal(f.isReleased(),true);
});
test('role mismatch, absent foreign fixture and DB failure must fail closed and release connection',async()=>{
 for(const options of [{role:'qa_admin'},{leak:false},{fail:true}]){
   const f=fixture(options);
   await assert.rejects(observe({pool:f.pool,syntheticOnly:true}));
   assert.equal(f.isReleased(),true);
   assert.ok(f.calls.includes('ROLLBACK'));
 }
});
test('default-off: no pool/permission must not connect, and no production mutation is possible',async()=>{
 const f=fixture();
 await assert.rejects(observe({pool:f.pool}),/TEAM_GUC_PROBE_SYNTHETIC_ONLY/);
 assert.deepEqual(f.calls,[]);
});
