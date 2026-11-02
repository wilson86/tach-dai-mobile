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
