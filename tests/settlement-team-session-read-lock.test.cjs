'use strict';
// Actual auth/API JS with synthetic transaction and repository dependencies.
// No socket or PostgreSQL; validates transaction ordering only.
const {test}=require('node:test');const assert=require('node:assert/strict');
const {createPostgresAuthService}=require('../team-settlement/postgres-auth-service.cjs');
const {createServerLedgerApi}=require('../team-settlement/server-ledger-api.cjs');
const scope={workspace_id:'fake_group',partner_id:'fake_partner',business_date:'2026-10-26',region:'mn'};
for(const action of ['scope','changes','counterparties'])test(`${action} retains session transaction throughout read`,async()=>{
  let authOpen=false,called=false;
  const db={transaction:async work=>{authOpen=true;try{return await work({query:async sql=>{
    if(sql.includes('FROM kts_auth.sessions')){assert.match(sql,/FOR SHARE/);return {rows:[{user_id:'fake_reviewer',workspace_id:'fake_group'}]};}
    if(sql.includes('FROM kts_team.memberships'))return {rows:[{team_role:'reviewer'}]};
    if(sql.includes('set_config'))return {rows:[]};throw Error('UNEXPECTED_AUTH_QUERY');
  }});}finally{authOpen=false;}}};
  const auth=createPostgresAuthService({db,clock:()=>1000});
  const check=()=>{assert.equal(authOpen,true,'auth transaction closed before read');called=true;};
  const repository={appendDraft:async()=>{},getScope:async()=>{check();return {...scope};},
    getChanges:async()=>{check();return {events:[]};},listCounterparties:async()=>{check();return [];}};
  const api=createServerLedgerApi({auth,repository,requireSessionLockForWrites:true});const token='R'.repeat(43);
  if(action==='scope')await api.getScope(token,scope);
  if(action==='changes')await api.getChanges(token,{});
  if(action==='counterparties')await api.listCounterparties(token,{});
  assert.equal(called,true);assert.equal(authOpen,false);
});

test('synthetic read/logout lock model serializes revocation and denies later reads',async()=>{
  let held=false,revoked=false,unlock,readReady,finishRead,revokeReady;
  const unlocked=new Promise(r=>{unlock=r;}),readStarted=new Promise(r=>{readReady=r;});
  const readMayFinish=new Promise(r=>{finishRead=r;}),revokeStarted=new Promise(r=>{revokeReady=r;});
  const db={transaction:async work=>{let owns=false;try{return await work({query:async sql=>{
    if(sql.includes('FROM kts_auth.sessions')){assert.match(sql,/FOR SHARE/);if(revoked)return {rows:[]};held=true;owns=true;return {rows:[{user_id:'fake_reviewer',workspace_id:'fake_group'}]};}
    if(sql.includes('FROM kts_team.memberships'))return {rows:[{team_role:'reviewer'}]};
    if(sql.includes('UPDATE kts_auth.sessions')){revokeReady();if(held)await unlocked;revoked=true;return {rowCount:1};}
    if(sql.includes('set_config'))return {rows:[]};throw Error('UNEXPECTED_AUTH_QUERY');
  }});}finally{if(owns){held=false;unlock();}}}};
  const auth=createPostgresAuthService({db,clock:()=>1000});
  const repository={appendDraft:async()=>{},getScope:async()=>{readReady();await readMayFinish;assert.equal(revoked,false);return {...scope};}};
  const api=createServerLedgerApi({auth,repository,requireSessionLockForWrites:true}),token='L'.repeat(43);
  const read=api.getScope(token,scope);await readStarted;
  const logout=auth.revokeSession(token);await revokeStarted;assert.equal(held,true);assert.equal(revoked,false);
  finishRead();assert.deepEqual(await read,scope);assert.equal(await logout,true);
  await assert.rejects(api.getScope(token,scope),/AUTH_SESSION_INVALID/);
});
