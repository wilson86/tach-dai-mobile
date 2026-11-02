"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const m=require("../quyt-bao-review.js");
const ok=x=>m.prepare(x,{customer:"Quýt",inputStage:"CANONICAL_UNADJUSTED_RESULT"});
test("Quyt opt-in BAO B ceiling per amount is explicit",()=>{
 assert.equal(ok("43 34 74 83 b100n").preview,"43 34 74 83 b107n");
 assert.equal(ok("43 b50n").preview,"43 b54n");
 assert.equal(ok("43 b200n").preview,"43 b214n");
 assert.equal(ok("43 b0.5n").preview,"43 b1n");
 assert.equal(ok("43 b2.50n").preview,"43 b3n");
});
test("LO family canonical policy matches historical Router oracle",()=>{
 assert.equal(ok("43 bao50n 43 lo 100n").preview,"43 bao54n 43 lo 107n");
 assert.equal(ok("43 blo200n 43 bl 50n").preview,"43 blo214n 43 bl 54n");
 assert.equal(ok("43 lô 100n").preview,"43 lô 107n");
});
test("non-BAO stakes remain unchanged in mixed result",()=>{
 assert.equal(ok("43 b100n 44 dd20n 98 dau50n 98 duoi150n 55 dx5n").preview,
  "43 b107n 44 dd20n 98 dau50n 98 duoi150n 55 dx5n");
});
test("Quyt on two intentional placements preserves both amounts",()=>{
 const r=ok("43 b100n\n43 b100n");
 assert.equal(r.alteredOccurrences,2);
 assert.equal(r.preview,"43 b107n\n43 b107n");
 assert.equal(r.sourceUnmodified,true);
 assert.equal(r.forwardAuthorized,false);
});
test("ROUND BEFORE AGGREGATION: 2x b1n must not silently become b3n",()=>{
 const p=ok("43 b1n\n43 b1n");
 assert.equal(p.preview,"43 b2n\n43 b2n"); // 4n total after per-original-stake CEIL
 assert.equal(ok("43 b2n").preview,"43 b3n"); // 3n if mistakenly aggregated first
 assert.equal(p.alteredOccurrences,2);
});
test("editable rate accepts comma/dot, defaults 1.067 and recalculates each wager",()=>{
 assert.equal(m.DEFAULT_RATE,"1.067");
 assert.equal(m.prepare("43 b100n",{customer:"Quýt",inputStage:"CANONICAL_UNADJUSTED_RESULT",rate:"1,05"}).preview,"43 b105n");
 assert.equal(m.prepare("43 b100n",{customer:"Quýt",inputStage:"CANONICAL_UNADJUSTED_RESULT",rate:"1.10"}).preview,"43 b110n");
 assert.equal(m.prepare("43 b50n",{customer:"Quýt",inputStage:"CANONICAL_UNADJUSTED_RESULT",rate:"0,95"}).preview,"43 b48n");
 assert.equal(m.rounded("100","1"),"100");
 assert.equal(m.rounded("100","3"),"300");
 assert.equal(m.rounded("1","1,067"),"2");
});
test("editable rate rejects malformed, unsafe and excessive precision before any result",()=>{
 for(const rate of ["","0","-1","1.0001","3.001","4","NaN","1e2","1,2,3",null]){
  assert.throws(()=>m.prepare("43 b100n",{customer:"Quýt",inputStage:"CANONICAL_UNADJUSTED_RESULT",rate}),undefined,String(rate));
 }
});
test("per-atom ceiling does not erase intentionally repeated wagers on custom rate",()=>{
 const prepared=m.prepare("43 b1n\n43 b1n",{customer:"Quýt",inputStage:"CANONICAL_UNADJUSTED_RESULT",rate:"1,20"});
 assert.equal(prepared.alteredOccurrences,2);
 assert.equal(prepared.preview,"43 b2n\n43 b2n");
 assert.equal(prepared.rate,"1.20");
 assert.equal(prepared.forwardAuthorized,false);
});
test("source witness prevents multiplying already grouped or split B/LO stakes",()=>{
 for(const [original,materialized] of [
 ["43 b1n\n43 b1n","43 b2n"], // two original 1n stakes, aggregated first would lose rounding
 ["43 b100n","43 b50n"], // workflow allocation cannot be re-adjusted here
 ["43 b100n","43 lo100n"] // no silent B/LO reinterpretation
 ]){
  assert.throws(()=>m.prepare(materialized,{customer:"Quýt",
    inputStage:"CANONICAL_UNADJUSTED_RESULT",rate:"1,067",
    sourceText:original,requireSourceWitness:true}));
 }
});
test("exact source stake witness survives whitespace and intended duplicates",()=>{
 const original="HN 43 b100n\nHN 43 b100n";
 const materialized="MB 43 b100n\nMB 43 b100n";
 const receipt=m.prepare(materialized,{customer:"Quýt",inputStage:"CANONICAL_UNADJUSTED_RESULT",
   rate:"1.067",sourceText:original,requireSourceWitness:true});
 assert.equal(receipt.preview,"MB 43 b107n\nMB 43 b107n");
 assert.equal(receipt.sourceWitnessVerified,true);
 assert.equal(receipt.originalStakeCount,2);
 assert.equal(receipt.alteredOccurrences,2);
 assert.equal(receipt.forwardAuthorized,false);
});
test("full verified source witness is mandatory when requested",()=>{
 assert.throws(()=>m.prepare("43 b100n",{customer:"Quýt",
   inputStage:"CANONICAL_UNADJUSTED_RESULT",requireSourceWitness:true}),/SOURCE_WITNESS_REQUIRED/);
});
test("untrusted stage, missing opt-in, already transformed fail closed",()=>{
 for(const args of [
 {customer:"Other",inputStage:"CANONICAL_UNADJUSTED_RESULT"},
 {customer:"Quýt",inputStage:"ORIGINAL_SOURCE"},
 {customer:"Quýt",inputStage:"CANONICAL_UNADJUSTED_RESULT",alreadyTransformed:true}
 ])assert.throws(()=>m.prepare("43 b100n",args));
});
test("reject wrong amount fractions and zero",()=>{
 for(const bad of ["0.05","0.7","1.25","0","00.001"])
  assert.throws(()=>m.rounded(bad),undefined,bad);
});
test("cannot accept parser errors, confirmation messages or Cut ledgers",()=>{
 for(const s of [
 "PHÁT HIỆN TIN SAI: 43 b100n",
 "XÁC NHẬN SỐ TRÙNG 43 b100n",
 "[[KTS_EXACT_OUTPUT_LEDGER_V1]] 43 b100n"
 ])assert.throws(()=>ok(s),undefined,s);
});
test("final review always lacks forwarding permission",()=>{
 const r=ok("43 b100n");assert.equal(r.stage,"PREPARED_PREVIEW_ONLY");
 assert.equal(r.forwardAuthorized,false);assert.equal(r.receipts[0].before,"100");
 assert.equal(r.receipts[0].after,"107");
 assert.equal(m.CONTRACT.round,"CEIL_PER_STAKE");
});
