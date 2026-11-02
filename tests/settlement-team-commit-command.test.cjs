'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createPgTransactionAdapter}=require('../team-settlement/pg-transaction-adapter.cjs');

test('only a COMMIT command tag yields a successful transaction',async()=>{
  for(const command of ['COMMIT','ROLLBACK',undefined,'SELECT']){
    const calls=[],releases=[];
    const pool={connect:async()=>({
      async query(sql){calls.push(sql);return sql==='COMMIT'?{command}:{rows:[]};},
      release(destroy){releases.push(destroy);}
    })};
    const transaction=createPgTransactionAdapter({pool}).transaction(async()=> 'mutation-result');
    if(command==='COMMIT'){
      assert.equal(await transaction,'mutation-result');
      assert.deepEqual(calls,['BEGIN','COMMIT']);
      assert.deepEqual(releases,[false]);
    }else{
      await assert.rejects(transaction,/TEAM_DB_COMMIT_NOT_COMMITTED/);
      assert.deepEqual(calls,['BEGIN','COMMIT','ROLLBACK']);
      assert.deepEqual(releases,[true]);
    }
  }
});

test('release failure after acknowledged COMMIT reports unknown, not rollback',async()=>{
  const calls=[];
  const pool={connect:async()=>({
    async query(sql){calls.push(sql);return {command:sql,rows:[]};},
    release(){throw Error('SYNTHETIC_RELEASE_FAILURE');}
  })};
  await assert.rejects(createPgTransactionAdapter({pool}).transaction(async()=> 'result'),
    error=>error.message==='TEAM_DB_COMMIT_OUTCOME_UNKNOWN' && error.cause.message==='SYNTHETIC_RELEASE_FAILURE');
  assert.deepEqual(calls,['BEGIN','COMMIT']);
});

test('cleanup failure does not hide the original pre-commit failure',async()=>{
  const calls=[];
  const pool={connect:async()=>({
    async query(sql){calls.push(sql);return {command:sql,rows:[]};},
    release(){throw Error('SYNTHETIC_RELEASE_FAILURE');}
  })};
  await assert.rejects(createPgTransactionAdapter({pool}).transaction(async()=>{throw Error('SYNTHETIC_DENIAL');}),/SYNTHETIC_DENIAL/);
  assert.deepEqual(calls,['BEGIN','ROLLBACK']);
});
