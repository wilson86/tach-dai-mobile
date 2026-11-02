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
 assert.equal(x.totals.b,"0");assert.equal(x.totals.lo,"3");assert.equal(x.totals.dd,"3");
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
t("nonadjacent repeated wagers HOLD unless operator confirms keep-all",()=>{
 const raw="43 b1n 44 b2n 43 b1n";
 const pending=call(raw),kept=call(raw,{repeatDecision:"keep_all"});
 assert.equal(pending.status,"HOLD_REVIEW");
 assert.deepEqual(pending.repeated,[{first:1,second:3,length:1,nonAdjacent:true}]);
 assert.equal(pending.removedClauses,0);
 assert.equal(kept.keptClauses,3);
 assert.equal(kept.totals.b,"4");
 assert.throws(()=>call(raw,{repeatDecision:"remove_copies",decisionReference:"synthetic-ack"}),
  /NON_ADJACENT_PASTE_MANUAL_SOURCE_REVIEW_REQUIRED/);
});
t("clean review preserves original number order for separated equal stakes",()=>{
 const raw="43 b100n 34 b50n 44 b100n";
 const p=call(raw);
 assert.equal(p.normalized,"MB 43 b100n\nMB 34 b50n\nMB 44 b100n");
 assert.equal(p.rawTotal,p.total);
});
t("B and LO wagers remain separate by station, number and selector",()=>{
 const x=call("43 b100n 43 lo50n");
 assert.equal(x.status,"REVIEW_ONLY");
 assert.equal(x.normalized,"MB 43 b100n\nMB 43 lo50n");
 assert.equal(x.totals.b,"100");
 assert.equal(x.totals.lo,"50");
 assert.equal(x.total,"150");
 assert.equal(x.rawTotal,"150");
});
t("LO aliases preserve type, including multiword bao lo",()=>{
 const x=call("43 blo1n 44 bao2n 45 bl3n 46 lô4n 47 bao lo5n");
 assert.equal(x.normalized,"MB 43 lo1n\nMB 44 lo2n\nMB 45 lo3n\nMB 46 lo4n\nMB 47 lo5n");
 assert.equal(x.totals.lo,"15");assert.equal(x.totals.b,"0");
 const y=call(x.normalized);
 assert.deepEqual(y.totals,x.totals);
});
t("unknown mode cannot silently delete any stake",()=>{
 assert.throws(()=>call("12 b1n 12 b1n",{repeatDecision:"auto_remove"}),/DUPLICATE_DECISION_INVALID/);
});
