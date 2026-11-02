'use strict';
// Executes the actual candidate repository and transaction adapter using fake
// clients only. It does not verify PostgreSQL, roles, SQL syntax, or RLS.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {createPgTransactionAdapter}=require('../team-settlement/pg-transaction-adapter.cjs');
const {createPostgresLedgerRepository}=require('../team-settlement/postgres-ledger-repository.cjs');
const token='T'.repeat(43);
const input={scope:{workspace_id:'fake_group',partner_id:'fake_partner',business_date:'2026-10-26',region:'mn'},action:'approve_review',expected_revision:2,event_id:'event_a',idempotency_key:'draft_a'};
function fixture({badReceipt=false,lostCommit=false,deny=false}={}){
  const queries=[],releases=[];let connections=0;
  const pool={connect:async()=>{connections++;return {
    async query(sql,args){
      queries.push({sql,args});
      if(['BEGIN','ROLLBACK'].includes(sql))return {rows:[],command:sql};
      if(sql==='COMMIT'){if(lostCommit)throw Error('FAKE_COMMIT_LOST');return {rows:[],command:'COMMIT'};}
      if(sql.includes('kts_team.atomic_review_v1')){
        if(deny)throw Error('TEAM_ATOMIC_SESSION_INVALID');
        return {rows:[{result:{event_id:badReceipt?'forged_event':'event_a',replayed:false,new_revision:3,feed_seq:3,state:'REVIEWED'}}]};
      }
      throw Error('UNEXPECTED_FAKE_QUERY');
    },release(destroy){releases.push(destroy);}
  };}};
  return {repo:createPostgresLedgerRepository({db:createPgTransactionAdapter({pool})}),queries,releases,connections:()=>connections};
}
test('candidate calls one SQL boundary with request-bound proof, no actor or token',async()=>{
  const f=fixture();const result=await f.repo.advanceReviewWithSessionProof(token,input);
  assert.equal(result.state,'REVIEWED');assert.equal(result.event_id,'event_a');
  assert.deepEqual(f.queries.map(q=>q.sql.trim().split(/\s+/).slice(0,2).join(' ')),['BEGIN','SELECT kts_team.atomic_review_v1(','COMMIT']);
  const a=f.queries[1].args;assert.equal(a.length,13);assert.equal(JSON.stringify(a).includes(token),false);
  assert.deepEqual(a.slice(4,12),['fake_group','fake_partner','2026-10-26','mn','approve_review',2,'event_a','draft_a']);
  const hash=crypto.createHash('sha256').update(token).digest('hex');
  const message=['kts-review-v1',a[0],a[4],a[5],a[6],a[7],a[8],String(a[9]),a[10],a[11],a[12],a[1],String(a[2])].join('|');
  assert.equal(a[3],crypto.createHmac('sha256',Buffer.from(hash,'hex')).update(message).digest('hex'));
  assert.deepEqual(f.releases,[false]);
});
test('candidate rejects actor injection before connecting',async()=>{
  const f=fixture();
  await assert.rejects(f.repo.advanceReviewWithSessionProof(token,{...input,actor:'fake_admin'}),/TEAM_REVIEW_REQUEST_INVALID/);
  assert.equal(f.connections(),0);
});
test('candidate rolls back forged receipt and denied session without success',async()=>{
  for(const cfg of [{badReceipt:true},{deny:true}]){
    const f=fixture(cfg);
    await assert.rejects(f.repo.advanceReviewWithSessionProof(token,input));
    assert.equal(f.queries.at(-1).sql,'ROLLBACK');assert.equal(f.queries.some(q=>q.sql==='COMMIT'),false);
  }
});
test('lost commit acknowledgement stays unknown and never automatically retries',async()=>{
  const f=fixture({lostCommit:true});
  await assert.rejects(f.repo.advanceReviewWithSessionProof(token,input),/TEAM_DB_COMMIT_OUTCOME_UNKNOWN/);
  assert.equal(f.connections(),1);assert.equal(f.queries.filter(q=>q.sql.includes('atomic_review_v1')).length,1);
  assert.deepEqual(f.releases,[true]);
});

test('reconciliation uses distinct SQL lookup and never sends mutation',async()=>{
  const statements=[];let answer={classification:'UNKNOWN'};
  const pool={connect:async()=>({
    async query(sql,args){
      statements.push({sql,args});
      if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return {rows:[],command:sql};
      if(sql.includes('atomic_review_reconcile_v1'))return {rows:[{result:answer}]};
      throw Error('UNEXPECTED_FAKE_QUERY');
    },release(){}
  })};
  const repo=createPostgresLedgerRepository({db:createPgTransactionAdapter({pool})});
  const {event_id,...lookup}=input;
  assert.deepEqual(await repo.reconcileReviewWithSessionProof(token,lookup),{classification:'UNKNOWN',auto_retry:false});
  answer={classification:'MATCHED_SERVER_RECEIPT',event_id:'event_original',feed_seq:'3',new_revision:3,state:'REVIEWED'};
  assert.deepEqual(await repo.reconcileReviewWithSessionProof(token,lookup),{...answer,auto_retry:false});
  answer={...answer,state:'PENDING_REVIEW'};
  await assert.rejects(repo.reconcileReviewWithSessionProof(token,lookup),/TEAM_REVIEW_RECEIPT_UNVERIFIED/);
  assert.equal(statements.some(q=>q.sql.includes('kts_team.atomic_review_v1(')),false);
  assert.equal(statements.filter(q=>q.sql.includes('atomic_review_reconcile_v1')).length,3);
  assert.equal(statements.at(-1).sql,'ROLLBACK');
});
