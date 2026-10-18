'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createPostgresLedgerRepository}=require('../team-settlement/postgres-ledger-repository.cjs');
const {createServerLedgerApi}=require('../team-settlement/server-ledger-api.cjs');
const {createAuthHttpServer}=require('../team-settlement/auth-http-contract.cjs');

const ACTOR=Object.freeze({server_verified:true,membership_active:true,
  user_id:'admin_a',workspace_id:'group_a',role:'admin'});

function repositoryFixture(rows){
  const calls=[];
  const db={transaction:async work=>{
    let workspace=null;
    return work({query:async(sql,args=[])=>{
      calls.push({sql,args});
      if(sql.includes("set_config('kts.workspace_id'")){
        workspace=args[0];return {rows:[]};
      }
      if(sql.includes('FROM kts_team.memberships m')){
        assert.equal(workspace,'group_a');
        assert.deepEqual(args,['group_a','admin_a']);
        return {rows:[{team_role:'admin'}]};
      }
      if(sql.includes('FROM kts_team.counterparties')){
        assert.equal(workspace,'group_a');
        assert.deepEqual(args,['group_a',null,100]);
        return {rows};
      }
      throw Error('UNEXPECTED_QUERY');
    }});
  }};
  return {repository:createPostgresLedgerRepository({db}),calls};
}

test('counterparty directory is an active tenant-scoped metadata read',async()=>{
  const fixture=repositoryFixture([
    {workspace_id:'group_a',partner_id:'customer_1',partner_kind:'customer',display_name:'Synthetic Customer 1'},
    {workspace_id:'group_a',partner_id:'owner_1',partner_kind:'owner',display_name:'Synthetic Owner 1'}
  ]);
  const result=await fixture.repository.listCounterparties(ACTOR);
  assert.deepEqual(result,[
    {workspace_id:'group_a',partner_id:'customer_1',partner_kind:'customer',display_name:'Synthetic Customer 1'},
    {workspace_id:'group_a',partner_id:'owner_1',partner_kind:'owner',display_name:'Synthetic Owner 1'}
  ]);
  assert.equal(fixture.calls.length,3);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result[0]));
});

test('counterparty directory rejects invalid filters and a cross-workspace database row',async()=>{
  const clean=repositoryFixture([]);
  await assert.rejects(clean.repository.listCounterparties(ACTOR,{kind:'other'}),/TEAM_COUNTERPARTY_KIND_INVALID/);
  await assert.rejects(clean.repository.listCounterparties(ACTOR,{limit:201}),/TEAM_LIMIT_INVALID/);
  assert.equal(clean.calls.length,0);
  const forged=repositoryFixture([{workspace_id:'group_b',partner_id:'customer_1',partner_kind:'customer',display_name:'Foreign'}]);
  await assert.rejects(forged.repository.listCounterparties(ACTOR),/TEAM_COUNTERPARTY_RESPONSE_UNVERIFIED/);
});

function httpCall(server,path,token='t'.repeat(43)){
  return new Promise((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port:server.address().port,path,
      headers:{authorization:'Bearer '+token}},res=>{
      let body='';res.on('data',x=>body+=x);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(body)}));
    });
    req.on('error',reject);req.end();
  });
}

test('HTTP directory derives workspace from bearer and rejects query spoofing before delegation',async()=>{
  let delegated=0;
  const auth={async login(){throw Error('UNUSED');},async verifySession(token){
    if(token!=='t'.repeat(43))throw Error('AUTH_SESSION_INVALID');return ACTOR;
  },async revokeSession(){return false;},async manageMembership(){},setIdentityDisabled(){}};
  const repository={async appendDraft(){throw Error('UNUSED');},async getScope(){throw Error('UNUSED');},
    async listCounterparties(actor,options){
      delegated++;assert.equal(actor.workspace_id,'group_a');assert.deepEqual(options,{kind:'owner',limit:2});
      return [{workspace_id:'group_a',partner_id:'owner_1',partner_kind:'owner',display_name:'Synthetic Owner 1'}];
    }};
  const server=createAuthHttpServer(auth,{ledger:createServerLedgerApi({auth,repository})});
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  try{
    for(const path of ['/v1/counterparties?workspace_id=group_b','/v1/counterparties?kind=other',
      '/v1/counterparties?limit=201','/v1/counterparties?kind=owner&kind=customer']){
      assert.equal((await httpCall(server,path)).status,422,path);
    }
    assert.equal(delegated,0);
    const response=await httpCall(server,'/v1/counterparties?kind=owner&limit=2');
    assert.equal(response.status,200);
    assert.equal(response.body[0].workspace_id,'group_a');
    assert.equal(delegated,1);
  }finally{await new Promise(ok=>server.close(ok));}
});

test('server directory refuses a forged repository result before HTTP exposure',async()=>{
  const auth={async verifySession(){return ACTOR;}};
  const ledger=createServerLedgerApi({auth,repository:{async appendDraft(){},async getScope(){},
    async listCounterparties(){return [{workspace_id:'group_b',partner_id:'x',partner_kind:'customer',display_name:'Foreign'}];}}});
  await assert.rejects(ledger.listCounterparties('t'.repeat(43)),/TEAM_COUNTERPARTY_RESPONSE_UNVERIFIED/);
});
