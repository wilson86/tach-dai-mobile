'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createSyncClient}=require('../app/settlement-team-sync-client.js');
const {createServerLedgerApi}=require('../team-settlement/server-ledger-api.cjs');
const {createPostgresLedgerRepository}=require('../team-settlement/postgres-ledger-repository.cjs');
const actor={server_verified:true,membership_active:true,user_id:'user_a',workspace_id:'group_a',role:'operator'};
const row=kind=>({workspace_id:'group_a',partner_id:'fake_partner_1',partner_kind:kind,display_name:'Synthetic'});
test('requested customer filter rejects an owner returned by every directory boundary',async()=>{
 const client=createSyncClient({fetchImpl:async()=>({ok:true,status:200,json:async()=>[row('owner')]})});
 client.setSessionToken('a'.repeat(43),'group_a');
 assert.equal((await client.listCounterparties({kind:'customer'})).status,'BLOCKED');
 const auth={verifySession:async()=>actor};
 const api=createServerLedgerApi({auth,repository:{appendDraft:async()=>{},getScope:async()=>{},listCounterparties:async()=>[row('owner')]}});
 await assert.rejects(api.listCounterparties('a'.repeat(43),{kind:'customer'}),/TEAM_COUNTERPARTY_RESPONSE_UNVERIFIED/);
 const db={transaction:async fn=>fn({query:async sql=>{
  if(sql.includes('set_config'))return {rows:[]};
  if(sql.includes('FROM kts_team.memberships'))return {rows:[{team_role:'operator'}]};
  if(sql.includes('FROM kts_team.counterparties'))return {rows:[row('owner')]};
  throw Error('UNEXPECTED_SQL');
 }})};
 const repository=createPostgresLedgerRepository({db});
 await assert.rejects(repository.listCounterparties(actor,{kind:'customer'}),/TEAM_COUNTERPARTY_RESPONSE_UNVERIFIED/);
});
test('matching customer and owner filters are accepted at every boundary',async()=>{
 for(const kind of ['customer','owner']){
  const client=createSyncClient({fetchImpl:async()=>({ok:true,status:200,json:async()=>[row(kind)]})});
  client.setSessionToken('a'.repeat(43),'group_a');
  assert.equal((await client.listCounterparties({kind})).status,'SYNCED');
  const api=createServerLedgerApi({auth:{verifySession:async()=>actor},repository:{appendDraft:async()=>{},getScope:async()=>{},listCounterparties:async()=>[row(kind)]}});
  assert.equal((await api.listCounterparties('a'.repeat(43),{kind}))[0].partner_kind,kind);
  const db={transaction:async fn=>fn({query:async sql=>{
   if(sql.includes('set_config'))return {rows:[]};
   if(sql.includes('FROM kts_team.memberships'))return {rows:[{team_role:'operator'}]};
   if(sql.includes('FROM kts_team.counterparties'))return {rows:[row(kind)]};
   throw Error('UNEXPECTED_SQL');
  }})};
  assert.equal((await createPostgresLedgerRepository({db}).listCounterparties(actor,{kind}))[0].partner_kind,kind);
 }
});
