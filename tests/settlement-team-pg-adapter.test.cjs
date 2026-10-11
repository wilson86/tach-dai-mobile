'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createPgTransactionAdapter}=require('../team-settlement/pg-transaction-adapter.cjs');
const {createPostgresLedgerRepository}=require('../team-settlement/postgres-ledger-repository.cjs');
function fakePool({failBegin=false,failCommit=false,failRollback=false}={}){
  const calls=[], releases=[], opened=[];
  const client={
    query:async(sql,args)=>{
      calls.push({sql,args});
      if(sql==='BEGIN'&&failBegin)throw new Error('begin rejected');
      if(sql==='COMMIT'&&failCommit)throw new Error('commit rejected');
      if(sql==='ROLLBACK'&&failRollback)throw new Error('rollback rejected');
      if(sql.includes('FROM kts_team.memberships'))return {rows:[{team_role:'viewer'}]};
      if(sql.includes('FROM kts_team.scope_events'))return {rows:[
        {feed_seq:'1',event_id:'e1',recorded_at:'2026-10-12T10:00:00Z'}]};
      return {rows:[]};
    },
    release:flag=>releases.push(flag)
  };
  return {pool:{connect:async()=>{opened.push(1);return client;}},calls,releases,opened};
}
test('single pooled SQL transaction commits and releases without leaked tenant session state',async()=>{
  const q=fakePool();const adapter=createPgTransactionAdapter({pool:q.pool});
  let leaked;
  const result=await adapter.transaction(async tx=>{
    leaked=tx;
    await tx.query('SELECT 1');
    return 'OK';
  });
  assert.equal(result,'OK');
  assert.deepEqual(q.calls.map(x=>x.sql),['BEGIN','SELECT 1','COMMIT']);
  assert.deepEqual(q.releases,[false]);
  assert.throws(()=>leaked.query('SELECT 1'),/TEAM_DB_TRANSACTION_CLOSED/);
});
test('application/SQL failure rolls back exactly once and preserves original error',async()=>{
  const q=fakePool();const adapter=createPgTransactionAdapter({pool:q.pool});
  await assert.rejects(adapter.transaction(async tx=>{
    await tx.query('SELECT 1');
    throw new Error('APP_DENIED');
  }),/APP_DENIED/);
  assert.deepEqual(q.calls.map(x=>x.sql),['BEGIN','SELECT 1','ROLLBACK']);
  assert.deepEqual(q.releases,[false]);
});
test('failed begin or ambiguous commit destroys the client instead of silently pooling it',async()=>{
  for(const cfg of [{failBegin:true},{failCommit:true},{failRollback:true}]){
    const q=fakePool(cfg);const adapter=createPgTransactionAdapter({pool:q.pool});
    const operation=cfg.failRollback
      ? async()=>{throw new Error('APP_DENIED');}
      : async tx=>{await tx.query('SELECT 1');return 1;};
    await assert.rejects(adapter.transaction(operation));
    assert.deepEqual(q.releases,[true]);
    assert.equal(q.calls[0].sql,'BEGIN');
  }
});
test('PostgreSQL repository uses the same transaction for tenant, DB role validation and paged query',async()=>{
  const q=fakePool();
  const adapter=createPgTransactionAdapter({pool:q.pool});
  const repo=createPostgresLedgerRepository({db:adapter});
  const actor={server_verified:true,membership_active:true,user_id:'viewer_1',role:'viewer',workspace_id:'group_a'};
  const events=await repo.getChanges(actor,{limit:3});
  assert.equal(events.items.length,1);
  assert.equal(events.items[0].event_id,'e1');
  assert.equal(events.has_more,false);
  assert.equal(events.next_cursor.length>0,true);
  const queries=q.calls.map(x=>x.sql);
  assert.equal(queries[0],'BEGIN');
  assert.equal(queries[1].includes('set_config'),true);
  assert.equal(queries[2].includes('FROM kts_team.memberships'),true);
  assert.equal(queries[3].includes('FROM kts_team.scope_events'),true);
  assert.equal(queries[4],'COMMIT');
  assert.deepEqual(q.releases,[false]);
});

test('malformed pooled client is destroyed instead of leaking an acquired slot',async()=>{
  const releases=[];
  const malformed={release:destroy=>releases.push(destroy)};
  const adapter=createPgTransactionAdapter({pool:{connect:async()=>malformed}});
  await assert.rejects(adapter.transaction(async()=>{throw Error('SHOULD_NOT_RUN');}),
    /TEAM_PG_CLIENT_INVALID/);
  assert.deepEqual(releases,[true]);
});

test('malformed client with throwing release still fails closed without hiding cause',async()=>{
  const malformed={release:()=>{throw Error('RELEASE_FAILED');}};
  const adapter=createPgTransactionAdapter({pool:{connect:async()=>malformed}});
  await assert.rejects(adapter.transaction(async()=>0),/TEAM_PG_CLIENT_INVALID/);
});

test('unawaited SQL query blocks COMMIT and destroys pooled connection',async()=>{
  let finish;
  const statements=[],released=[];
  const client={
    query(sql){
      statements.push(sql);
      if(sql==='SELECT pending')return new Promise(resolve=>{finish=resolve;});
      return Promise.resolve({rows:[]});
    },
    release:destroy=>released.push(destroy)
  };
  const adapter=createPgTransactionAdapter({pool:{connect:async()=>client}});
  await assert.rejects(adapter.transaction(async tx=>{
    void tx.query('SELECT pending');
    return 'MUST_NOT_COMMIT';
  }),/TEAM_DB_UNAWAITED_QUERY/);
  assert.deepEqual(statements,['BEGIN','SELECT pending','ROLLBACK']);
  assert.deepEqual(released,[true]);
  finish({rows:[]});
});
