'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createOracle65ReviewPlan,applyOracle65Review}=require('../team-settlement/oracle-65-review.cjs');
function good(){
  const plan=createOracle65ReviewPlan({suite_id:'synthetic_65_case_gate',
    cases:Array.from({length:65},(_,i)=>({
      case_id:'case_'+String(i+1).padStart(2,'0'),
      source_sha256:'1'.repeat(64),expected_sha256:'a'.repeat(64)
    }))});
  const decisions=plan.cases.map(row=>({
    case_id:row.case_id,actual_sha256:row.expected_sha256,
    status:'MATCHED',reviewer_ref:'synthetic_reviewer'
  }));
  return {plan,decisions};
}
function modified(plan,mutate){
  const tampered=JSON.parse(JSON.stringify(plan));
  mutate(tampered);
  return tampered;
}
test('65-case review rejects missing source hashes even with matching expected hashes',()=>{
  const {plan,decisions}=good();
  const tampered=modified(plan,x=>{x.cases[0].source_sha256=null;});
  assert.throws(()=>applyOracle65Review(tampered,decisions),/ORACLE_PLAN_SOURCE_HASH_INVALID/);
});
test('65-case review rejects case state changes and unexpected private case fields',()=>{
  const {plan,decisions}=good();
  for(const fn of [
    x=>{x.cases[0].status='MATCHED';},
    x=>{x.cases[0].source_row='must_stay_private';},
    x=>{delete x.cases[0].status;}
  ]){
    assert.throws(()=>applyOracle65Review(modified(plan,fn),decisions),/ORACLE_PLAN_CASE_INVALID/);
  }
});
test('reviewed count cannot be based on duplicate, missing or malformed plan identities',()=>{
  const {plan,decisions}=good();
  for(const fn of [
    x=>{x.cases[0].case_id=x.cases[1].case_id;},
    x=>{x.cases[0].case_id='invalid/name';},
    x=>{x.cases.pop();},
    x=>{x.suite_id=null;},
    x=>{x.extra_unaudited='UNSAFE';}
  ]){
    assert.throws(()=>applyOracle65Review(modified(plan,fn),decisions),/ORACLE_/);
  }
});
test('review rejects tampered expected evidence hash before it counts a case',()=>{
  const {plan,decisions}=good();
  assert.throws(()=>applyOracle65Review(modified(plan,x=>{x.cases[0].expected_sha256=null;}),decisions),/ORACLE_PLAN_EXPECTED_HASH_INVALID/);
});
test('valid synthetic 65-case review can be recorded but never approves release',()=>{
  const {plan,decisions}=good();
  const result=applyOracle65Review(JSON.parse(JSON.stringify(plan)),decisions);
  assert.equal(result.reviewed_count,65);
  assert.equal(result.discrepancy_count,0);
  assert.equal(result.monetary_parity_proven,false);
  assert.equal(result.release_authorized,false);
});
