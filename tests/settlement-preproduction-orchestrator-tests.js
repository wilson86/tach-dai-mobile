'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
(async()=>{
  let ready={status:'READY_EVIDENCE_CURRENT',current:true,ready_event:{id:'q1'}},latest={status:'NO_REVIEW_EVIDENCE',current:false,event:null},appended=0,sessionResumes=0;
  const pkg={source_ready_event:{id:'q1'},integrity:{payload_sha256:'p'.repeat(64)}};
  const ctx={console,globalThis:null,
    KTS_SETTLEMENT_QUALIFICATION_HISTORY:{async checkLastReadyValidity(){return ready;}},
    KTS_SETTLEMENT_PREPRODUCTION_PACKAGE:{async buildPackage(){return pkg;}},
    KTS_SETTLEMENT_PREPRODUCTION_REVIEW:{async reviewPackage(){return {verdict:'CURRENT',checklist:[]};},async buildHumanReviewRecord(){return {integrity:{record_sha256:'r'}};},async verifyHumanReviewRecord(){return {valid:true,errors:[]};}},
    KTS_SETTLEMENT_PREPRODUCTION_REVIEW_HISTORY:{async checkLatestValidity(){return latest;},async appendReview(){appended++;latest={status:'CURRENT',current:true,event:{package_link:{package_payload_sha256:'p'.repeat(64)},qualification_link:{source_event_id:'q1'},record:{id:'record'}}};return {sequence:appended,package_link:{package_payload_sha256:'p'.repeat(64)},qualification_link:{source_event_id:'q1'}};}},
    KTS_SETTLEMENT_PREPRODUCTION_REVIEW_SESSION:{async buildSession(){return {format:'session',id:'s1'};},async resumeSession(s){sessionResumes++;return {session:s,package:pkg,review:{verdict:'CURRENT',checklist:[]}};}},
    KTS_SETTLEMENT_PREPRODUCTION_REVIEW_BUNDLE:{async buildBundle(){return {id:'bundle'};}},KTS_SETTLEMENT_PREPRODUCTION_RECEIPT:{async buildReceipt(){return {id:'receipt'};}},KTS_SETTLEMENT_PREPRODUCTION_HANDOFF:{async buildHandoff(){return {id:'handoff'};}},KTS_SETTLEMENT_PREPRODUCTION_CANDIDATE:{async buildCandidate(){return {id:'candidate',integrity:{candidate_sha256:'c'}};}},KTS_SETTLEMENT_PREPRODUCTION_BOUNDARY:{async buildBoundarySnapshot(){return {status:'PREPRODUCTION_EVIDENCE_COMPLETE'};}},KTS_SETTLEMENT_PREPRODUCTION_AUDIT_PACK:{async buildAuditPack(){return {id:'audit'};},async verifyAuditPack(){return {valid:true,errors:[]};}},Date,JSON};
  ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync('app/settlement-preproduction-orchestrator.js','utf8'),ctx);
  const O=ctx.KTS_SETTLEMENT_PREPRODUCTION_ORCHESTRATOR;assert(O);assert.strictEqual(O.version,'settlement-preproduction-orchestrator-v2-session-resume');let s=await O.inspectState();assert.strictEqual(s.stage,'READY_NEEDS_REVIEW');
  const prep=await O.prepareTechnicalReview();assert(prep.session);assert.strictEqual(prep.review.verdict,'CURRENT');const resumed=await O.resumeTechnicalReview(prep.session);assert.strictEqual(resumed.resumed,true);
  await assert.rejects(()=>O.completeFromSession(prep.session,{reviewer:'tester',acknowledged:false}),/HUMAN_ACK_REQUIRED/);await assert.rejects(()=>O.completeFromSession(prep.session,{reviewer:'',acknowledged:true}),/REVIEWER_REQUIRED/);
  const first=await O.completeFromSession(prep.session,{reviewer:'tester',acknowledged:true});assert.strictEqual(appended,1);assert.strictEqual(first.chain.stage,'TECHNICAL_CHAIN_COMPLETE');assert.strictEqual(first.idempotent_review_reuse,false);assert.strictEqual(first.chain.production_authorized,false);
  const retry=await O.completeFromSession(prep.session,{});assert.strictEqual(appended,1,'retry must not append duplicate review');assert.strictEqual(retry.idempotent_review_reuse,true);assert(sessionResumes>=4);
  ready={status:'READY_EVIDENCE_STALE',current:false,ready_event:{id:'q1'}};s=await O.inspectState();assert.strictEqual(s.stage,'READY_NOT_CURRENT');await assert.rejects(()=>O.buildTechnicalChain(),/REVIEW_NOT_CURRENT/);
  console.log('settlement-preproduction-orchestrator-tests: PASS');
})().catch(e=>{console.error(e);process.exit(1);});
