'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPostgresLedgerRepository, encodeCursor, decodeCursor } =
  require('../team-settlement/postgres-ledger-repository.cjs');

const ACTOR={ server_verified:true, membership_active:true,
  workspace_id:'group_a', user_id:'reviewer_1', role:'viewer' };
const events=[
  { event_id:'e1', recorded_at:'2026-10-12T01:00:00.000Z' },
  { event_id:'e2', recorded_at:'2026-10-12T01:00:01.000Z' },
  { event_id:'e3', recorded_at:'2026-10-12T01:00:02.000Z' }
];

function fakeDb(){
  const requests=[];
  const db={transaction: async work=>work({
    query:async(sql,args=[])=>{
      requests.push({sql,args});
      if(sql.includes("set_config('kts.workspace_id'"))return {rows:[]};
      if(!sql.includes('FROM kts_team.scope_events'))throw new Error('UNEXPECTED_QUERY');
      if(args[0]!=='group_a')throw new Error('CROSS_TENANT_QUERY');
      const after={ recorded_at:new Date(args[1]).toISOString(),event_id:args[2] };
      const rows=events.filter(row=>row.recorded_at>after.recorded_at||
        (row.recorded_at===after.recorded_at&&row.event_id>after.event_id))
        .slice(0,args[3]);
      return {rows};
    }
  })};
  return {db,requests};
}
test('change feed advances on final page and never endlessly repeats a terminal event',async()=>{
  const x=fakeDb();const repository=createPostgresLedgerRepository({db:x.db});
  const first=await repository.getChanges(ACTOR,{limit:2});
  assert.deepEqual(first.items.map(x=>x.event_id),['e1','e2']);
  assert.equal(first.has_more,true);
  assert.deepEqual(decodeCursor(first.next_cursor),{recorded_at:events[1].recorded_at,event_id:'e2'});
  const second=await repository.getChanges(ACTOR,{limit:2,cursor:first.next_cursor});
  assert.deepEqual(second.items.map(x=>x.event_id),['e3']);
  assert.equal(second.has_more,false);
  assert.deepEqual(decodeCursor(second.next_cursor),{recorded_at:events[2].recorded_at,event_id:'e3'});
  const empty=await repository.getChanges(ACTOR,{limit:2,cursor:second.next_cursor});
  assert.deepEqual(empty.items,[]);
  assert.equal(empty.has_more,false);
  assert.equal(empty.next_cursor,null);
  assert.equal(x.requests.filter(x=>x.sql.includes('FROM kts_team.scope_events')).length,3);
});

test('feed rejects malformed cursors and oversized limits without querying ledger',async()=>{
  const x=fakeDb();const repository=createPostgresLedgerRepository({db:x.db});
  await assert.rejects(repository.getChanges(ACTOR,{limit:501}),/TEAM_LIMIT_INVALID/);
  await assert.rejects(repository.getChanges(ACTOR,{cursor:'not-base64-json',limit:2}),/TEAM_CURSOR_INVALID/);
  assert.equal(x.requests.length,0);
  assert.equal(encodeCursor('2026-10-12T01:00:00.000Z','event_1').length>20,true);
});
