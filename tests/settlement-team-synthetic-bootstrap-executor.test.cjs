'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {hashPassword}=require('../team-settlement/auth-contract.cjs');
const {createSyntheticBootstrapExecutor}=require('../team-settlement/synthetic-bootstrap-executor.cjs');
function plan(){
 const identities=Array.from({length:10},(_,n)=>({user_id:`fake_user_${n+1}`,auth_subject:`fake_login_${n+1}`,
  password_hash:hashPassword(`synthetic-private-password-${n+1}`,Buffer.alloc(16,n+2))}));
 return {workspaces:[{workspace_id:'fake_group_a',display_name:'Synthetic Group'}],identities,
  memberships:identities.map((x,n)=>({workspace_id:'fake_group_a',user_id:x.user_id,role:n===0?'admin':'operator'})),
  counterparties:[{workspace_id:'fake_group_a',partner_id:'fake_customer_1',partner_kind:'customer',display_name:'Synthetic Customer'},
   {workspace_id:'fake_group_a',partner_id:'fake_owner_1',partner_kind:'owner',display_name:'Synthetic Owner'}]};
}
function fixture({badReceipt=false}={}){
 const calls=[];const db={transaction:async work=>work({query:async(sql,args)=>{
  calls.push({sql,args});
  if(sql.includes('kts_team.workspaces'))return {rows:[{workspace_id:args[0]}]};
  if(sql.includes('kts_team.identities'))return {rows:[{user_id:args[0]}]};
  if(sql.includes('kts_auth.credentials'))return {rows:[{user_id:args[0]}]};
  if(sql.includes('kts_team.memberships'))return {rows:[{workspace_id:args[0],user_id:args[1],team_role:args[2]}]};
  if(sql.includes('kts_team.counterparties'))return {rows:badReceipt?[]:[{workspace_id:args[0],partner_id:args[1],partner_kind:args[2]}]};
  throw Error('UNEXPECTED_BOOTSTRAP_QUERY');
 }})};return {db,calls};
}
test('transactional bootstrap inserts a complete synthetic topology and returns only redacted counts',async()=>{
 const f=fixture();const result=await createSyntheticBootstrapExecutor({db:f.db}).apply(plan());
 assert.deepEqual(result,{synthetic_only:true,identity_count:10,workspace_count:1,membership_count:10,counterparty_count:2,workspace_ids:['fake_group_a']});
 assert.equal(f.calls.length,33);
 assert.equal(JSON.stringify(result).includes('password_hash'),false);
 assert.equal(JSON.stringify(result).includes('fake_login_'),false);
 assert.ok(f.calls.some(x=>x.sql.includes('kts_auth.credentials')));
});
test('bootstrap rejects an incomplete SQL receipt rather than reporting a provisioned group',async()=>{
 const f=fixture({badReceipt:true});
 await assert.rejects(createSyntheticBootstrapExecutor({db:f.db}).apply(plan()),/TEAM_BOOTSTRAP_COUNTERPARTY_RECEIPT_INVALID/);
});
