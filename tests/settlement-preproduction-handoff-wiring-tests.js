'use strict';
const fs=require('fs');const assert=require('assert');
const handoff=fs.readFileSync('app/settlement-preproduction-handoff.js','utf8');const bridge=fs.readFileSync('app/settlement-qualification-history-bridge.js','utf8');const sw=fs.readFileSync('app/sw.js','utf8');const identity=fs.readFileSync('app/settlement-build-identity.js','utf8');
assert(handoff.includes("version:'settlement-preproduction-handoff-v1'"));assert(handoff.includes("FORMAT='kts-preproduction-handoff-v1'"));assert(handoff.includes("MODE='PORTABLE_HANDOFF_EVIDENCE_ONLY'"));
for(const lock of ['production_enabled:false','merge_authorized:false','deploy_authorized:false','mutates_settlement:false','production_approval_recorded:false','import_mutates_local_history:false'])assert(handoff.includes(lock));
assert(handoff.includes('verifyHandoff'));assert(!handoff.includes('saveSettlement('));assert(!handoff.includes('saveConfig('));assert(!handoff.includes('writeRow('));
assert(bridge.includes("'./settlement-preproduction-handoff.js'"));assert(bridge.includes('data-kts-preproduction-handoff'));assert(sw.includes("'./settlement-preproduction-handoff.js'"));assert(sw.includes('v1.0.62-copy-rates'));assert(identity.includes("'app/settlement-preproduction-handoff.js'"));
assert(bridge.includes("'./settlement-preproduction-offline-verifier.js'"));assert(bridge.includes("'./settlement-preproduction-candidate.js'"));assert(sw.includes("'./settlement-preproduction-offline-verifier.js'"));assert(sw.includes("'./settlement-preproduction-candidate.js'"));assert(identity.includes("'app/settlement-preproduction-offline-verifier.js'"));assert(identity.includes("'app/settlement-preproduction-candidate.js'"));
console.log('settlement-preproduction-handoff-wiring-tests: PASS');
