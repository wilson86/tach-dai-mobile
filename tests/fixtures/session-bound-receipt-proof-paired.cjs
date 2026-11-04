'use strict';
// Test preparation only: callers must supply a reviewed scratch PG pool.
// Never report modeled fixture output as PostgreSQL or production evidence.
const positive=require('./session-bound-receipt-positive-control.cjs');
const negative=require('./session-bound-receipt-proof-denial.cjs');
async function run({pool,syntheticOnly=false,input}={}){
 if(syntheticOnly!==true)throw Error('SYNTHETIC_PAIRED_PROOF_DISABLED');
 const cases=[];
 for(const mode of ['forged','expired']){
  // A negative proof alone can appear to pass because the seed session is
  // invalid or the proof deadline has expired. Require a fresh positive
  // control for the SAME session/input before each negative case.
  const good=await positive.probe({pool,syntheticOnly:true,input});
  if(good.status!=='SYNTHETIC_POSITIVE_CONTROL')throw Error('SYNTHETIC_PAIRED_BASELINE_INVALID');
  const bad=await negative.probe({pool,syntheticOnly:true,mode,input});
  if(bad.status!=='SYNTHETIC_PROOF_DENIED'||bad.case!==mode)throw Error('SYNTHETIC_PAIRED_DENIAL_INVALID');
  cases.push(mode);
 }
 return Object.freeze({status:'SYNTHETIC_PAIRED_PROOFS_COMPLETE',cases:Object.freeze(cases),production_qualified:false});
}
module.exports=Object.freeze({run});
