'use strict';
const fs=require('fs'),assert=require('assert');
const freeze=fs.readFileSync('app/settlement-preproduction-freeze-manifest.js','utf8'),recheck=fs.readFileSync('app/settlement-preproduction-decision-recheck.js','utf8'),bridge=fs.readFileSync('app/settlement-qualification-history-bridge.js','utf8'),sw=fs.readFileSync('app/sw.js','utf8'),identity=fs.readFileSync('app/settlement-build-identity.js','utf8');
assert(freeze.includes('settlement-preproduction-freeze-manifest-v1'));assert(freeze.includes('critical_change_invalidates_existing_evidence:true'));assert(freeze.includes('evidence_rebuild_required_after_any_critical_change:true'));assert(freeze.includes('production_authorized:false'));assert(!freeze.includes('saveSettlement('));assert(!freeze.includes('saveConfig('));
assert(recheck.includes('settlement-preproduction-decision-recheck-v1'));assert(recheck.includes('TTL_MS=10*60*1000'));assert(recheck.includes('CURRENT_FOR_HUMAN_PRODUCTION_DECISION'));assert(recheck.includes('PREPRODUCTION_DECISION_RECHECK_EXPIRED'));assert(recheck.includes('production_authorized:false'));assert(!recheck.includes('production_authorized=true'));assert(!recheck.includes('saveSettlement('));assert(!recheck.includes('saveConfig('));
for(const f of ['./settlement-preproduction-freeze-manifest.js','./settlement-preproduction-decision-recheck.js']){assert(bridge.includes(f));assert(sw.includes("'"+f+"'"));}
assert(bridge.includes("appendScript('./settlement-preproduction-decision-dossier.js','data-kts-preproduction-decision-dossier',loadPreproductionFreezeManifest)"));
assert(bridge.includes("appendScript('./settlement-preproduction-freeze-manifest.js','data-kts-preproduction-freeze-manifest',loadPreproductionDecisionRecheck)"));
assert(bridge.includes("appendScript('./settlement-preproduction-decision-recheck.js','data-kts-preproduction-decision-recheck',loadPreproductionReviewSession)"));
assert(identity.includes("'app/settlement-preproduction-freeze-manifest.js'"));assert(identity.includes("'app/settlement-preproduction-decision-recheck.js'"));
console.log('settlement-preproduction-decision-recheck-wiring-tests: PASS');
