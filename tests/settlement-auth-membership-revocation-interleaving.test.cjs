'use strict';
// Synthetic ordering probe only. No PostgreSQL locking or production security
// conclusion can be inferred from this injected transaction implementation.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createPostgresAuthService}=require('../team-settlement/postgres-auth-service.cjs');

test('legacy Auth callback can complete after membership changes in a separate transaction',async()=>{
 let revoked=false, membershipSql='';
 const db={transaction:async work=>work({query:async sql=>{
  if(sql.includes('FROM kts_auth.sessions'))
   return {rows:[{user_id:'synthetic_operator',workspace_id:'synthetic_group'}]};
  if(sql.includes('set_config('))return {rows:[{}]};
  if(sql.includes('FROM kts_team.memberships')){
   membershipSql=sql;
   return {rows:revoked?[]:[{team_role:'operator'}]};
  }
  throw Error('UNEXPECTED_SQL');
 }})};
 const auth=createPostgresAuthService({db,clock:()=>1000});
 const result=await auth.withVerifiedSession('x'.repeat(43),async actor=>{
  assert.equal(actor.role,'operator');
  // Simulates the membership change committing after the SELECT and before
  // a separately authorized operation finishes. No real DB work is performed.
  revoked=true;
  return 'CALLBACK_COMPLETED';
 },'synthetic_group');
 assert.equal(revoked,true);
 assert.equal(result,'CALLBACK_COMPLETED');
 assert.doesNotMatch(membershipSql,/FOR\s+(?:UPDATE|SHARE|KEY\s+SHARE|NO\s+KEY\s+UPDATE)/i);
});
