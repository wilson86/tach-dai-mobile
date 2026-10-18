'use strict';

// Private HIOSKT oracle-review protocol. Source rows and financial values are
// intentionally not accepted here: retain them in an operator-controlled
// private location and commit only case IDs plus one-way evidence hashes.
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const SHA=/^[a-f0-9]{64}$/;
const CASE_COUNT=65;
function fail(code){throw Error(code);}
function object(value,code){if(!value||typeof value!=='object'||Array.isArray(value))fail(code);return value;}
function exact(value,keys,code){object(value,code);if(Object.keys(value).some(k=>!keys.includes(k)))fail(code);return value;}
function identifier(value,code){if(typeof value!=='string'||!ID.test(value))fail(code);return value;}
function digest(value,code){if(typeof value!=='string'||!SHA.test(value))fail(code);return value;}

function createBlankOracle65Template({suite_id='private_hioskt_oracle_65_v1'}={}){
  identifier(suite_id,'ORACLE_SUITE_INVALID');
  return Object.freeze({suite_id,case_count:CASE_COUNT,
    cases:Object.freeze(Array.from({length:CASE_COUNT},(_,i)=>Object.freeze({
      case_id:`case_${String(i+1).padStart(2,'0')}`,
      source_sha256:null,expected_sha256:null,status:'PENDING'
    })))
  });
}

function createOracle65ReviewPlan(input={}){
  exact(input,['suite_id','cases'],'ORACLE_PLAN_INVALID');
  const suite_id=identifier(input.suite_id,'ORACLE_SUITE_INVALID');
  if(!Array.isArray(input.cases)||input.cases.length!==CASE_COUNT)fail('ORACLE_CASE_COUNT_INVALID');
  const seen=new Set();
  const cases=input.cases.map(item=>{
    exact(item,['case_id','source_sha256','expected_sha256'],'ORACLE_CASE_INVALID');
    const case_id=identifier(item.case_id,'ORACLE_CASE_INVALID');
    if(seen.has(case_id))fail('ORACLE_CASE_DUPLICATE');
    seen.add(case_id);
    return Object.freeze({case_id,source_sha256:digest(item.source_sha256,'ORACLE_SOURCE_HASH_INVALID'),
      expected_sha256:digest(item.expected_sha256,'ORACLE_EXPECTED_HASH_INVALID'),status:'PENDING'});
  });
  return Object.freeze({suite_id,case_count:CASE_COUNT,cases:Object.freeze(cases)});
}

function applyOracle65Review(plan,decisions){
  object(plan,'ORACLE_PLAN_INVALID');
  if(plan.case_count!==CASE_COUNT||!Array.isArray(plan.cases)||plan.cases.length!==CASE_COUNT)
    fail('ORACLE_PLAN_INVALID');
  if(!Array.isArray(decisions)||decisions.length!==CASE_COUNT)fail('ORACLE_DECISION_COUNT_INVALID');
  const planned=new Map(plan.cases.map(item=>[item.case_id,item]));
  const seen=new Set();
  const reviewed=decisions.map(item=>{
    exact(item,['case_id','actual_sha256','status','reviewer_ref'],'ORACLE_DECISION_INVALID');
    const case_id=identifier(item.case_id,'ORACLE_DECISION_INVALID');
    if(seen.has(case_id)||!planned.has(case_id))fail('ORACLE_DECISION_INVALID');
    seen.add(case_id);
    const actual_sha256=digest(item.actual_sha256,'ORACLE_ACTUAL_HASH_INVALID');
    const reviewer_ref=identifier(item.reviewer_ref,'ORACLE_REVIEWER_INVALID');
    if(!['MATCHED','DISCREPANCY'].includes(item.status))fail('ORACLE_DECISION_INVALID');
    const expected=planned.get(case_id).expected_sha256;
    if((item.status==='MATCHED')!==(actual_sha256===expected))fail('ORACLE_DECISION_INCONSISTENT');
    return Object.freeze({case_id,actual_sha256,status:item.status,reviewer_ref});
  });
  const discrepancies=reviewed.filter(x=>x.status==='DISCREPANCY').length;
  return Object.freeze({suite_id:plan.suite_id,case_count:CASE_COUNT,
    reviewed_count:reviewed.length,discrepancy_count:discrepancies,
    monetary_parity_proven:false,
    // Even 65 matching hashes cannot turn on monetary behavior. It remains a
    // necessary evidence record awaiting independent human sign-off.
    release_authorized:false,cases:Object.freeze(reviewed)});
}
module.exports=Object.freeze({CASE_COUNT,createBlankOracle65Template,createOracle65ReviewPlan,applyOracle65Review});
