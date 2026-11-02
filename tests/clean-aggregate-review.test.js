"use strict";
// Synthetic-only review QA; no customer messages, no dispatch and no cash payouts.
const t=require("node:test"),assert=require("node:assert/strict"),A=require("../clean-aggregate-review.js");
const call=(text,options={})=>A.preview(text,{region:"mb",...options});
t("intentional repeated wagers always count twice, default HOLD",()=>{
 const raw="12 34 b2n 56 dd3n 12 34 b2n 56 dd3n";
 const x=call(raw),kept=call(raw,{repeatDecision:"keep_all"});
 assert.equal(x.status,"HOLD_REVIEW");assert.equal(x.removedClauses,0);
 assert.deepEqual(x.repeated,[{first:1,second:3,length:2}]);
 assert.equal(kept.rawClauses,4);assert.equal(kept.keptClauses,4);
 assert.equal(kept.total,"14");assert.equal(kept.totals.b,"8");
 assert.equal(kept.totals.dd,"6");
});
t("copy removal requires explicit traceable decision",()=>{
 const s="12 b2n 12 b2n";
 assert.throws(()=>call(s,{repeatDecision:"remove_copies"}),/EXPLICIT_COPY_REMOVAL_DECISION_REQUIRED/);
 const p=call(s,{repeatDecision:"remove_copies",decisionReference:"synthetic-user-ack"});
 assert.equal(p.rawTotal,"4");assert.equal(p.total,"2");assert.equal(p.removedClauses,1);
 assert.equal(p.forwardAuthorized,false);
});
t("unbroken wagers and compact suffix are parsed fully",()=>{
 const x=call("03 30 16 61 39 93dd20n 65 b0.5n 65 b1,5n",{repeatDecision:"keep_all"});
 assert.equal(x.totals.dd,"120");assert.equal(x.totals.b,"2");
 assert.match(x.normalized,/03 30 16 61 39 93 dd20n/);
 assert.match(x.normalized,/65 b2n/);
});
t("selector aliases normalize without touching original",()=>{
 const s="12 blo1n 12 lo2n 12 d-d3n 12 dau4n 12 dui5n";
 const x=call(s);assert.equal(x.originalText,s);
 assert.equal(x.totals.b,"3");assert.equal(x.totals.dd,"3");
 assert.equal(x.totals.dau,"4");assert.equal(x.totals.duoi,"5");
});
t("region resolves HN to MB and rejects region mismatch",()=>{
 const x=A.preview("HN 03 b2n MB 03 b3n",{region:"mb",repeatDecision:"keep_all"});
 assert.equal(x.totals.b,"5");
 assert.equal(x.normalized,"MB 03 b5n");
 assert.throws(()=>A.preview("HN 03 b1n",{region:"mn"}),/REGION_CONFLICT/);
});
t("strict fail-closed grammar for unknown, mismatched, incomplete",()=>{
 for(const s of ["12 b1n duix2n","12 b1n UNKNOWN 34 b3n","12 b","12 12 b3n","123 b4n","12 b0n","12 b0.7n"])
 assert.throws(()=>call(s),undefined,s);
});
t("bare upstream output requires explicit single station",()=>{
 assert.throws(()=>A.preview("12 b2n",{omitRegion:true}),/BARE_OUTPUT_REQUIRES_SINGLE_EXPLICIT_REGION/);
 assert.equal(call("12 b2n",{omitRegion:true}).normalized,"12 b2n");
});
t("compact output roundtrip conserves every per-number stake",()=>{
 const raw="03 12 b1n 03 12 b1n 56 dd2n 56 dd2n";
 const x=call(raw,{repeatDecision:"keep_all"});
 const reread=call(x.normalized,{repeatDecision:"keep_all"});
 assert.deepEqual(reread.totals,x.totals);
 assert.equal(reread.uniqueExposures,x.uniqueExposures);
});
t("unknown mode cannot silently delete any stake",()=>{
 assert.throws(()=>call("12 b1n 12 b1n",{repeatDecision:"auto_remove"}),/DUPLICATE_DECISION_INVALID/);
});
