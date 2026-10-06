'use strict';
// Keep loader-order checks callback-based: declaration order is not execution order.
const fs=require('fs'),assert=require('assert');
const orch=fs.readFileSync('app/settlement-preproduction-orchestrator.js','utf8'),audit=fs.readFileSync('app/settlement-preproduction-audit-pack.js','utf8'),bridge=fs.readFileSync('app/settlement-qualification-history-bridge.js','utf8'),sw=fs.readFileSync('app/sw.js','utf8'),identity=fs.readFileSync('app/settlement-build-identity.js','utf8');
assert(orch.includes("settlement-preproduction-orchestrator-v1"));assert(orch.includes('PREPRODUCTION_ORCHESTRATOR_HUMAN_ACK_REQUIRED'));assert(orch.includes('PREPRODUCTION_ORCHESTRATOR_REVIEWER_REQUIRED'));assert(orch.includes('production_authorized:false'));assert(orch.includes('merge_authorized:false'));assert(orch.includes('deploy_authorized:false'));assert(orch.includes('production_enabled:false'));assert(!orch.includes('saveSettlement('));assert(!orch.includes('saveConfig('));assert(!orch.includes('production_enabled=true'));assert(!orch.includes('merge_authorized=true'));assert(!orch.includes('deploy_authorized=true'));
assert(audit.includes("kts-preproduction-audit-pack-v1"));assert(audit.includes("READ_ONLY_PREPRODUCTION_ARCHIVE"));assert(audit.includes('contains_operational_store:false'));assert(audit.includes('contains_package_payload:false'));assert(audit.includes('production_authorized:false'));assert(!audit.includes('saveSettlement('));assert(!audit.includes('saveConfig('));
for(const f of ['./settlement-preproduction-audit-pack.js','./settlement-preproduction-orchestrator.js']){assert(bridge.includes(f));assert(sw.includes("'"+f+"'"));}
assert(bridge.includes("appendScript('./settlement-preproduction-boundary.js','data-kts-preproduction-boundary',loadPreproductionAuditPack)"));
assert(bridge.includes("appendScript('./settlement-preproduction-audit-pack.js','data-kts-preproduction-audit-pack',loadPreproductionOrchestrator)"));
assert(identity.includes("'app/settlement-preproduction-audit-pack.js'"));assert(identity.includes("'app/settlement-preproduction-orchestrator.js'"));
console.log('settlement-preproduction-orchestration-wiring-tests: PASS');
