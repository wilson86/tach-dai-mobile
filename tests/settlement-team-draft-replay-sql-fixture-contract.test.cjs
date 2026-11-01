'use strict';
// Contract of a FUTURE disposable PostgreSQL regression. This only scans
// test SQL and does NOT run a database or establish tenant/actor security.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const sql=fs.readFileSync('team-settlement/tests/postgres-draft-replay-actor-regression.sql','utf8');

test('the SQL test cannot run without a uniquely marked synthetic database',()=>{
  assert.match(sql,/current_database\(\) !~ '\^kts_fixture_\[a-z0-9_\]\+\$'/);
  assert.match(sql,/current_setting\('kts\.synthetic_fixture',true\) IS DISTINCT FROM 'enabled'/);
  assert.match(sql,/TEAM_SYNTHETIC_DATABASE_REQUIRED/);
  assert.match(sql,/BEGIN;[\s\S]*ROLLBACK;/);
});

test('same-actor replay is permitted, five mismatches fail closed',()=>{
  assert.match(sql,/TEAM_SAME_ACTOR_REPLAY_BROKEN/);
  const expected=[
    ['partner','TEAM_IDEMPOTENCY_CONTEXT_MISMATCH'],
    ['date','TEAM_IDEMPOTENCY_CONTEXT_MISMATCH'],
    ['region','TEAM_IDEMPOTENCY_CONTEXT_MISMATCH'],
    ['revision_and_kind','TEAM_IDEMPOTENCY_CONTEXT_MISMATCH'],
    ['request_hash','TEAM_IDEMPOTENCY_CONFLICT']
  ];
  const start=sql.indexOf('FOR candidate IN');
  const stop=sql.indexOf('END LOOP;',start);
  assert.ok(start>=0&&stop>start,'NEGATIVE_MATRIX_MISSING');
  const part=sql.slice(start,stop);
  assert.match(part,/PERFORM kts_team\.append_draft/);
  assert.match(part,/IF SQLERRM=candidate\.error_code/);
  assert.match(part,/TEAM_REPLAY_NEGATIVE_ACCEPTED_%/);
  for(const [key,error] of expected){
    assert.match(part,new RegExp("\\('"+key+"',[^\\n]*'"+error+"'\\)"));
  }
});

test('cross-actor replay is denied and event/receipt counts stay unchanged',()=>{
  assert.match(sql,/set_config\('kts\.actor_user_id','fixture_replay_operator_b',true\)/);
  assert.match(sql,/TEAM_CROSS_ACTOR_REPLAY_ACCEPTED/);
  assert.match(sql,/TEAM_REPLAY_CHANGED_EVENT_OR_RECEIPT_COUNT/);
  assert.match(sql,/event_id IN \('fixture_replay_event_a','fixture_replay_event_b'\)/);
  assert.match(sql,/idempotency_key='fixture_replay_key'/);
});
