'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {CASE_COUNT,createBlankOracle65Template,createOracle65ReviewPlan,applyOracle65Review}=require('../team-settlement/oracle-65-review.cjs');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function input(){return {suite_id:'private_oracle_65',cases:Array.from({length:CASE_COUNT},(_,i)=>({
  case_id:`case_${String(i+1).padStart(2,'0')}`,source_sha256:hash('private-source-'+i),expected_sha256:hash('private-expected-'+i)
}))};}
test('blank template has exactly 65 non-evidentiary pending cases',()=>{
 const template=createBlankOracle65Template();
 assert.equal(template.case_count,65);assert.equal(template.cases.length,65);
 assert.ok(template.cases.every(x=>x.status==='PENDING'&&x.source_sha256===null&&x.expected_sha256===null));
});
test('private review plan commits exactly 65 source and expected hashes without source content',()=>{
 const plan=createOracle65ReviewPlan(input());
 assert.equal(plan.cases.length,65);assert.equal(JSON.stringify(plan).includes('private-source-'),false);
 assert.throws(()=>createOracle65ReviewPlan({...input(),cases:input().cases.slice(0,64)}),/ORACLE_CASE_COUNT_INVALID/);
 const plaintext=input();plaintext.cases[0].source_row='forbidden';
 assert.throws(()=>createOracle65ReviewPlan(plaintext),/ORACLE_CASE_INVALID/);
});
test('review requires consistent match/discrepancy commitments and never authorizes real money',()=>{
 const plan=createOracle65ReviewPlan(input());
 const decisions=plan.cases.map(x=>({case_id:x.case_id,actual_sha256:x.expected_sha256,status:'MATCHED',reviewer_ref:'reviewer_a'}));
 const result=applyOracle65Review(plan,decisions);
 assert.equal(result.reviewed_count,65);assert.equal(result.discrepancy_count,0);
 assert.equal(result.monetary_parity_proven,false);assert.equal(result.release_authorized,false);
 decisions[0]={...decisions[0],actual_sha256:hash('different'),status:'MATCHED'};
 assert.throws(()=>applyOracle65Review(plan,decisions),/ORACLE_DECISION_INCONSISTENT/);
});
