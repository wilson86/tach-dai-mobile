"use strict";
// Operator-approved money oracle: group all placements by (station,kind,number),
// THEN apply the coefficient and round UP only once per aggregated exposure.
const {test}=require("node:test"),assert=require("node:assert/strict");
const quyt=require("../quyt-bao-review.js");
const cleaner=require("../clean-aggregate-review.js");
const run=(source,output,extra={})=>quyt.prepareGrouped(output,{
 customer:"Quýt",inputStage:"CANONICAL_UNADJUSTED_RESULT",
 sourceText:source,cleanCore:cleaner,region:"mb",rate:"1,067",
 repeatDecision:"keep_all",omitRegion:true,...extra
});
test("two intentional b1n wagers aggregate to b2n then ceil 1.067 => b3n, NOT b4n",()=>{
 const p=run("43 b1n\n43 b1n","43 b2n");
 assert.equal(p.preview,"43 b3n");
 assert.equal(p.rawClauseCount,2);
 assert.equal(p.duplicateBlocks.length,1);
 assert.equal(p.receipts[0].before,"2");
 assert.equal(p.receipts[0].after,"3");
 assert.equal(p.groupedBeforeFactor,true);
 assert.equal(p.forwardAuthorized,false);
});
test("two b100n wagers => b200n then 214n once",()=>{
 const p=run("43 b100n 43 b100n","43 b200n");
 assert.equal(p.preview,"43 b214n");
 assert.equal(p.aggregatedExposures,1);
});
test("one raw wager also follows the same grouped rule",()=>{
 assert.equal(run("43 b100n","43 b100n").preview,"43 b107n");
 assert.equal(run("43 b50n","43 b50n").preview,"43 b54n");
});
test("group by station+selector+number, never conflate different numbers",()=>{
 const p=run("43 34 b100n 43 b50n","43 b150n 34 b100n");
 assert.equal(p.preview,"43 b161n\n34 b107n");
});
test("reordered-but-equal unadjusted result keeps all per-number points",()=>{
 const p=run("43 b100n 34 b50n","34 b50n 43 b100n");
 assert.equal(p.preview,"43 b107n\n34 b54n");
 assert.throws(()=>run("43 b100n 34 b50n","34 b50n 43 b99n"),
  /SOURCE_OUTPUT_EXPOSURE_MISMATCH_HOLD/);
});
test("B and canonical LO stay DISTINCT even for same number",()=>{
 const p=run("43 b1n 43 lo1n","43 b1n 43 lo1n");
 assert.equal(p.preview,"43 b2n\n43 lo2n");
 assert.equal(p.receipts.length,2);
});
test("DD, DAU and DUOI aggregate without the Quyt multiplier",()=>{
 const p=run("88 dd20n 88 dd20n 98 dau50n 98 duoi150n 43 b100n",
             "88 dd40n 98 dau50n 98 duoi150n 43 b100n");
 assert.equal(p.preview,"88 dd40n\n98 dau50n\n98 duoi150n\n43 b107n");
});
test("same bet across two EXPLICIT stations cannot be merged",()=>{
 const p=run("MB 43 b1n MN 43 b1n","MB 43 b1n MN 43 b1n",
 {region:undefined,omitRegion:false});
 assert.equal(p.preview,"MB 43 b2n\nMN 43 b2n");
});
test("customer duplicate confirmation is mandatory before any review output",()=>{
 assert.throws(()=>run("43 b1n 43 b1n","43 b2n",
 {repeatDecision:"ask_operator"}),/DUPLICATE_OPERATOR_CONFIRMATION_REQUIRED/);
 assert.throws(()=>run("43 b1n 43 b1n","43 b2n",
 {repeatDecision:"remove_copies"}),/DUPLICATE_OPERATOR_CONFIRMATION_REQUIRED|QUYT_REPETITIONS_MUST_NOT_BE_DELETED/);
});
test("multiplier adjustable with commas, dots and default",()=>{
 assert.equal(run("43 b100n","43 b100n",{rate:"1.05"}).preview,"43 b105n");
 assert.equal(run("43 b100n","43 b100n",{rate:"1,10"}).preview,"43 b110n");
 assert.equal(run("43 b100n","43 b100n",{rate:"1"}).preview,"43 b100n");
});
test("only positive valid rates at most 3 decimals",()=>{
 for(const rate of ["","0","-1","4","3.001","1.0001","NaN","1e2",null]){
  assert.throws(()=>run("43 b1n","43 b1n",{rate}),undefined,String(rate));
 }
});
test("source output must preserve per-number original POINTS before multiplier",()=>{
 for(const output of ["43 b1n","43 b3n","44 b2n","43 lo2n"]){
  assert.throws(()=>run("43 b1n 43 b1n",output),/SOURCE_OUTPUT_EXPOSURE_MISMATCH_HOLD/);
 }
});
test("invalid grammar and unknown selectors atomically HOLD",()=>{
 for(const raw of ["43 b1n garbage","43 b1.2n","43 foobar2n","43 43 b1n"]){
  assert.throws(()=>run(raw,raw),undefined,raw);
 }
});
test("no guessed station and mismatched region",()=>{
 assert.throws(()=>run("43 b1n","43 b1n",{region:undefined}),/STATION_REQUIRED_FOR_GROUPING/);
 assert.throws(()=>run("MN 43 b1n","MN 43 b1n"),/REGION_CONFLICT/);
});
test("legacy per-atom entrypoint now also uses verified grouping",()=>{
 assert.throws(()=>quyt.prepare("43 b1n",{customer:"Quýt",inputStage:"CANONICAL_UNADJUSTED_RESULT"}),/SOURCE_WITNESS_REQUIRED/);
 const p=quyt.prepare("43 b2n",{customer:"Quýt",inputStage:"CANONICAL_UNADJUSTED_RESULT",
  sourceText:"43 b1n 43 b1n",cleanCore:cleaner,region:"mb",repeatDecision:"keep_all",omitRegion:true});
 assert.equal(p.preview,"43 b3n");
});
test("transformed input already processed upstream cannot be multiplied twice",()=>{
 assert.throws(()=>run("43 b100n","43 b107n"),/SOURCE_OUTPUT_EXPOSURE_MISMATCH_HOLD/);
 assert.throws(()=>run("43 b100n","43 b100n",{alreadyTransformed:true}),/DOUBLE_TRANSFORM_HOLD/);
});
test("identity of operator-selected Quyt and input stage enforced",()=>{
 for(const o of [{customer:"Other"},{inputStage:"ALREADY_MULTIPLIED"}]){
  assert.throws(()=>run("43 b1n","43 b1n",o));
 }
});
test("nonadjacent repeated wager is HOLD until keep-all, then group before rate",()=>{
 const source="43 b1n 44 b2n 43 b1n",output="43 b2n 44 b2n";
 assert.throws(()=>run(source,output,{repeatDecision:"ask_operator"}),
  /DUPLICATE_OPERATOR_CONFIRMATION_REQUIRED/);
 const result=run(source,output,{repeatDecision:"keep_all"});
 assert.equal(result.preview,"43 44 b3n");
 assert.equal(result.rawClauseCount,3);
 assert.equal(result.duplicateBlocks.length,1);
 assert.equal(result.forwardAuthorized,false);
});
test("UI feature cannot authorize real forwarding and preserves source",()=>{
 const source="43 b1n\n43 b1n",p=run(source,"43 b2n");
 assert.equal(p.original,source);
 assert.equal(p.stage,"PREPARED_PREVIEW_ONLY");
 assert.equal(p.forwardAuthorized,false);
});
