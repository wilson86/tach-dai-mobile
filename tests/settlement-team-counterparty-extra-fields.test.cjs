'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createSyncClient}=require('../app/settlement-team-sync-client.js');
const {createServerLedgerApi}=require('../team-settlement/server-ledger-api.cjs');
const {createPostgresLedgerRepository}=require('../team-settlement/postgres-ledger-repository.cjs');
const actor={server_verified:true,membership_active:true,user_id:'user_a',workspace_id:'group_a',role:'operator'};
const clean={workspace_id:'group_a',partner_id:'fake_partner_1',partner_kind:'customer',display_name:'Synthetic'};
function make(row){
 const client=createSyncClient({fetchImpl:async()=>({ok:true,status:200,json:async()=>[row]})});
 client.setSessionToken('a'.repeat(43),'group_a');
 const api=createServerLedgerApi({auth:{verifySession:async()=>actor},repository:{appendDraft:async()=>{},getScope:async()=>{},listCounterparties:async()=>[row]}});
 const db={transaction:async fn=>fn({query:async sql=>{
  if(sql.includes('set_config'))return {rows:[]};
  if(sql.includes('FROM kts_team.memberships'))return {rows:[{team_role:'operator'}]};
  if(sql.includes('FROM kts_team.counterparties'))return {rows:[row]};
  throw Error('UNEXPECTED_SQL');
 }})};
 return {client,api,repository:createPostgresLedgerRepository({db})};
}
test('unknown directory fields never reach client or API callers',async()=>{
 const bad=make({...clean,internal_synthetic_secret:'DO_NOT_RETURN'});
 assert.equal((await bad.client.listCounterparties()).status,'BLOCKED');
 await assert.rejects(bad.api.listCounterparties('a'.repeat(43)),/TEAM_COUNTERPARTY_RESPONSE_UNVERIFIED/);
 await assert.rejects(bad.repository.listCounterparties(actor),/TEAM_COUNTERPARTY_RESPONSE_UNVERIFIED/);
 const good=make(clean);
 assert.equal((await good.client.listCounterparties()).status,'SYNCED');
 assert.deepEqual(await good.api.listCounterparties('a'.repeat(43)),[clean]);
 assert.deepEqual(await good.repository.listCounterparties(actor),[clean]);
});
