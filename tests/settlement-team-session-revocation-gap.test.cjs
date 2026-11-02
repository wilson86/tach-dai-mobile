'use strict';
// Executes actual server/auth/ledger JS with isolated transaction fixtures.
// It checks JS transaction ordering; it is not evidence of PostgreSQL locks.
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createPostgresAuthService}=require('../team-settlement/postgres-auth-service.cjs');
const {createPostgresLedgerRepository}=require('../team-settlement/postgres-ledger-repository.cjs');
const {createServerLedgerApi}=require('../team-settlement/server-ledger-api.cjs');
test('durable session transaction remains open through the ledger write',async()=>{
  const token='T'.repeat(43),tokenHash=crypto.createHash('sha256').update(token).digest('hex');let revoked=false,authOpen=false,sessionRead=false,ledgerStarted=false;
  const authDb={transaction:async work=>{authOpen=true;try{return await work({query:async(sql,values)=>{
    if(sql.includes('FROM kts_auth.sessions')){assert.equal(values[0],tokenHash);assert.match(sql,/FOR SHARE/);sessionRead=true;return {rows:[{user_id:'fake_operator',workspace_id:'fake_group'}]};}
    if(sql.includes('FROM kts_team.memberships'))return {rows:[{team_role:'operator'}]};return {rows:[]};
  }});}finally{authOpen=false;revoked=true;}}};
  const ledgerDb={transaction:async work=>{assert.equal(authOpen,true);assert.equal(revoked,false);ledgerStarted=true;return work({query:async sql=>{
    if(sql.includes('FROM kts_team.memberships'))return {rows:[{team_role:'operator'}]};
    if(sql.includes('kts_team.append_draft'))return {rows:[{result:{event_id:'event_fixture',replayed:false,new_revision:1,feed_seq:1}}]};
    return {rows:[]};
  }});}};
  const auth=createPostgresAuthService({db:authDb,clock:()=>1000});const repository=createPostgresLedgerRepository({db:ledgerDb});
  const api=createServerLedgerApi({auth,repository,eventId:()=> 'event_fixture'});
  const result=await api.appendDraft(token,{scope:{workspace_id:'fake_group',partner_id:'fake_customer',business_date:'2026-10-26',region:'mn'},expected_revision:0,idempotency_key:'fixture_key',payload:{synthetic:true}});
  assert.equal(sessionRead,true);assert.equal(ledgerStarted,true);assert.equal(result.sync_status,'SYNCED');assert.equal(authOpen,false);assert.equal(revoked,true);
});
