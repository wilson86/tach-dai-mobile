'use strict';
// Offline fault model using the actual transaction adapter; no database is used.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createPgTransactionAdapter}=require('../team-settlement/pg-transaction-adapter.cjs');

test('lost commit acknowledgement cannot distinguish rollback from commit',async()=>{
  async function simulate(persistBeforeLoss){
    let pending=false, durable=false, destroyed;
    const statements=[];
    const pool={connect:async()=>({
      async query(sql){
        statements.push(sql);
        if(sql==='BEGIN')return {rows:[]};
        if(sql==='SYNTHETIC_WRITE'){pending=true;return {rows:[]};}
        if(sql==='COMMIT'){
          if(persistBeforeLoss&&pending)durable=true;
          throw Error('SYNTHETIC_CONNECTION_LOST');
        }
        if(sql==='ROLLBACK'){pending=false;return {rows:[]};}
        throw Error('UNEXPECTED_QUERY');
      },
      release(value){destroyed=value;}
    })};
    let observed;
    try{await createPgTransactionAdapter({pool}).transaction(tx=>tx.query('SYNTHETIC_WRITE'));}
    catch(error){observed=error.message;}
    assert.deepEqual(statements,['BEGIN','SYNTHETIC_WRITE','COMMIT','ROLLBACK']);
    assert.equal(destroyed,true);
    return {observed,durable};
  }
  const before=await simulate(false),after=await simulate(true);
  assert.equal(before.observed,'TEAM_DB_COMMIT_OUTCOME_UNKNOWN');
  assert.equal(after.observed,before.observed);
  assert.equal(before.durable,false);
  assert.equal(after.durable,true);
});
